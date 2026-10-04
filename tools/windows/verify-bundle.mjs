#!/usr/bin/env node
// Verifica o pacote Windows A PARTIR DO ZIP, extraído numa pasta com espaço e
// acento (como o usuário faz), contra os modos de falha que já quebraram
// releases:
//   1. Binário nativo compilado para macOS/Linux em vez de Windows.
//   2. URL de API/WS de produção inlinada nos chunks do client.
//   3. Estrutura incompleta (node.exe, server, standalone, scripts .cmd).
//   4. Raiz (/ e /pt-BR, /en-US, /es-ES) mostrando a home em vez do /admin —
//      testado por HTTP de verdade, não pelo manifest (armadilha 6).
//   5. Arquivo/módulo faltando no pacote: o pacote extraído é EXECUTADO e
//      todas as telas + fluxo completo rodam (ci/run-bundle-e2e.mjs).
//
// Uso: node tools/windows/verify-bundle.mjs [--no-runtime] [--skip-ui] [--keep]
//   --no-runtime  só checagens estáticas + redirect HTTP (não sobe o server)
//   --skip-ui     pula o teste no Chromium (Playwright)
//   --keep        não apaga a pasta de extração no fim
// Fora do Windows o better_sqlite3.node win-x64 é trocado pelo da plataforma
// atual (baixado pelo prebuild-install) só na cópia de teste.

import { execFileSync, execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const zipPath = path.join(rootDir, 'dist', 'referee-lights-windows.zip');
const args = new Set(process.argv.slice(2));

// URLs que NUNCA podem aparecer no client do pacote offline
const FORBIDDEN_IN_CLIENT = ['api.refereelights.app', 'luzes-ipf.assist.com.br', 'seu-dominio.com'];

const errors = [];
const warnings = [];
const ok = (msg) => console.log(`  ✅ ${msg}`);
function fail(msg) {
  errors.push(msg);
  console.error(`  ❌ ${msg}`);
}

async function isPE(file) {
  return (await readFile(file)).subarray(0, 2).toString('latin1') === 'MZ';
}

async function* walk(dir) {
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function extract(dest) {
  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });
  const t0 = Date.now();
  if (process.platform === 'win32') execFileSync(`${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\tar.exe`, ['-xf', zipPath, '-C', dest]); // bsdtar nativo; o do Git Bash lê "D:" como host
  else execFileSync('unzip', ['-q', zipPath, '-d', dest]);
  const ms = Date.now() - t0;
  let files = 0;
  let bytes = 0;
  for await (const f of walk(dest)) {
    files++;
    bytes += (await stat(f)).size;
  }
  const zipMb = (await stat(zipPath)).size / 1024 / 1024;
  ok(`Zip ${zipMb.toFixed(1)} MB extraído em ${(ms / 1000).toFixed(1)}s: ${files} arquivos, ${(bytes / 1024 / 1024).toFixed(1)} MB.`);
  return { files, bytes, zipMb, ms };
}

async function checkStructure(bundleDir) {
  const start = errors.length;
  const required = [
    'Iniciar.cmd', 'Parar.cmd', 'LEIA-ME.txt',
    'node/node.exe',
    'server/dist/index.js', 'server/dist/better_sqlite3.node', 'server/.env', 'server/package.json',
    'frontend/server.js', 'frontend/.next/static', 'frontend/.next/BUILD_ID', 'frontend/public'
  ];
  for (const rel of required) if (!existsSync(path.join(bundleDir, rel))) fail(`Faltando: ${rel}`);
  // Server é um único arquivo: node_modules no server = build antigo/errado
  if (existsSync(path.join(bundleDir, 'server', 'node_modules'))) fail('server/node_modules não deveria existir (server é empacotado pelo esbuild).');
  if (errors.length === start) ok('Estrutura completa (scripts, node, server em arquivo único, frontend).');
}

