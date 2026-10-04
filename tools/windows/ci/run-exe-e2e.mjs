#!/usr/bin/env node
// Teste do RefereeLights.exe no Windows, como a pessoa usaria:
//   - exe numa pasta com espaço e acento, LOCALAPPDATA isolado;
//   - dados de um zip antigo ao lado → migrados na 1ª execução;
//   - API, socket e telas na :3000 (smoke completo, segurança, UI no Chromium
//     pelo IP da LAN), nada na 3333;
//   - nenhuma janela de console (node, conhost, PowerShell do Key Relay);
//   - instância única (2º duplo-clique não sobe outro);
//   - node morto → lançador reergue e a sala continua; erro do lançador
//     chega ao receptor (canal de erros);
//   - --quit encerra tudo e libera a porta; lançador morto à força leva o
//     node junto (Job Object);
//   - reabrir mantém as salas; porta ocupada → 3001.
//
// Uso: node run-exe-e2e.mjs <RefereeLights.exe> <pastaDoZipExtraído> [--skip-ui]
import { execFileSync, execSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const exeSrc = path.resolve(process.argv[2] ?? '');
const zipDir = path.resolve(process.argv[3] ?? '');
const skipUi = process.argv.includes('--skip-ui');

const root = 'C:\\Testes Árbitro\\Exe — Ação';
const exeDir = path.join(root, 'Referee Lights novo');
const exe = path.join(exeDir, 'RefereeLights.exe');
const lad = path.join(root, 'LocalAppData');
const home = path.join(root, 'home');
const rlRoot = path.join(lad, 'RefereeLights');
const API = 'http://127.0.0.1:3000';
const BAD_LOG = /Cannot find module|MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|ENOENT|ERR_DLOPEN_FAILED|Failed to open database|uncaughtException|unhandledRejection|socket_handler_error|next_handler_error/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log(`OK ${msg}`);
}
const step = (label) => console.log(`\n▶ ${label}`);

function ps(command) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' }).trim();
}
function processes() {
  const out = ps('Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath | ConvertTo-Json -Compress');
  return [].concat(JSON.parse(out || '[]'));
}
const launchers = () => processes().filter((p) => p.Name === 'RefereeLights.exe');
const ourNodes = () => processes().filter((p) => p.Name === 'node.exe' && (p.ExecutablePath ?? '').startsWith(rlRoot));
const listening = (port) => ps(`@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue).Count`) !== '0';

async function waitFor(pred, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await pred()) return true;
    await sleep(500);
  }
  throw new Error(`timeout (${ms / 1000}s): ${label}`);
}
async function healthy(base = API) {
  try {
    const [h, a] = await Promise.all([fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) }), fetch(`${base}/admin`, { signal: AbortSignal.timeout(5000) })]);
    return h.ok && a.ok;
  } catch {
    return false;
  }
}
const post = async (p, body, base = API) => {
  const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

const exeEnv = { ...process.env, LOCALAPPDATA: lad, USERPROFILE: home, RL_NO_BROWSER: '1' };
function startExe(args = []) {
  const child = spawn(exe, args, { env: exeEnv, detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return child;
}

function visibleWindows(rootPid) {
  const out = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'visible-windows.ps1'), '-RootPid', String(rootPid)], { encoding: 'utf8' }).trim();
  return [].concat(JSON.parse(out || '[]'));
}

// Receptor no lugar da API central (canal de erros)
const received = [];
const receiver = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    try { if (req.url === '/telemetry/events') received.push(...(JSON.parse(body).events ?? [])); } catch { /* ignora */ }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});

async function makeLegacyData() {
  // Roda o pacote zip (node embutido) para criar uma sala de verdade no
  // server\data dele, como um usuário da v1.3 teria.
  const legacy = path.join(exeDir, 'Referee Lights antigo');
  cpSync(zipDir, legacy, { recursive: true });
  const serverDir = path.join(legacy, 'server');
  rmSync(path.join(serverDir, 'data'), { recursive: true, force: true });
  const child = spawn(path.join(legacy, 'node', 'node.exe'), [path.join('dist', 'index.js')], {
    cwd: serverDir, env: { ...process.env, TELEMETRY_ENABLED: 'false' }, stdio: 'ignore'
  });
  await waitFor(() => healthy(), 60_000, 'zip antigo no ar');
  const room = (await post('/rooms')).body;
  assert((await post(`/rooms/${room.roomId}/access`, { adminPin: room.adminPin })).status === 200, `zip antigo: sala ${room.roomId} criada`);
  await sleep(1500);
  execSync(`taskkill /pid ${child.pid} /f /t`, { stdio: 'ignore' });
  await waitFor(() => !listening(3000), 15_000, 'zip antigo encerrado');
  return room;
}

