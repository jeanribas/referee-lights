#!/usr/bin/env node
// Verifica o bundle Windows montado em dist/windows-bundle contra os modos
// de falha que já quebraram releases:
//   1. Binário nativo (better-sqlite3 etc.) compilado para macOS/Linux em vez
//      de Windows → servidor nem sobe.
//   2. URL de API/WS de produção inlinada nos chunks do client (um .env.local
//      esquecido no build) → sala criada na API de produção, socket local,
//      luzes não acendem.
//   3. Estrutura incompleta (falta node.exe, server/dist, standalone do Next,
//      scripts .cmd) → usuário não consegue nem iniciar.
// Roda automaticamente no fim do build-package.mjs; pode rodar avulso:
//   node tools/windows/verify-bundle.mjs

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bundleDir = path.join(rootDir, 'dist', 'windows-bundle');
const zipPath = path.join(rootDir, 'dist', 'referee-lights-windows.zip');

// URLs que NUNCA podem aparecer no client do pacote offline
const FORBIDDEN_IN_CLIENT = [
  'api.refereelights.app',
  'luzes-ipf.assist.com.br',
  'seu-dominio.com'
];

const errors = [];
const warnings = [];
const ok = (msg) => console.log(`  ✅ ${msg}`);

function fail(msg) {
  errors.push(msg);
  console.error(`  ❌ ${msg}`);
}

async function isPE(file) {
  const head = (await readFile(file)).subarray(0, 2).toString('latin1');
  return head === 'MZ';
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

async function checkStructure() {
  const start = errors.length;
  const required = [
    'Iniciar.cmd',
    'Parar.cmd',
    'LEIA-ME.txt',
    'node/node.exe',
    'server/dist/index.js',
    'server/.env',
    'server/package.json',
    'frontend/server.js',
    'frontend/.next/static',
    'frontend/public'
  ];
  for (const rel of required) {
    if (!existsSync(path.join(bundleDir, rel))) fail(`Faltando: ${rel}`);
  }
  if (errors.length === start) ok('Estrutura completa (scripts, node, server, frontend).');
}

async function checkNativeBinaries() {
  const start = errors.length;
  let count = 0;
  for await (const file of walk(path.join(bundleDir, 'server', 'node_modules'))) {
    if (!file.endsWith('.node')) continue;
    count++;
    if (!(await isPE(file))) fail(`Binário nativo NÃO é Windows/PE: ${path.relative(bundleDir, file)}`);
  }
  const sqlite = path.join(bundleDir, 'server', 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
  if (!existsSync(sqlite)) fail('better_sqlite3.node não encontrado no bundle.');
  const nodeExe = path.join(bundleDir, 'node', 'node.exe');
  if (existsSync(nodeExe) && !(await isPE(nodeExe))) fail('node.exe não é um executável Windows.');
  if (errors.length === start) ok(`Binários nativos são todos PE/Windows (${count} arquivos .node verificados).`);
}

async function checkClientEnvLeak() {
  const start = errors.length;
  const staticDir = path.join(bundleDir, 'frontend', '.next', 'static');
  let scanned = 0;
  let sawLocalFallback = false;
  for await (const file of walk(staticDir)) {
    if (!file.endsWith('.js')) continue;
    scanned++;
    const content = await readFile(file, 'utf8');
    for (const bad of FORBIDDEN_IN_CLIENT) {
      if (content.includes(bad)) {
        fail(`URL de produção inlinada no client: "${bad}" em ${path.relative(bundleDir, file)}`);
      }
    }
    if (content.includes(':3333')) sawLocalFallback = true;
  }
  if (scanned === 0) fail('Nenhum chunk JS encontrado em frontend/.next/static.');
  if (!sawLocalFallback) {
    warnings.push('Nenhum chunk contém ":3333" — confirme que o fallback de runtime do config.ts está no build.');
  }
  if (errors.length === start) ok(`Client sem URLs de produção inlinadas (${scanned} chunks verificados).`);
}

async function checkServerEnv() {
  const start = errors.length;
  const env = await readFile(path.join(bundleDir, 'server', '.env'), 'utf8').catch(() => '');
  if (!/^PORT=3333$/m.test(env)) fail('server/.env sem PORT=3333.');
  if (!/^KEY_RELAY_AVAILABLE=true$/m.test(env)) fail('server/.env sem KEY_RELAY_AVAILABLE=true (toggle do Key Relay some do admin).');
  if (errors.length === start) ok('server/.env com PORT e KEY_RELAY_AVAILABLE corretos.');
}

async function checkZip() {
  if (!existsSync(zipPath)) {
    fail('dist/referee-lights-windows.zip não foi gerado.');
    return;
  }
  const mb = (await stat(zipPath)).size / 1024 / 1024;
  if (mb < 25 || mb > 90) fail(`Tamanho do zip suspeito: ${mb.toFixed(1)} MB (esperado ~35–60 MB).`);
  else ok(`Zip gerado: ${mb.toFixed(1)} MB.`);
}

async function main() {
  if (!existsSync(bundleDir)) {
    console.error(`❌ Bundle não encontrado em ${bundleDir}. Rode antes: node tools/windows/build-package.mjs`);
    process.exit(1);
  }
  console.log('🔎 Verificando bundle Windows...');

  await checkStructure();
  await checkNativeBinaries();
  await checkClientEnvLeak();
  await checkServerEnv();
  await checkZip();

  for (const w of warnings) console.warn(`  ⚠️  ${w}`);

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