async function checkNativeBinaries(bundleDir) {
  const start = errors.length;
  let count = 0;
  for await (const file of walk(bundleDir)) {
    if (!file.endsWith('.node')) continue;
    count++;
    if (!(await isPE(file))) fail(`Binário nativo NÃO é Windows/PE: ${path.relative(bundleDir, file)}`);
  }
  const nodeExe = path.join(bundleDir, 'node', 'node.exe');
  if (existsSync(nodeExe) && !(await isPE(nodeExe))) fail('node.exe não é um executável Windows.');
  if (count !== 1) fail(`Esperado exatamente 1 binário .node (better_sqlite3), achei ${count}.`);
  if (errors.length === start) ok(`Binários nativos PE/Windows (${count} .node + node.exe).`);
}

async function checkClientEnvLeak(bundleDir) {
  const start = errors.length;
  let scanned = 0;
  let sawLocalFallback = false;
  for await (const file of walk(path.join(bundleDir, 'frontend', '.next', 'static'))) {
    if (!file.endsWith('.js')) continue;
    scanned++;
    const content = await readFile(file, 'utf8');
    for (const bad of FORBIDDEN_IN_CLIENT) {
      if (content.includes(bad)) fail(`URL de produção inlinada no client: "${bad}" em ${path.relative(bundleDir, file)}`);
    }
    if (content.includes(':3333')) sawLocalFallback = true;
  }
  if (scanned === 0) fail('Nenhum chunk JS encontrado em frontend/.next/static.');
  if (!sawLocalFallback) warnings.push('Nenhum chunk contém ":3333" — confirme o fallback de runtime do config.ts.');
  if (errors.length === start) ok(`Client sem URLs de produção inlinadas (${scanned} chunks).`);
}

async function checkServerEnv(bundleDir) {
  const start = errors.length;
  const env = await readFile(path.join(bundleDir, 'server', '.env'), 'utf8').catch(() => '');
  if (!/^PORT=3333$/m.test(env)) fail('server/.env sem PORT=3333.');
  if (!/^KEY_RELAY_AVAILABLE=true$/m.test(env)) fail('server/.env sem KEY_RELAY_AVAILABLE=true (toggle do Key Relay some do admin).');
  if (!/^BETTER_SQLITE3_BINDING=better_sqlite3\.node$/m.test(env)) fail('server/.env sem BETTER_SQLITE3_BINDING (SQLite não abriria).');
  if (errors.length === start) ok('server/.env com PORT, KEY_RELAY_AVAILABLE e BETTER_SQLITE3_BINDING.');
}

async function waitHttp(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(2000) });
      return r;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`timeout esperando ${url}`);
}

