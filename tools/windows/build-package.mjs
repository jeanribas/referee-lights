#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import { createWriteStream } from 'node:fs';

const NODE_VERSION = '22.23.2';
const NODE_ZIP_URL = `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverDir = path.join(rootDir, 'server');
const frontendDir = path.join(rootDir, 'frontend');
const outputDir = path.join(rootDir, 'dist', 'windows-bundle');

function run(command, options = {}) {
  execSync(command, { stdio: 'inherit', ...options });
}

async function prepare() {
  console.log('\n📦 Limpando bundle anterior...');
  // Preserva o runtime Node já baixado para não repetir o download de ~30MB
  const nodeDir = path.join(outputDir, 'node');
  const nodeBackup = path.join(rootDir, 'dist', '.node-runtime-keep');
  if (existsSync(path.join(nodeDir, 'node.exe'))) {
    await rm(nodeBackup, { recursive: true, force: true });
    await cp(nodeDir, nodeBackup, { recursive: true });
  }
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  if (existsSync(path.join(nodeBackup, 'node.exe'))) {
    await cp(nodeBackup, nodeDir, { recursive: true });
    await rm(nodeBackup, { recursive: true, force: true });
  }
}

async function buildProjects() {
  console.log('\n🔨 Buildando server...');
  run('npm install', { cwd: serverDir });
  run('npm run build', { cwd: serverDir });

  console.log('\n🔨 Buildando frontend (standalone)...');
  run('npm install', { cwd: frontendDir });
  run('npm run build', {
    cwd: frontendDir,
    // NEXT_PUBLIC_OFFLINE_BUNDLE tira Vercel Analytics e Clarity do build:
    // em LAN sem internet eles não coletam nada, e o import estático do
    // @vercel/analytics quebrava o SSR fora do ambiente de build (v1.3).
    // URLs de API/WS vazias NO BUILD: o client inlina NEXT_PUBLIC_* na
    // compilação, e um .env.local esquecido (ex.: criado pelo vercel CLI)
    // já apontou o bundle para a API de produção — sala criada lá, socket
    // local, 'sala não encontrada'. Vazias, vale o fallback de runtime:
    // http://<host>:3333, que é o correto no pacote.
    env: {
      ...process.env,
      NEXT_DISABLE_ESLINT: '1',
      NEXT_PUBLIC_OFFLINE_BUNDLE: '1',
      NEXT_PUBLIC_API_URL: '',
      NEXT_PUBLIC_WS_URL: ''
    }
  });
}

async function bundleServer() {
  const dest = path.join(outputDir, 'server');
  await mkdir(dest, { recursive: true });

  // Copy built dist
  await cp(path.join(serverDir, 'dist'), path.join(dest, 'dist'), { recursive: true });
  await cp(path.join(serverDir, 'package.json'), path.join(dest, 'package.json'));
  await cp(path.join(serverDir, 'package-lock.json'), path.join(dest, 'package-lock.json'));

  // Create .env
  await writeFile(path.join(dest, '.env'), `PORT=3333
CORS_ORIGIN=*
LOG_LEVEL=info
ANALYTICS_DB_PATH=data/analytics.db
TELEMETRY_ENABLED=true
GEO_ENABLED=false
KEY_RELAY_AVAILABLE=true
`, 'utf8');

  // Install prod deps forçando binários Windows x64 para o Node do bundle,
  // mesmo empacotando a partir de macOS/Linux (prebuild-install respeita
  // npm_config_platform/arch/target ao baixar o .node do better-sqlite3).
  console.log('📥 Instalando deps de produção do server (win-x64)...');
  run('npm ci --omit=dev --ignore-scripts=false', {
    cwd: dest,
    env: {
      ...process.env,
      npm_config_platform: 'win32',
      npm_config_arch: 'x64',
      npm_config_target: NODE_VERSION
    }
  });

  await assertWindowsBinary(path.join(dest, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'));

  // geo: GEO_ENABLED=false no .env — geolite2-redist nem baixa o .mmdb em LAN

  // Remove unnecessary files from node_modules to reduce size
  console.log('🧹 Limpando node_modules do server...');
  await pruneNodeModules(path.join(dest, 'node_modules'));
}

/** Garante que o binário nativo é PE (Windows). Sai com erro se vier Mach-O/ELF. */
async function assertWindowsBinary(binaryPath) {
  if (!existsSync(binaryPath)) {
    console.error(`❌ Binário nativo não encontrado: ${binaryPath}`);
    process.exit(1);
  }
  const { readFile } = await import('node:fs/promises');
  const head = (await readFile(binaryPath)).subarray(0, 2).toString('latin1');
  if (head !== 'MZ') {
    console.error(`❌ ${path.basename(binaryPath)} não é um binário Windows (PE). O prebuild win-x64 não foi baixado.`);
    console.error('   Rode novamente com rede liberada ou copie manualmente o .node de um bundle que funcionava.');
    process.exit(1);
  }
  console.log('✅ better_sqlite3.node é PE/Windows x64.');
}

async function bundleFrontend() {
  const dest = path.join(outputDir, 'frontend');
  const standaloneSrc = path.join(frontendDir, '.next', 'standalone');

  if (!existsSync(standaloneSrc)) {
    console.error('❌ Standalone build não encontrado. Verifique output: "standalone" no next.config.js');
    process.exit(1);
  }

  // Copy standalone output (includes node_modules already traced)
  await cp(standaloneSrc, dest, { recursive: true });

  // Copy static assets and public
  await cp(path.join(frontendDir, '.next', 'static'), path.join(dest, '.next', 'static'), { recursive: true });
  await cp(path.join(frontendDir, 'public'), path.join(dest, 'public'), { recursive: true });

  // Create .env.local
  await writeFile(path.join(dest, '.env.local'), `NEXT_PUBLIC_WS_URL=http://localhost:3333
