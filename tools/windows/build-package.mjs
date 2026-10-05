#!/usr/bin/env node
// Monta o pacote Windows portátil (dist/windows-bundle + zip).
//
// Regras:
// - só roda numa branch release/* (o pacote NUNCA sai do main);
// - instala com `npm ci` e falha se algum package-lock.json mudar;
// - server vira UM arquivo JS (esbuild) + o binário win-x64 do better-sqlite3:
//   nada de node_modules do server no pacote (era ~3.200 arquivos);
// - frontend = standalone do Next (dependências decididas pelo trace do
//   próprio Next) + .next/static + public. Nenhuma remoção por nome de pasta.
// - UM processo e UMA porta (3000): o server carrega o Next do standalone
//   (FRONTEND_DIR) e serve API, socket e telas juntos.
// - Duas formas, do MESMO conteúdo: o zip (Iniciar.cmd) e o RefereeLights.exe
//   (lançador em Go com server + frontend + node embutidos; precisa do Go).
import { execSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, rm, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync, createWriteStream } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';

// No Windows usa o bsdtar nativo (System32): o tar do Git Bash do runner
// lê "D:\..." como host remoto ("Cannot connect to D: resolve failed").
const TAR = process.platform === 'win32'
  ? `"${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\tar.exe"`
  : 'tar';

const NODE_VERSION = '20.18.1';
const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverDir = path.join(rootDir, 'server');
const frontendDir = path.join(rootDir, 'frontend');
const outputDir = path.join(rootDir, 'dist', 'windows-bundle');
const cacheDir = path.join(rootDir, 'dist', '.cache');
const LOCKFILES = [path.join(serverDir, 'package-lock.json'), path.join(frontendDir, 'package-lock.json')];

function run(command, options = {}) {
  execSync(command, { stdio: 'inherit', ...options });
}

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

function readHeadBranch() {
  try {
    let gitDir = path.join(rootDir, '.git');
    const { statSync, readFileSync } = createRequire(import.meta.url)('node:fs');
    if (statSync(gitDir).isFile()) {
      gitDir = path.resolve(rootDir, readFileSync(gitDir, 'utf8').replace(/^gitdir:\s*/, '').trim());
    }
    const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    return head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : 'HEAD';
  } catch {
    return '';
  }
}

/** O pacote sai SÓ de release/* (nunca do main). */
function assertReleaseBranch() {
  let branch = '';
  try {
    branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
  } catch {
    // git indisponível/quebrado: lê o HEAD direto (funciona em worktree)
    branch = readHeadBranch();
  }
  // No CI vale o que o GitHub informa. Em PR o checkout é o merge ref
  // "<n>/merge": a branch que importa é a ALVO (GITHUB_BASE_REF). Variáveis
  // GITHUB_* não podem ser sobrescritas pelo `env` do workflow.
  if (process.env.GITHUB_ACTIONS === 'true' && (process.env.GITHUB_BASE_REF || process.env.GITHUB_REF_NAME)) {
    branch = process.env.GITHUB_BASE_REF || process.env.GITHUB_REF_NAME;
  }
  else if ((!branch || branch === 'HEAD') && process.env.GITHUB_REF_NAME) branch = process.env.GITHUB_REF_NAME;
  if (!/^release\/[\w.-]+$/.test(branch)) {
    die(`O pacote Windows só é gerado de uma branch release/* (atual: "${branch || 'desconhecida'}").`);
  }
  console.log(`🌿 Branch ${branch}`);
}

async function lockHashes() {
  const out = {};
  for (const f of LOCKFILES) out[f] = createHash('sha256').update(await readFile(f)).digest('hex');
  return out;
}

async function assertLocksUnchanged(before) {
  const after = await lockHashes();
  const changed = LOCKFILES.filter((f) => before[f] !== after[f]);
  if (changed.length) die(`Build alterou lockfile(s): ${changed.map((f) => path.relative(rootDir, f)).join(', ')}. Use npm ci e comite o lock certo.`);
  console.log('🔒 Lockfiles intactos.');
}

async function prepare() {
  console.log('\n📦 Limpando bundle anterior...');
  // Runtime Node já baixado fica no cache (com marcador de versão)
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });
}

