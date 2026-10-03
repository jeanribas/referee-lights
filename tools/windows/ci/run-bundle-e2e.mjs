#!/usr/bin/env node
// Executa o pacote EXTRAÍDO e passa por tudo que ele precisa fazer em campo.
// Qualquer arquivo/módulo faltando no pacote aparece aqui (log do server/
// frontend é varrido por "Cannot find module", ENOENT, MODULE_NOT_FOUND...).
//
// Uso: node run-bundle-e2e.mjs <pastaDoPacote> [--node <node.exe>] [--skip-ui]
//   Portas 3333 (API) e 3000 (frontend) precisam estar livres — o client do
//   pacote fala com <host>:3333, como no Windows.
// Nunca fala com produção: envio externo desligado, e no teste da fila local o
// destino é 127.0.0.1:9 (porta fechada).
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundleDir = path.resolve(process.argv[2] ?? '');
const argv = process.argv.slice(3);
const nodeBin = argv.includes('--node') ? argv[argv.indexOf('--node') + 1] : process.execPath;
const skipUi = argv.includes('--skip-ui');
const API = 'http://127.0.0.1:3333';
const WEB = 'http://127.0.0.1:3000';
const serverDir = path.join(bundleDir, 'server');
const frontendDir = path.join(bundleDir, 'frontend');

const BAD_LOG = /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ENOENT|ERR_DLOPEN_FAILED|Failed to open database|uncaughtException|unhandledRejection|socket_handler_error/i;

const procs = [];
const logs = { server: '', frontend: '' };

function start(name, cwd, script, env) {
  const child = spawn(nodeBin, [script], {
    cwd,
    env: { ...process.env, TELEMETRY_ENABLED: 'false', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', (d) => { logs[name] += d; });
  child.stderr.on('data', (d) => { logs[name] += d; });
  procs.push(child);
  return child;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const done = new Promise((r) => child.once('exit', r));
  child.kill();
  await Promise.race([done, new Promise((r) => setTimeout(r, 5000))]);
  if (child.exitCode === null && process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(child.pid), '/f', '/t']); } catch { /* já saiu */ }
  }
}

async function waitOk(url, seconds) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (r.ok) return;
    } catch { /* subindo */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`timeout esperando ${url}\n--- server ---\n${logs.server.slice(-3000)}\n--- frontend ---\n${logs.frontend.slice(-3000)}`);
}

function step(cmd, args, label) {
  console.log(`\n▶ ${label}`);
  execFileSync(cmd, args, { stdio: 'inherit' });
}

const post = async (p, body) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log(`OK ${msg}`);
}

async function main() {
  if (!existsSync(path.join(serverDir, 'dist', 'index.js'))) throw new Error(`pacote inválido em ${bundleDir}`);
  // Estado limpo (dados de execução anterior distorceriam a recuperação)
  await rm(path.join(serverDir, 'data'), { recursive: true, force: true });

  let server = start('server', serverDir, path.join('dist', 'index.js'), {});
  start('frontend', frontendDir, 'server.js', { PORT: '3000', HOSTNAME: '0.0.0.0' });
  await waitOk(`${API}/health`, 60);
  await waitOk(`${WEB}/admin`, 60);
  console.log(`OK pacote no ar (node ${execFileSync(nodeBin, ['--version']).toString().trim()})`);

  // SQLite: banco criado e gravado
  const db = path.join(serverDir, 'data', 'analytics.db');
  assert(existsSync(db), 'SQLite criado em server/data/analytics.db');
  assert(/telemetria\] desativada/.test(logs.server), 'TELEMETRY_ENABLED=false respeitado (nada sai da máquina)');

  step(process.execPath, [path.join(here, 'smoke-e2e.cjs'), frontendDir, API, '--full', '--malformed'], 'smoke e2e (protocolo, fluxo completo + payload malformado)');
  step(process.execPath, [path.join(here, 'security-check.cjs'), API, '--key-relay'], 'segurança (Key Relay com PIN, lista branca, status)');
  if (!skipUi) step(process.execPath, [path.join(here, 'ui-smoke.mjs'), WEB, frontendDir], 'UI no Chromium (todas as telas)');

  // Recuperação pós-restart: sala criada antes do restart volta com o mesmo PIN
  const room = (await post('/rooms')).body;
  const before = (await post(`/rooms/${room.roomId}/access`, { adminPin: room.adminPin })).status;
  assert(before === 200, `sala ${room.roomId} acessível antes do restart`);
  await new Promise((r) => setTimeout(r, 1500));
  await stop(server);
  server = start('server', serverDir, path.join('dist', 'index.js'), {});
  await waitOk(`${API}/health`, 60);
  const after = await post(`/rooms/${room.roomId}/access`, { adminPin: room.adminPin });
  assert(after.status === 200, `sala ${room.roomId} recuperada após restart (SQLite leitura) — HTTP ${after.status}`);
  assert(statSync(db).size > 0, 'SQLite com dados após restart');

  // Fila local (caminho TELEMETRY_ENABLED=true sem internet):
  // destino é uma porta fechada local; a fila precisa ir para o disco.
  await stop(server);
  const queue = path.join(serverDir, 'data', 'telemetry-queue.json');
  await rm(queue, { force: true });
  server = start('server', serverDir, path.join('dist', 'index.js'), { TELEMETRY_ENABLED: 'true', TELEMETRY_URL: 'http://127.0.0.1:9' });
  await waitOk(`${API}/health`, 60);
  await post('/rooms');
  const deadline = Date.now() + 45_000;
  while (!existsSync(queue) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 1000));
  assert(existsSync(queue), 'fila local gravada em disco quando o destino está fora do ar');
  const q = JSON.parse(readFileSync(queue, 'utf8'));
  assert((q.events?.length ?? 0) + (q.samples?.length ?? 0) > 0, 'fila com eventos pendentes');
  await stop(server);
  // Volta ao modo desligado para o resto
  server = start('server', serverDir, path.join('dist', 'index.js'), {});
  await waitOk(`${API}/health`, 60);

  // Abuso por último: bloqueia o IP local por 10 min
  step(process.execPath, [path.join(here, 'security-check.cjs'), API, '--key-relay', `--abuse=${frontendDir}`], 'abuso (flood, payload grande, força bruta de PIN)');

  const bad = Object.entries(logs).flatMap(([name, text]) =>
    text.split('\n').filter((l) => BAD_LOG.test(l)).map((l) => `${name}: ${l.slice(0, 300)}`)
  );
  if (bad.length) throw new Error(`log com erro de arquivo/módulo/runtime:\n${bad.join('\n')}`);
  console.log('OK logs sem módulo/arquivo faltando');
}

main()
  .then(async () => {
    for (const p of procs) await stop(p);
    console.log('\n✅ run-bundle-e2e: tudo certo');
    process.exit(0);
  })
  .catch(async (e) => {
    for (const p of procs) await stop(p);
    console.error(`\n❌ run-bundle-e2e: ${e.message}`);
    process.exit(1);
  });
