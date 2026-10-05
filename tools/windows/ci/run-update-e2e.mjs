#!/usr/bin/env node
// Canal de atualização do RefereeLights.exe, de ponta a ponta no Windows:
// compila 3 versões do lançador com uma chave de TESTE (1.90.0 boa, 1.91.0
// boa, 1.92.0 quebrada) e serve manifestos assinados num "GitHub" local.
//   - sem manifesto (offline): início não atrasa;
//   - 1.91.0 publicada → baixada e conferida → aviso no /admin;
//   - "Atualizar agora" (pedido da pessoa) troca na hora, mesmo com juiz
//     conectado: fecha tudo e encerra as sessões; instance.id preservado;
//   - hash adulterado e assinatura de outra chave → recusados;
//   - 1.92.0 quebrada → troca, não fica saudável em 60 s → volta a 1.91.0
//     (funcionando) e marca 1.92.0 como ruim (não é oferecida de novo).
//
// Uso: node run-update-e2e.mjs <pastaDoZipExtraído>
// (fora do Windows roda o mesmo roteiro com um pacote de desenvolvimento
// que tenha node/node da plataforma — útil antes de mandar para o CI)
import { execFileSync, execSync, spawn } from 'node:child_process';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const launcherDir = path.resolve(here, '..', 'launcher');
const zipDir = path.resolve(process.argv[2] ?? '');
const WIN = process.platform === 'win32';
const root = WIN ? 'C:\\Testes Árbitro\\Atualização — Ação' : path.join(os.tmpdir(), 'Testes Árbitro', 'Atualização — Ação');
const work = path.join(root, 'build');
const installDir = path.join(root, 'Referee Lights');
const exe = path.join(installDir, 'RefereeLights.exe');
const lad = path.join(root, 'LocalAppData');
const rlRoot = path.join(lad, 'RefereeLights');
const API = 'http://127.0.0.1:3000';
const NODE_VERSION = readFileSync(path.join(here, '..', 'build-package.mjs'), 'utf8').match(/NODE_VERSION = '([\d.]+)'/)[1];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log(`OK ${msg}`);
}
const step = (label) => console.log(`\n▶ ${label}`);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function ps(command) {
  return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' }).trim();
}
function launchers() {
  if (!WIN) {
    return execSync('ps -axo pid=,command=', { encoding: 'utf8' }).split('\n')
      .map((l) => l.trim().match(/^(\d+)\s+(.*)$/)).filter((m) => m && m[2].startsWith(installDir))
      .map((m) => ({ ProcessId: Number(m[1]), ExecutablePath: m[2] }));
  }
  const out = ps(`Get-CimInstance Win32_Process -Filter "Name like 'RefereeLights%'" | Select-Object ProcessId,ExecutablePath | ConvertTo-Json -Compress`);
  return [].concat(JSON.parse(out || '[]'));
}
function kill(pid) {
  if (WIN) execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' });
  else process.kill(pid, 'SIGTERM'); // fora do Windows não há Job Object: TERM encerra o node junto
}
async function waitFor(pred, ms, label) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    try { if (await pred()) return; } catch { /* ainda não */ }
    await sleep(500);
  }
  throw new Error(`timeout (${ms / 1000}s): ${label}`);
}
async function healthy() {
  try {
    const [h, a] = await Promise.all([fetch(`${API}/health`), fetch(`${API}/admin`)]);
    return h.ok && a.ok;
  } catch { return false; }
}
const updateView = async () => (await fetch(`${API}/app-update`)).json();
const updateAction = async (action) =>
  (await fetch(`${API}/app-update/${action}`, { method: 'POST', headers: { Origin: API } })).json();
const post = async (p, body) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

// --- chaves de teste --------------------------------------------------------
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubB64 = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
const other = generateKeyPairSync('ed25519').privateKey;