/** Sobe só o frontend (JS puro, roda em qualquer SO) e testa os redirects. */
async function checkRootRedirects(bundleDir) {
  const start = errors.length;
  const port = '3999';
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(bundleDir, 'frontend'),
    env: { ...process.env, PORT: port, HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  try {
    for (const p of ['/', '/pt-BR', '/en-US', '/es-ES']) {
      const r = await waitHttp(`http://127.0.0.1:${port}${p}`, 30);
      const loc = r.headers.get('location') ?? '';
      if (r.status < 300 || r.status >= 400 || !/\/admin$/.test(new URL(loc, 'http://x').pathname)) {
        fail(`${p} deveria redirecionar para /admin (HTTP ${r.status}, location "${loc}").`);
      }
    }
    const admin = await waitHttp(`http://127.0.0.1:${port}/admin`, 10);
    if (admin.status !== 200) fail(`/admin respondeu HTTP ${admin.status}.`);
  } catch (e) {
    fail(`Frontend do pacote não respondeu: ${e.message}\n${log.slice(-2000)}`);
  } finally {
    child.kill();
  }
  if (errors.length === start) ok('/, /pt-BR, /en-US e /es-ES redirecionam para /admin (HTTP real).');
}

/** better_sqlite3.node da plataforma atual para a ABI do node que roda o teste. */
async function hostSqliteBinding() {
  const serverDir = path.join(rootDir, 'server');
  const pkgDir = path.join(serverDir, 'node_modules', 'better-sqlite3');
  const { version } = JSON.parse(await readFile(path.join(pkgDir, 'package.json'), 'utf8'));
  const cacheDir = path.join(rootDir, 'dist', '.cache');
  const cached = path.join(cacheDir, `better_sqlite3-${version}-node${process.versions.node}-${process.platform}-${process.arch}.node`);
  if (existsSync(cached)) return cached;
  const tmp = path.join(cacheDir, 'sqlite-host-tmp');
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  const { cp } = await import('node:fs/promises');
  await cp(path.join(pkgDir, 'package.json'), path.join(tmp, 'package.json'));
  execSync(
    `"${process.execPath}" "${path.join(serverDir, 'node_modules', 'prebuild-install', 'bin.js')}" --runtime node --target ${process.versions.node} --platform ${process.platform} --arch ${process.arch}`,
    { cwd: tmp, stdio: 'inherit' }
  );
  await cp(path.join(tmp, 'build', 'Release', 'better_sqlite3.node'), cached);
  await rm(tmp, { recursive: true, force: true });
  return cached;
}

async function runRuntimeE2E(bundleDir) {
  let nodeBin = path.join(bundleDir, 'node', 'node.exe');
  if (process.platform !== 'win32') {
    // Troca SÓ na cópia de teste: o zip continua com o binário Windows.
    const { cp } = await import('node:fs/promises');
    await cp(await hostSqliteBinding(), path.join(bundleDir, 'server', 'dist', 'better_sqlite3.node'));
    nodeBin = process.execPath;
    console.log(`  ↪ fora do Windows: better_sqlite3.node trocado pelo de ${process.platform}-${process.arch} (node ${process.versions.node}) na cópia de teste.`);
  }
  const e2eArgs = [path.join(rootDir, 'tools', 'windows', 'ci', 'run-bundle-e2e.mjs'), bundleDir, '--node', nodeBin];
  if (args.has('--skip-ui')) e2eArgs.push('--skip-ui');
  try {
    execFileSync(process.execPath, e2eArgs, { stdio: 'inherit' });
    ok('Pacote extraído executado: todas as telas e o fluxo completo passaram.');
  } catch {
    fail('Teste de execução do pacote extraído falhou (ver saída acima).');
  }
}

async function main() {
  if (!existsSync(zipPath)) {
    console.error(`❌ ${path.relative(rootDir, zipPath)} não encontrado. Rode antes: node tools/windows/build-package.mjs`);
    process.exit(1);
  }
  console.log('🔎 Verificando pacote Windows (a partir do zip)...');
  const workDir = path.join(os.tmpdir(), `rl-verify-${process.pid}`);
  const bundleDir = path.join(workDir, 'Pasta com espaço — Árbitros', 'Referee Lights');
  await extract(bundleDir);

  await checkStructure(bundleDir);
  await checkNativeBinaries(bundleDir);
  await checkClientEnvLeak(bundleDir);
  await checkServerEnv(bundleDir);
  await checkRootRedirects(bundleDir);
  if (!args.has('--no-runtime') && errors.length === 0) await runRuntimeE2E(bundleDir);

  for (const w of warnings) console.warn(`  ⚠️  ${w}`);
  if (!args.has('--keep')) await rm(workDir, { recursive: true, force: true });
  else console.log(`  (extração mantida em ${bundleDir})`);

  if (errors.length > 0) {
    console.error(`\n❌ Bundle REPROVADO: ${errors.length} problema(s). NÃO publique este zip.`);
    process.exit(1);
  }
  console.log('\n✅ Bundle aprovado nas verificações automáticas.');
  console.log('   Falta o teste manual no Windows: Iniciar.cmd → criar sessão → luzes acendem nos 3 dispositivos.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