async function buildProjects() {
  console.log('\n🔨 Buildando server...');
  run('npm ci', { cwd: serverDir });
  // dist velho pode carregar .js de arquivos já apagados do src
  await rm(path.join(serverDir, 'dist'), { recursive: true, force: true });
  run('npm run build', { cwd: serverDir });

  console.log('\n🔨 Buildando frontend (standalone)...');
  run('npm ci', { cwd: frontendDir });
  await rm(path.join(frontendDir, '.next'), { recursive: true, force: true });
  // URLs de API/WS VAZIAS no build: o client inlina NEXT_PUBLIC_* na
  // compilação e um .env.local esquecido (ex.: criado pelo vercel CLI)
  // apontaria o pacote para a API de produção — sala criada lá, socket
  // local, "sala não encontrada". Vazias, vale o padrão do pacote no
  // config.ts: a origem da própria página (API e telas na mesma porta).
  run('npm run build', {
    cwd: frontendDir,
    env: {
      ...process.env,
      NEXT_DISABLE_ESLINT: '1',
      // Sem home no pacote: BUNDLE_TARGET liga o redirect / -> /admin no
      // next.config.js. O usuário cai direto no app de criação de salas.
      BUNDLE_TARGET: 'windows',
      NEXT_PUBLIC_API_URL: '',
      NEXT_PUBLIC_WS_URL: ''
    }
  });
}

/**
 * Binário win-x64 do better-sqlite3, na versão travada no lock, para a ABI do
 * Node do pacote. Baixado com o prebuild-install do próprio better-sqlite3
 * (não depende de install scripts do npm, que o npm 11 não roda por padrão).
 */
async function fetchWindowsSqliteBinary() {
  const pkgDir = path.join(serverDir, 'node_modules', 'better-sqlite3');
  const { version } = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const cached = path.join(cacheDir, `better_sqlite3-${version}-node${NODE_VERSION}-win32-x64.node`);
  if (existsSync(cached)) {
    console.log(`✅ better_sqlite3.node ${version} win-x64 (cache).`);
    return cached;
  }
  console.log(`📥 Baixando better_sqlite3.node ${version} win-x64 (Node ${NODE_VERSION})...`);
  const tmp = path.join(cacheDir, 'sqlite-win-tmp');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  await cp(path.join(pkgDir, 'package.json'), path.join(tmp, 'package.json'));
  const prebuild = path.join(serverDir, 'node_modules', 'prebuild-install', 'bin.js');
  run(`node "${prebuild}" --platform win32 --arch x64 --runtime node --target ${NODE_VERSION} --verbose`, { cwd: tmp });
  const out = path.join(tmp, 'build', 'Release', 'better_sqlite3.node');
  await assertWindowsBinary(out);
  await cp(out, cached);
  await rm(tmp, { recursive: true, force: true });
  return cached;
}

async function bundleServer() {
  const dest = path.join(outputDir, 'server');
  const distDest = path.join(dest, 'dist');
  await mkdir(distDest, { recursive: true });

  // Um único arquivo: dependências JS embutidas pelo esbuild. O único módulo
  // nativo (better-sqlite3) é carregado pelo caminho explícito
  // BETTER_SQLITE3_BINDING (nativeBinding) — sem `bindings`, sem node_modules.
  // geoip-lite vira stub: ~150MB de base geo sem uso na rede local.
  console.log('📦 Empacotando server em um único arquivo (esbuild)...');
  const requireFromServer = createRequire(path.join(serverDir, 'package.json'));
  const esbuild = requireFromServer('esbuild');
  const result = await esbuild.build({
    entryPoints: [path.join(serverDir, 'src', 'index.ts')],
    outfile: path.join(distDest, 'index.js'),
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
    alias: { 'geoip-lite': path.join(rootDir, 'tools', 'windows', 'geoip-lite-stub.cjs') },
    // Opcionais do ws (aceleradores nativos), carregados em try/catch
    external: ['bufferutil', 'utf-8-validate'],
    // Dependências CJS fazem require() de módulos do Node: num bundle ESM o
    // `require` precisa existir.
    banner: { js: "import{createRequire as __rlCreateRequire}from'node:module';const require=__rlCreateRequire(import.meta.url);" }
  });
  const inputs = Object.keys(result.metafile.inputs);
  if (inputs.some((f) => f.includes('node_modules/geoip-lite/'))) die('geoip-lite real entrou no bundle do server.');

  await cp(await fetchWindowsSqliteBinary(), path.join(distDest, 'better_sqlite3.node'));

  // package.json mínimo: o server lê a versão dele; "type: module" para o .js ESM.
  const pkg = JSON.parse(await readFile(path.join(serverDir, 'package.json'), 'utf8'));
  await writeFile(path.join(dest, 'package.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, private: true, type: 'module'
  }, null, 2) + '\n', 'utf8');

  await writeFile(path.join(dest, '.env'), `PORT=3000
FRONTEND_DIR=../frontend
DATA_DIR=data
CORS_ORIGIN=*
LOG_LEVEL=info
TELEMETRY_ENABLED=true
KEY_RELAY_AVAILABLE=true
BETTER_SQLITE3_BINDING=better_sqlite3.node
`, 'utf8');
}