async function main() {
  if (!existsSync(exeSrc)) throw new Error(`exe não encontrado: ${exeSrc}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(exeDir, { recursive: true });
  mkdirSync(home, { recursive: true });
  cpSync(exeSrc, exe);
  await new Promise((r) => receiver.listen(0, '127.0.0.1', r));
  const receiverUrl = `http://127.0.0.1:${receiver.address().port}`;

  step('dados de um pacote zip antigo ao lado do exe');
  const legacyRoom = await makeLegacyData();

  // config.env sobrevive a atualizações; aqui aponta o canal para o receptor
  mkdirSync(rlRoot, { recursive: true });
  writeFileSync(path.join(rlRoot, 'config.env'), `TELEMETRY_ENABLED=true\nTELEMETRY_URL=${receiverUrl}\n`);

  step('primeira execução (extração + migração)');
  const t = Date.now();
  startExe();
  await waitFor(() => healthy(), 90_000, 'exe no ar na 3000');
  const firstStart = (Date.now() - t) / 1000;
  console.log(`   no ar em ${firstStart.toFixed(1)} s (1ª execução, com extração)`);
  assert(firstStart < 60, `1ª execução abre em menos de 60 s (${firstStart.toFixed(1)} s)`);
  assert((await post(`/rooms/${legacyRoom.roomId}/access`, { adminPin: legacyRoom.adminPin })).status === 200,
    `sala ${legacyRoom.roomId} do zip antigo migrada com o mesmo PIN`);
  assert(existsSync(path.join(rlRoot, 'data', '.migrated-from')), 'marcador .migrated-from gravado');
  assert(existsSync(path.join(exeDir, 'Referee Lights antigo', 'server', 'data', 'analytics.db')), 'dados do zip antigo continuam lá (cópia, não movidos)');
  assert(!listening(3333), 'nada escutando na 3333');

  step('processos e janelas');
  let [launcher] = launchers();
  assert(launchers().length === 1, 'um RefereeLights.exe');
  let [node] = ourNodes();
  assert(ourNodes().length === 1 && /runtime\\node-[\d.]+\\node\.exe$/.test(node.ExecutablePath), `um node.exe no caminho estável (${node?.ExecutablePath})`);
  assert(node.ParentProcessId === launcher.ProcessId, 'node é filho do lançador');
  let vis = visibleWindows(launcher.ProcessId);
  assert(vis.length === 0, `nenhuma janela de console (${JSON.stringify(vis)})`);
  const appDirs = readdirSync(path.join(rlRoot, 'app'));
  assert(appDirs.length === 1 && existsSync(path.join(rlRoot, 'app', appDirs[0], '.complete')), `app extraído com marcador (${appDirs[0]})`);
  const frontendDir = path.join(rlRoot, 'app', appDirs[0], 'frontend');

  step('smoke, segurança e UI pelo exe');
  execFileSync(process.execPath, [path.join(here, 'smoke-e2e.cjs'), frontendDir, API, '--full', '--malformed'], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(here, 'security-check.cjs'), API, '--key-relay'], { stdio: 'inherit' });
  if (!skipUi) {
    const ip = Object.values(os.networkInterfaces()).flat().find((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))?.address;
    assert(!!ip, `IP da LAN: ${ip}`);
    execFileSync(process.execPath, [path.join(here, 'ui-smoke.mjs'), `http://${ip}:3000`, frontendDir], { stdio: 'inherit' });
  }

  step('Key Relay sem janela de PowerShell');
  {
    const { createRequire } = await import('node:module');
    const { io } = createRequire(path.join(frontendDir, 'package.json'))('socket.io-client');
    const room = (await post('/rooms')).body;
    const r = await post('/key-relay/start', { roomId: room.roomId, adminPin: room.adminPin, validKey: 'F9', invalidKey: 'F10' });
    assert(r.status === 200, 'Key Relay ligado com o PIN');
    const conn = (reg) => new Promise((res, rej) => {
      const s = io(API, { transports: ['websocket'], reconnection: false });
      s.on('connect_error', rej);
      s.on('connect', () => s.emit('client:register', reg, (x) => (x?.ok ? res(s) : rej(new Error(JSON.stringify(x))))));
    });
    const admin = await conn({ role: 'admin', roomId: room.roomId, pin: room.adminPin });
    const refs = await Promise.all(['left', 'center', 'right'].map((j) => conn({ role: j, roomId: room.roomId, token: room.joinQRCodes[j].token })));
    const seen = [];
    for (let round = 0; round < 3; round++) {
      admin.emit('admin:ready');
      for (const s of refs) s.emit('ref:vote', { vote: round % 2 ? 'red' : 'white' });
      admin.emit('admin:release');
      // Amostra janelas enquanto o PowerShell envia a tecla
      for (let i = 0; i < 6; i++) {
        seen.push(...visibleWindows(launcher.ProcessId));
        await sleep(250);
      }
      admin.emit('admin:clear');
      await sleep(500);
    }
    const spawned = processes().filter((p) => p.Name === 'powershell.exe').length;
    console.log(`   PowerShell(s) vivos agora: ${spawned}`);
    assert(seen.length === 0, `nenhuma janela durante 3 envios de tecla (${JSON.stringify(seen.slice(0, 3))})`);
    for (const s of [admin, ...refs]) s.close();
    await post('/key-relay/stop', { roomId: room.roomId, adminPin: room.adminPin });
  }

  step('segunda execução não sobe outra instância');
  startExe();
  await sleep(4000);
  assert(launchers().length === 1, 'continua um único RefereeLights.exe');
  assert(ourNodes().length === 1, 'continua um único node');

  step('node morto → lançador reergue, sala continua, erro chega ao canal');
  await post('/client-errors', { kind: 'TypeError', message: 'erro de tela pelo exe', screen: 'admin' });
  execSync(`taskkill /pid ${node.ProcessId} /f`, { stdio: 'ignore' });
  await sleep(1000);
  await waitFor(() => healthy(), 60_000, 'server de volta após matar o node');
  const [node2] = ourNodes();
  assert(node2 && node2.ProcessId !== node.ProcessId, `node novo (pid ${node2?.ProcessId})`);
  assert((await post(`/rooms/${legacyRoom.roomId}/access`, { adminPin: legacyRoom.adminPin })).status === 200, 'sala continua acessível após a queda');
  await waitFor(() => received.some((e) => e.event === 'error' && e.data?.origin === 'launcher' && e.data?.kind === 'node_crash'), 60_000, 'erro node_crash do lançador no receptor');
  const crash = received.find((e) => e.data?.kind === 'node_crash');
  assert(/Windows \d+/.test(crash.data.userAgent ?? ''), `erro do lançador leva a versão do Windows (${crash.data.userAgent})`);
  await waitFor(() => received.some((e) => e.data?.origin === 'ui'), 30_000, 'erro de tela no receptor');
  assert(true, 'erros do lançador e das telas chegaram pelo mesmo canal');
  node = node2;

  step('--quit encerra tudo e libera a porta');
  startExe(['--quit']);
  await waitFor(() => launchers().length === 0 && ourNodes().length === 0 && !listening(3000), 20_000, 'lançador e node encerrados, porta livre');
  assert(true, 'Sair libera a porta 3000');

  step('reabrir: salas continuam, sem nova migração nem nova extração');
  startExe();
  await waitFor(() => healthy(), 60_000, 'exe no ar de novo');
  assert((await post(`/rooms/${legacyRoom.roomId}/access`, { adminPin: legacyRoom.adminPin })).status === 200, 'sala continua após reabrir');
  assert(readdirSync(path.join(rlRoot, 'app')).length === 1, 'mesma pasta de versão reaproveitada');
  for (const f of ['launcher.log', 'server.log']) assert(existsSync(path.join(rlRoot, 'logs', f)), `logs\\${f}`);

  step('lançador morto à força leva o node junto (Job Object)');
  [launcher] = launchers();
  execSync(`taskkill /pid ${launcher.ProcessId} /f`, { stdio: 'ignore' });
  await waitFor(() => ourNodes().length === 0 && !listening(3000), 15_000, 'node encerrado junto com o lançador');
  assert(true, 'sem node órfão');

  step('porta 3000 ocupada → 3001');
  const blocker = net.createServer().listen(3000, '0.0.0.0');
  await new Promise((r) => blocker.once('listening', r));
  startExe();
  await waitFor(() => healthy('http://127.0.0.1:3001'), 60_000, 'exe na 3001');
  const state = JSON.parse(readFileSync(path.join(rlRoot, 'data', 'launcher.json'), 'utf8'));
  assert(state.port === 3001, 'porta 3001 gravada em launcher.json');
  startExe(['--quit']);
  await waitFor(() => launchers().length === 0 && ourNodes().length === 0, 20_000, 'encerrado');
  blocker.close();

  step('logs');
  const logText = readdirSync(path.join(rlRoot, 'logs')).map((f) => readFileSync(path.join(rlRoot, 'logs', f), 'utf8')).join('\n');
  const bad = logText.split('\n').filter((l) => BAD_LOG.test(l));
  assert(bad.length === 0, `logs sem erro de módulo/arquivo/runtime${bad.length ? `:\n${bad.slice(0, 5).join('\n')}` : ''}`);
}

main()
  .then(() => {
    receiver.close();
    console.log('\n✅ run-exe-e2e: tudo certo');
    process.exit(0);
  })
  .catch((e) => {
    console.error(`\n❌ run-exe-e2e: ${e.message}`);
    try {
      for (const f of ['launcher.log', 'server.log']) {
        const p = path.join(rlRoot, 'logs', f);
        if (existsSync(p)) console.error(`--- ${f} ---\n${readFileSync(p, 'utf8').slice(-4000)}`);
      }
    } catch { /* sem logs */ }
    try { for (const l of launchers()) execSync(`taskkill /pid ${l.ProcessId} /f /t`, { stdio: 'ignore' }); } catch { /* nada */ }
    receiver.close();
    process.exit(1);
  });