NEXT_PUBLIC_API_URL=http://localhost:3333
`, 'utf8');
}

async function downloadNode() {
  const nodeDir = path.join(outputDir, 'node');
  const versionMarker = path.join(nodeDir, '.node-version');
  // Cache só vale se for da MESMA versão: um node.exe antigo com a DLL do
  // better-sqlite3 de outra ABI quebra o bundle na inicialização.
  if (existsSync(path.join(nodeDir, 'node.exe'))) {
    const cached = existsSync(versionMarker)
      ? (await readFile(versionMarker, 'utf8')).trim()
      : 'desconhecida';
    if (cached === NODE_VERSION) {
      console.log(`✅ Node.js v${NODE_VERSION} já presente (cache).`);
      return;
    }
    console.log(`♻️  Cache do Node é v${cached}, esperado v${NODE_VERSION} — descartando.`);
    await rm(nodeDir, { recursive: true, force: true });
  }

  console.log(`\n⬇️  Baixando Node.js v${NODE_VERSION}...`);
  const zipPath = path.join(outputDir, 'node-tmp.zip');
  await downloadFile(NODE_ZIP_URL, zipPath);

  console.log('📂 Extraindo Node.js...');
  await mkdir(nodeDir, { recursive: true });
  try {
    run(`tar -xf "${zipPath}" -C "${nodeDir}" --strip-components=1`, { stdio: 'pipe' });
  } catch {
    try {
      run(`unzip -qo "${zipPath}" -d "${outputDir}"`, { stdio: 'pipe' });
      const extracted = `node-v${NODE_VERSION}-win-x64`;
      await cp(path.join(outputDir, extracted), nodeDir, { recursive: true });
      await rm(path.join(outputDir, extracted), { recursive: true, force: true });
    } catch {
      console.error('❌ Não foi possível extrair Node.js.');
    }
  }
  await rm(zipPath, { force: true });
  await writeFile(versionMarker, NODE_VERSION, 'utf8');

  // Remove unnecessary Node files to save space
  const nodeNpmDir = path.join(nodeDir, 'node_modules');
  if (existsSync(nodeNpmDir)) await rm(nodeNpmDir, { recursive: true, force: true });
  for (const f of ['npx', 'npx.cmd', 'npm', 'npm.cmd', 'corepack', 'corepack.cmd']) {
    const fp = path.join(nodeDir, f);
    if (existsSync(fp)) await rm(fp, { force: true });
  }
  // Remove docs, changelogs etc
  for (const f of ['CHANGELOG.md', 'README.md', 'LICENSE']) {
    const fp = path.join(nodeDir, f);
    if (existsSync(fp)) await rm(fp, { force: true });
  }

  console.log('✅ Node.js pronto.');
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

/** Remove docs, tests, source maps, ts files from node_modules */
async function pruneNodeModules(nmDir) {
  if (!existsSync(nmDir)) return;
  const PRUNE_PATTERNS = [
    'README.md', 'readme.md', 'CHANGELOG.md', 'changelog.md', 'HISTORY.md',
    'LICENSE.md', 'license.md', 'LICENSE.txt', 'license.txt',
    '.npmignore', '.eslintrc', '.eslintrc.json', '.eslintrc.js',
    '.prettierrc', '.travis.yml', '.github', 'test', 'tests', '__tests__',
    'docs', 'doc', 'example', 'examples', '.tsbuildinfo'
  ];
  let removed = 0;

  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (PRUNE_PATTERNS.includes(entry.name)) {
        await rm(full, { recursive: true, force: true });
        removed++;
      } else if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.map') || entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
        await rm(full, { force: true });
        removed++;
      }
    }
  }
  await walk(nmDir);
  console.log(`   Removidos ${removed} arquivos desnecessários`);
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

echo  [1/2] Iniciando servidor...
start /min "Referee-Server" cmd /k "cd /d "%~dp0server" && node dist\\index.js"
timeout /t 3 /nobreak >nul

echo  [2/2] Iniciando frontend...
start /min "Referee-Frontend" cmd /k "cd /d "%~dp0frontend" && node server.js"
timeout /t 4 /nobreak >nul

echo.
echo  ========================================================
echo   Plataforma rodando!
echo.
echo   Acesse no navegador:
echo   http://localhost:3000
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
taskkill /fi "WINDOWTITLE eq Referee-Frontend*" /f >nul 2>&1
`;

  const pararCmd = `@echo off
taskkill /fi "WINDOWTITLE eq Referee-Server*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Referee-Frontend*" /f >nul 2>&1
echo Serviços encerrados.
timeout /t 2 >nul
`;

  await writeFile(path.join(outputDir, 'Iniciar.cmd'), iniciarCmd, 'utf8');
  await writeFile(path.join(outputDir, 'Parar.cmd'), pararCmd, 'utf8');

  await writeFile(path.join(outputDir, 'LEIA-ME.txt'), `REFEREE LIGHTS - Luzes de Arbitragem

COMO USAR:
1. Extraia todo o conteudo do ZIP para uma pasta
2. De duplo-clique em "Iniciar.cmd"
3. O navegador abrira automaticamente
4. Crie uma sessao e compartilhe os QR Codes

Para encerrar: pressione qualquer tecla na janela
do Iniciar ou de duplo-clique em "Parar.cmd"

REDE: todos os dispositivos devem estar na mesma rede Wi-Fi

DADOS E PRIVACIDADE
O servidor envia estatisticas de uso para api.refereelights.app,
para sabermos quantas instalacoes existem e como sao usadas.

E enviado a cada 5 minutos:
  - um identificador aleatorio desta instalacao (nao ligado a
    nenhuma pessoa, gerado no primeiro uso)
  - sistema operacional, arquitetura e versao do Node
  - ha quanto tempo o servidor esta ligado
  - contadores: salas ativas, total de sessoes, de conexoes
    e de enderecos IP distintos

NAO e enviado: enderecos IP, nomes de maquina, nomes de
atletas ou arbitros, e nenhuma decisao de arbitragem. Os
resultados das tentativas ficam somente nesta maquina.

Sem internet, os dados ficam numa fila local e sao enviados
quando a conexao voltar.

PARA DESLIGAR: abra "server\\.env" no Bloco de Notas e troque
  TELEMETRY_ENABLED=true
por
  TELEMETRY_ENABLED=false
Depois reinicie pelo "Iniciar.cmd". Nada mais sai desta maquina.

GitHub: https://github.com/jeanribas/referee-lights
Site: https://refereelights.app
Contato: contato@assist.com.br
`, 'utf8');
}

async function createZip() {
  const zipPath = path.join(rootDir, 'dist', 'referee-lights-windows.zip');
  console.log('\n🗜️  Gerando referee-lights-windows.zip...');
  await rm(zipPath, { force: true });
  // -X: sem atributos extras de macOS; exclui lixo de SO
  run(`zip -qryX "${zipPath}" . -x "*.DS_Store" -x "__MACOSX/*"`, { cwd: outputDir });
  const { statSync } = await import('node:fs');
  console.log(`   ${(statSync(zipPath).size / 1024 / 1024).toFixed(1)} MB → ${zipPath}`);
}

async function main() {
  const startTime = Date.now();

  await prepare();
  await buildProjects();

  console.log('\n📦 Montando bundle...');
  await bundleServer();
  await bundleFrontend();
  await downloadNode();
  await createScripts();
  await createZip();

  // Count files and size
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(`\n✅ Pacote pronto em ${outputDir}`);
  console.log(`   Tempo: ${elapsed}s`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