// --- builds -----------------------------------------------------------------
function buildExe(version, payloadSrc) {
  execFileSync('go', ['run', './cmd/mkpayload', '-src', payloadSrc, '-out', 'payload.tar.zst'], { cwd: launcherDir, stdio: 'inherit' });
  const out = path.join(work, `RefereeLights-${version}.exe`);
  const ldflags = `-s -w ${WIN ? '-H=windowsgui ' : ''}-X main.version=${version} -X main.nodeVersion=${NODE_VERSION} -X main.channel=teste -X main.build=b${version} -X main.updatePubKeys=${pubB64}`;
  execFileSync('go', ['build', '-trimpath', ...(WIN ? [] : ['-tags', 'embedpayload']), '-ldflags', ldflags, '-o', out, '.'], {
    cwd: launcherDir, stdio: 'inherit', env: WIN ? { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' } : process.env
  });
  rmSync(path.join(launcherDir, 'payload.tar.zst'), { force: true });
  return out;
}

// --- "GitHub" local -----------------------------------------------------------
const release = { manifest: null, sig: null, files: {} };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/manifest-teste.json' && release.manifest) return res.end(release.manifest);
  if (url === '/manifest-teste.json.sig' && release.sig) return res.end(release.sig);
  if (url.startsWith('/exe/') && release.files[url]) return res.end(release.files[url]);
  res.writeHead(404);
  res.end();
});
let base = '';
function publish(version, exePath, { key = privateKey, hash } = {}) {
  const buf = readFileSync(exePath);
  release.files[`/exe/${version}`] = buf;
  const manifest = Buffer.from(JSON.stringify({
    schema: 1, channel: 'teste', version, build: `b${version}`, published: new Date().toISOString(),
    url: `${base}/exe/${version}`, size: buf.length, sha256: hash ?? sha256(buf), minLauncher: '',
    notes_pt: `Teste ${version}`, notes_en: `Test ${version}`, notes_es: `Prueba ${version}`
  }));
  release.manifest = manifest;
  release.sig = sign(null, manifest, key).toString('base64');
}

function startExe(args = []) {
  const child = spawn(exe, args, {
    detached: true, stdio: 'ignore',
    env: { ...process.env, LOCALAPPDATA: lad, RL_NO_BROWSER: '1', RL_UPDATE_MANIFEST_URL: `${base}/manifest-teste.json`, RL_UPDATE_CHECK_DELAY: '3' }
  });
  child.unref();
}
const state = () => JSON.parse(readFileSync(path.join(rlRoot, 'data', 'launcher.json'), 'utf8'));