/** Garante que o binário nativo é PE (Windows). Sai com erro se vier Mach-O/ELF. */
async function assertWindowsBinary(binaryPath) {
  if (!existsSync(binaryPath)) die(`Binário nativo não encontrado: ${binaryPath}`);
  const head = (await readFile(binaryPath)).subarray(0, 2).toString('latin1');
  if (head !== 'MZ') die(`${path.basename(binaryPath)} não é um binário Windows (PE).`);
  console.log('✅ better_sqlite3.node é PE/Windows x64.');
}

async function bundleFrontend() {
  const dest = path.join(outputDir, 'frontend');
  const standaloneSrc = path.join(frontendDir, '.next', 'standalone');

  if (!existsSync(standaloneSrc)) die('Standalone build não encontrado. Verifique output: "standalone" no next.config.js');

  // Standalone = só o que o trace do Next (nft) marcou como necessário em
  // runtime. Nada é removido por nome: foi isso que quebrou pacotes antes.
  await cp(standaloneSrc, dest, { recursive: true });
  await cp(path.join(frontendDir, '.next', 'static'), path.join(dest, '.next', 'static'), { recursive: true });
  await cp(path.join(frontendDir, 'public'), path.join(dest, 'public'), { recursive: true });
}

async function downloadNode() {
  const nodeDir = path.join(outputDir, 'node');
  const cachedExe = path.join(cacheDir, `node-v${NODE_VERSION}-win-x64.exe`);
  // Cache nomeado pela versão: um node.exe de outra versão (outra ABI) com o
  // better_sqlite3.node desta quebraria o pacote na inicialização.
  if (!existsSync(cachedExe)) {
    console.log(`\n⬇️  Baixando Node.js v${NODE_VERSION}...`);
    const zipPath = path.join(cacheDir, 'node-tmp.zip');
    const tmp = path.join(cacheDir, 'node-tmp');
    await downloadFile(NODE_ZIP_URL, zipPath);
    await rm(tmp, { recursive: true, force: true });
    await mkdir(tmp, { recursive: true });
    run(`${TAR} -xf "${zipPath}" -C "${tmp}"`, { stdio: 'pipe' });
    const exe = path.join(tmp, `node-v${NODE_VERSION}-win-x64`, 'node.exe');
    if (!existsSync(exe)) die('node.exe não encontrado no zip do Node.');
    await cp(exe, cachedExe);
    await rm(tmp, { recursive: true, force: true });
    await rm(zipPath, { force: true });
  } else {
    console.log(`✅ Node.js v${NODE_VERSION} (cache).`);
  }
  // Só o node.exe: npm/npx/corepack, docs e node_modules do zip oficial não
  // são usados pelo Iniciar.cmd.
  await mkdir(nodeDir, { recursive: true });
  await cp(cachedExe, path.join(nodeDir, 'node.exe'));
  await writeFile(path.join(nodeDir, '.node-version'), NODE_VERSION, 'utf8');
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function createScripts() {
  const iniciarCmd = `@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion
cd /d "%~dp0"

if not exist "%~dp0server\\dist\\index.js" (
  cls
  echo.
  echo  ========================================================
  echo   ATENCAO: Extraia o ZIP antes de executar!
  echo  ========================================================
  echo.
  echo   Clique com o botao direito no arquivo .zip
  echo   e escolha "Extrair tudo..." ou "Extract All..."
  echo.
  pause
  exit /b 1
)

set "NODE_DIR=%~dp0node"
if exist "%NODE_DIR%\\node.exe" (
  set "PATH=%NODE_DIR%;%PATH%"
) else (
  where node >nul 2>&1
  if errorlevel 1 (
    echo  Node.js nao encontrado!
    pause
    exit /b 1
  )
)

node --version >nul 2>&1
if errorlevel 1 (
  echo  Erro ao executar Node.js.
  pause
  exit /b 1
)

cls
echo.
echo  ========================================================
echo            REFEREE LIGHTS - Luzes de Arbitragem
echo  ========================================================
echo.

set "LOCAL_IP="
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set "TMPIP=%%a"
  set "TMPIP=!TMPIP: =!"
  if not "!TMPIP!"=="" if not "!TMPIP!"=="127.0.0.1" (
    set "LOCAL_IP=!TMPIP!"
  )
)

echo  Iniciando...
start /min "Referee-Server" cmd /k "cd /d "%~dp0server" && node dist\\index.js"
ping -n 6 127.0.0.1 >nul

echo.
echo  ========================================================
echo   Plataforma rodando!
echo.
echo   Acesse no navegador:
echo   http://localhost:3000/admin
if defined LOCAL_IP (
echo.
echo   Dispositivos na rede:
echo   http://!LOCAL_IP!:3000
)
echo.
echo   Crie uma sessao e compartilhe os QR Codes
echo   com os arbitros.
echo.
echo   O Key Relay pode ser ativado pelo painel admin.
echo  ========================================================
echo.

start "" "http://localhost:3000/admin"

echo  Pressione qualquer tecla para encerrar tudo.
pause >nul

taskkill /fi "WINDOWTITLE eq Referee-Server*" /f >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
`;

  const pararCmd = `@echo off
taskkill /fi "WINDOWTITLE eq Referee-Server*" /f >nul 2>&1
powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force -ErrorAction SilentlyContinue }" >nul 2>&1
echo Servicos encerrados.
ping -n 3 127.0.0.1 >nul
`;

  // .cmd com CRLF: com LF o cmd.exe perde caracteres ao interpretar o arquivo.
  const crlf = (t) => t.replace(/\r?\n/g, '\r\n');
  await writeFile(path.join(outputDir, 'Iniciar.cmd'), crlf(iniciarCmd), 'utf8');
  await writeFile(path.join(outputDir, 'Parar.cmd'), crlf(pararCmd), 'utf8');

  await writeFile(path.join(outputDir, 'LEIA-ME.txt'), `REFEREE LIGHTS - Luzes de Arbitragem

COMO USAR:
1. Extraia todo o conteudo do ZIP para uma pasta
2. De duplo-clique em "Iniciar.cmd"
3. O navegador abre direto no painel de criacao de salas
4. Crie uma sessao e compartilhe os QR Codes com os arbitros

Para encerrar: pressione qualquer tecla na janela do Iniciar
ou de duplo-clique em "Parar.cmd"

REDE: todos os dispositivos devem estar na mesma rede Wi-Fi.
Funciona sem internet.

O aplicativo envia estatisticas de uso e erros para melhoria
do produto. Para desativar, troque TELEMETRY_ENABLED
para false em "server\\.env" e reinicie.

GitHub: https://github.com/jeanribas/referee-lights
Site: https://refereelights.app
Contato: contato@assist.com.br
`, 'utf8');
}

const launcherDir = path.join(rootDir, 'tools', 'windows', 'launcher');
const exePath = path.join(rootDir, 'dist', 'RefereeLights.exe');

/**
 * RefereeLights.exe: payload (server + frontend + node.exe, tar.zst) embutido
 * no lançador Go. Subsistema GUI (sem console), ícone e versão no recurso do
 * exe. Sem UPX (principal causa de falso positivo de antivírus).
 */
async function buildExe() {
  console.log('\n🧩 Gerando RefereeLights.exe...');
  try {
    execFileSync('go', ['version'], { stdio: 'pipe' });
  } catch {
    die('Go não encontrado: o RefereeLights.exe precisa do Go (https://go.dev/dl).');
  }
  const { version } = JSON.parse(await readFile(path.join(serverDir, 'package.json'), 'utf8'));
  const goEnv = { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' };
  run(`go run ./cmd/mkpayload -src "${outputDir}" -out payload.tar.zst`, { cwd: launcherDir, env: { ...process.env, GOOS: '', GOARCH: '' } });
  await rm(path.join(launcherDir, 'rsrc_windows_amd64.syso'), { force: true });
  run([
    'go run github.com/tc-hib/go-winres@v0.3.3 simply --arch amd64 --manifest gui',
    // Ícone multi-tamanho (logo completa ≥48px, quadrados ≤32px):
    // tools/windows/icon/make-icon.mjs
    `--icon "${path.join(launcherDir, 'app.ico')}"`,
    `--product-version ${version}.0 --file-version ${version}.0`,
    '--product-name "Referee Lights" --file-description "Referee Lights"',
    '--copyright "Assist" --original-filename RefereeLights.exe'
  ].join(' '), { cwd: launcherDir, env: { ...process.env, GOOS: '', GOARCH: '' } });
  // Canal de atualização embutido: builds de teste (padrão) seguem o
  // pre-release "teste"; o workflow de release por tag usa "stable".
  const channel = process.env.RL_CHANNEL || 'teste';
  if (!['teste', 'stable'].includes(channel)) die(`RL_CHANNEL inválido: ${channel}`);
  let build = (process.env.GITHUB_SHA ?? '').slice(0, 12);
  if (!build) {
    try { build = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim(); } catch { build = 'local'; }
  }
  const ldflags = [
    '-s -w -H=windowsgui',
    `-X main.version=${version}`, `-X main.nodeVersion=${NODE_VERSION}`,
    `-X main.channel=${channel}`, `-X main.build=${build}`
  ].join(' ');
  run(`go build -trimpath -ldflags "${ldflags}" -o "${exePath}" .`, { cwd: launcherDir, env: goEnv });
  await writeFile(path.join(rootDir, 'dist', 'build-info.json'), JSON.stringify({ version, channel, build, node: NODE_VERSION }, null, 2) + '\n');
  console.log(`   canal ${channel}, build ${build}`);
  await rm(path.join(launcherDir, 'payload.tar.zst'), { force: true });
  console.log(`   ${((await stat(exePath)).size / 1024 / 1024).toFixed(1)} MB → ${exePath}`);
}

async function createZip() {
  const zipPath = path.join(rootDir, 'dist', 'referee-lights-windows.zip');
  console.log('\n🗜️  Gerando referee-lights-windows.zip...');
  await rm(zipPath, { force: true });
  const entries = (await readdir(outputDir)).filter((n) => n !== '.DS_Store');
  if (process.platform === 'win32') {
    // Runner Windows (CI) não tem `zip`; o bsdtar nativo (Win10+) gera zip
    // deflate com nomes UTF-8. Entradas explícitas: sem prefixo "./".
    run(`${TAR} -a -c -f "${zipPath}" ${entries.map((e) => `"${e}"`).join(' ')}`, { cwd: outputDir });
  } else {
    // -X: sem atributos extras de macOS; deflate padrão (-6): tamanho x
    // velocidade de extração equilibrados
    run(`zip -qryX "${zipPath}" ${entries.map((e) => `"${e}"`).join(' ')} -x "*.DS_Store" -x "__MACOSX/*"`, { cwd: outputDir });
  }
  console.log(`   ${((await stat(zipPath)).size / 1024 / 1024).toFixed(1)} MB → ${zipPath}`);
}

async function countFiles(dir) {
  let files = 0;
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = await countFiles(full);
      files += sub.files;
      bytes += sub.bytes;
    } else {
      files += 1;
      bytes += (await stat(full)).size;
    }
  }
  return { files, bytes };
}

async function main() {
  const startTime = Date.now();

  assertReleaseBranch();
  const locks = await lockHashes();
  await prepare();
  await buildProjects();

  console.log('\n📦 Montando bundle...');
  await bundleServer();
  await bundleFrontend();
  await downloadNode();
  await createScripts();
  await createZip();
  await buildExe();
  await assertLocksUnchanged(locks);

  const { files, bytes } = await countFiles(outputDir);
  console.log(`   ${files} arquivos, ${(bytes / 1024 / 1024).toFixed(1)} MB extraído`);

  console.log('\n🔎 Verificando bundle...');
  // No CI o job de build só faz as checagens estáticas + redirect; a execução
  // completa do pacote roda no job de teste, numa máquina limpa.
  const verifyArgs = process.env.BUNDLE_VERIFY_RUNTIME === '0' ? ' --no-runtime' : '';
  run(`node "${path.join(rootDir, 'tools', 'windows', 'verify-bundle.mjs')}"${verifyArgs}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n✅ Pacote pronto em ${outputDir}`);
  console.log(`   Tempo: ${elapsed}s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