async function main() {
  if (await healthy()) throw new Error('já existe algo respondendo na porta 3000: encerre antes do teste');
  rmSync(root, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  mkdirSync(installDir, { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;

  step('compilando 1.90.0, 1.91.0 e 1.92.0 (quebrada) com chave de teste');
  const good = path.join(work, 'payload-bom');
  cpSync(zipDir, good, { recursive: true });
  const broken = path.join(work, 'payload-quebrado');
  cpSync(zipDir, broken, { recursive: true });
  rmSync(path.join(broken, 'server', 'dist', 'index.js'));
  const v190 = buildExe('1.90.0', good);
  const v191 = buildExe('1.91.0', good);
  const v192 = buildExe('1.92.0', broken);

  cpSync(v190, exe);
  mkdirSync(rlRoot, { recursive: true });
  writeFileSync(path.join(rlRoot, 'config.env'), 'TELEMETRY_ENABLED=false\nBUSY_ACTIVITY_MINUTES=0\n');

  step('sem manifesto publicado (como offline): início não atrasa');
  let t = Date.now();
  startExe();
  await waitFor(healthy, 90_000, '1.90.0 no ar');
  console.log(`   no ar em ${((Date.now() - t) / 1000).toFixed(1)} s`);
  await sleep(5000);
  let v = await updateView();
  assert(v.current === '1.90.0' && v.state === 'none', `versão atual 1.90.0, nada a oferecer (${JSON.stringify(v)})`);
  const instanceId = readFileSync(path.join(rlRoot, 'data', 'instance.id'), 'utf8');
  const room = (await post('/rooms')).body;

  step('1.91.0 publicada → baixada, conferida e oferecida no /admin');
  publish('1.91.0', v191);
  await updateAction('check');
  await waitFor(async () => (await updateView()).state === 'ready', 60_000, 'download da 1.91.0');
  v = await updateView();
  assert(v.version === '1.91.0' && v.canApply && v.notes?.pt === 'Teste 1.91.0', 'aviso com versão, notas e botão de atualizar');
  assert(existsSync(`${exe}.new`), 'RefereeLights.exe.new ao lado do exe');
  const forbidden = await fetch(`${API}/app-update/apply`, { method: 'POST', headers: { Origin: 'https://site-malicioso.example' } });
  assert(forbidden.status === 404, 'outro site não consegue disparar a atualização');

  step('juiz conectado: "Atualizar agora" troca na hora e encerra as sessões');
  const appDir = path.join(rlRoot, 'app', readdirSync(path.join(rlRoot, 'app'))[0]);
  const { io } = createRequire(path.join(appDir, 'frontend', 'package.json'))('socket.io-client');
  const judge = io(API, { transports: ['websocket'], reconnection: false });
  await new Promise((r) => judge.on('connect', r));
  await new Promise((r) => judge.emit('client:register', { role: 'left', roomId: room.roomId, token: room.joinQRCodes.left.token }, r));
  const oldPid = launchers()[0]?.ProcessId;
  v = await updateAction('apply');
  assert(v.message === 'restarting', 'troca iniciada');
  await waitFor(async () => (await updateView()).current === '1.91.0', 90_000, '1.91.0 no ar');
  await waitFor(() => state().lastGood === '1.91.0' && !state().pendingVersion, 90_000, 'versão confirmada (lastGood)');
  assert(launchers().length === 1 && launchers()[0].ProcessId !== oldPid, 'um lançador, processo novo');
  assert(sha256(readFileSync(exe)) === sha256(readFileSync(v191)), 'RefereeLights.exe agora é a 1.91.0');
  await waitFor(() => !existsSync(path.join(installDir, 'RefereeLights.old.exe')), 30_000, '.old.exe removido após confirmar');
  judge.close();
  assert((await post(`/rooms/${room.roomId}/access`, { adminPin: room.adminPin })).status === 404, 'sessões encerradas ao atualizar');
  const room2 = (await post('/rooms')).body;
  assert(readFileSync(path.join(rlRoot, 'data', 'instance.id'), 'utf8') === instanceId, 'instance.id preservado');

  step('hash adulterado e assinatura de outra chave: recusados');
  publish('1.92.0', v192, { hash: '0'.repeat(64) });
  await updateAction('check');
  await waitFor(async () => (await updateView()).state === 'error', 60_000, 'download com hash errado recusado');
  assert(!existsSync(`${exe}.new`), 'nada baixado fica no disco');
  publish('1.92.0', v192, { key: other });
  // estado "error" permite nova verificação
  await updateAction('check');
  await sleep(5000);
  v = await updateView();
  assert(v.state !== 'ready', `assinatura de outra chave não vira atualização (${v.state})`);

  step('1.92.0 quebrada: troca, falha em 60 s, volta para a 1.91.0');
  publish('1.92.0', v192);
  await updateAction('check');
  await waitFor(async () => (await updateView()).state === 'ready', 60_000, 'download da 1.92.0');
  await updateAction('apply');
  await waitFor(() => state().pendingVersion === '1.92.0', 30_000, 'troca para 1.92.0 registrada');
  await waitFor(() => state().badVersion === '1.92.0', 150_000, 'rollback marcou 1.92.0 como ruim');
  await waitFor(async () => (await healthy()) && (await updateView()).current === '1.91.0', 90_000, '1.91.0 de volta');
  assert(sha256(readFileSync(exe)) === sha256(readFileSync(v191)), 'RefereeLights.exe voltou a ser a 1.91.0');
  assert((await post(`/rooms/${room2.roomId}/access`, { adminPin: room2.adminPin })).status === 404, 'sessões encerradas pelo "Atualizar" da 1.92.0');
  const room3 = (await post('/rooms')).body;
  assert((await post(`/rooms/${room3.roomId}/access`, { adminPin: room3.adminPin })).status === 200, 'a 1.91.0 restaurada cria sala normalmente');
  await updateAction('check');
  await sleep(5000);
  assert((await updateView()).state === 'none', '1.92.0 não é oferecida de novo');

  step('encerrar');
  if (WIN) startExe(['--quit']);
  else for (const l of launchers()) process.kill(l.ProcessId, 'SIGTERM');
  await waitFor(() => launchers().length === 0, 30_000, 'lançador encerrado');
}

main()
  .then(() => {
    server.close();
    console.log('\n✅ run-update-e2e: tudo certo');
    process.exit(0);
  })
  .catch((e) => {
    console.error(`\n❌ run-update-e2e: ${e.message}`);
    try {
      for (const f of ['launcher.log', 'server.log']) {
        const p = path.join(rlRoot, 'logs', f);
        if (existsSync(p)) console.error(`--- ${f} ---\n${readFileSync(p, 'utf8').slice(-5000)}`);
      }
      console.error(`--- launcher.json ---\n${readFileSync(path.join(rlRoot, 'data', 'launcher.json'), 'utf8')}`);
    } catch { /* sem logs */ }
    try { for (const l of launchers()) kill(l.ProcessId); } catch { /* nada */ }
    server.close();
    process.exit(1);
  });
