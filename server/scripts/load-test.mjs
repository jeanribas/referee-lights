#!/usr/bin/env node
// Teste de carga/soak da API contra o BUILD de produção (node dist/index.js),
// sempre em localhost. Sobe a própria API numa porta livre, com banco
// temporário, envio externo desligado — nada sai da máquina.
//
// Uso (dentro de server/, depois de `npm run build`):
//   node scripts/load-test.mjs load   [--rooms=50] [--minutes=10]
//        → carga + tempestade de reconexão + flood de cliente malicioso
//   node scripts/load-test.mjs soak   [--rooms=5]  [--minutes=32]
//        → poucas salas com timer/intervalo rodando; memória, lag, timers,
//          arquivamento de salas abandonadas e crescimento do SQLite
//
// Saída: resumo em JSON no final (latência voto → state:update p50/p95/p99,
// erros, memória/lag do servidor por amostra).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io } from 'socket.io-client';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const args = Object.fromEntries(
  process.argv.slice(3).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);
const scenario = process.argv[2] ?? 'load';
const ROOMS = Number(args.rooms ?? (scenario === 'soak' ? 5 : 50));
const MINUTES = Number(args.minutes ?? (scenario === 'soak' ? 32 : 10));
const PORT = Number(args.port ?? 4444);
const BASE = `http://127.0.0.1:${PORT}`;
const JUDGES = ['left', 'center', 'right'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const log = (...m) => console.error(`[${new Date().toISOString().slice(11, 19)}]`, ...m);

// ---------- servidor ----------
const tmp = mkdtempSync(path.join(tmpdir(), 'rl-load-'));
const dbPath = path.join(tmp, 'analytics.db');
const monitor = [];
if (!existsSync(path.join(serverDir, 'dist/index.js'))) {
  console.error('dist/index.js não existe — rode `npm run build` antes.');
  process.exit(1);
}
const server = spawn(process.execPath, ['--import', path.join(here, 'load-monitor.mjs'), 'dist/index.js'], {
  cwd: serverDir,
  env: {
    ...process.env,
    PORT: String(PORT),
    TELEMETRY_ENABLED: 'false',
    TELEMETRY_URL: 'http://127.0.0.1:9',
    GEO_ENABLED: 'false',
    LOG_LEVEL: 'warn',
    ANALYTICS_DB_PATH: dbPath,
    MASTER_USER: 'load-user',
    MASTER_PASSWORD: 'load-pass',
    MASTER_TOKEN_SECRET: 'load-secret',
    // soak: salas abandonadas expiram em 6 min e saem na varredura de 30 min
    ROOM_TTL_HOURS: scenario === 'soak' ? '0.1' : '24',
    LOAD_MONITOR_MS: '5000'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverLog = '';
server.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) {
    if (line.startsWith('__LOADMON__')) monitor.push({ phase: currentPhase, ...JSON.parse(line.slice(11)) });
    else if (line.trim()) serverLog += line + '\n';
  }
});
server.stderr.on('data', (buf) => (serverLog += buf.toString()));
let serverExited = null;
server.on('exit', (code) => (serverExited = code));

async function waitHealth() {
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error('API não subiu');
}

async function post(p, body) {
  const r = await fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  return r.json();
}

let adminToken = '';
async function activeRooms() {
  if (!adminToken) adminToken = (await post('/master/auth', { user: 'load-user', password: 'load-pass' })).token;
  const r = await fetch(`${BASE}/master/active`, { headers: { authorization: `Bearer ${adminToken}` } });
  return (await r.json()).rooms.length;
}

// ---------- métricas ----------
let currentPhase = 'boot';
const latencies = {}; // fase → ms[]
const errors = {};
function recordLatency(ms) {
  (latencies[currentPhase] ??= []).push(ms);
}
function recordError(kind) {
  const key = `${currentPhase}:${kind}`;
  errors[key] = (errors[key] ?? 0) + 1;
}
function pct(arr, p) {
  if (!arr?.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(1);
}

// ---------- clientes ----------
function connectClient(registration) {
  // reconnection como no frontend: num pico de conexões simultâneas o backlog
  // do listen (macOS: somaxconn=128) recusa algumas, e o cliente real tenta de novo.
  const socket = io(BASE, { transports: ['websocket'], forceNew: true, reconnectionDelay: 500, timeout: 10000 });
  socket.io.on('reconnect_attempt', () => recordError('reconnect_attempt'));
  socket.registration = registration;
  socket.on('connect_error', () => recordError('connect_error'));
  return socket;
}

function register(socket) {
  return new Promise((resolve) => {
    const guard = setTimeout(() => {
      recordError('register:never_connected');
      resolve(false);
    }, 30_000);
    const done = (v) => {
      clearTimeout(guard);
      resolve(v);
    };
    const go = () =>
      socket.timeout(10000).emit('client:register', socket.registration, (err, ack) => {
        if (err || !ack?.ok) recordError(`register:${err ? 'timeout' : ack?.error}`);
        done(!err && ack?.ok);
      });
    if (socket.connected) go();
    else socket.once('connect', go);
  });
}

function emit(socket, event, ...payload) {
  socket.timeout(10000).emit(event, ...payload, (err, ack) => {
    if (err) recordError(`${event}:timeout`);
    else if (ack && 'error' in ack) recordError(`${event}:${ack.error}`);
  });
}

class SimRoom {
  constructor(access, { withInterval }) {
    this.access = access;
    this.withInterval = withInterval;
    this.pending = new Map(); // judge → t0 do voto ainda não visto pelo admin
    this.stopped = false;
    this.cycles = 0;
  }
  roles() {
    const { roomId, adminPin, joinQRCodes } = this.access;
    return [
      ['admin', { role: 'admin', roomId, pin: adminPin }],
      ['display', { role: 'display', roomId, pin: adminPin }],
      ['legend', { role: 'display', roomId, pin: adminPin }], // a legenda registra como display
      ['timer', { role: 'display', roomId, pin: adminPin }],
      ...JUDGES.map((j) => [j, { role: j, roomId, token: joinQRCodes[j].token }])
    ];
  }
  async connectAll() {
    this.clients = Object.fromEntries(this.roles().map(([name, reg]) => [name, connectClient(reg)]));
    this.clients.admin.on('state:update', (s) => this.onAdminState(s));
    for (const name of ['display', 'legend', 'timer']) this.clients[name].on('state:update', (s) => (this.clients[name].last = s));
    for (const j of JUDGES) this.clients[j].on('state:update', () => {});
    const results = await Promise.all(Object.values(this.clients).map(register));
    return results.every(Boolean);
  }
  onAdminState(s) {
    this.last = s;
    for (const [judge, t0] of this.pending) {
      if (s.votes?.[judge] != null) {
        recordLatency(performance.now() - t0);
        this.pending.delete(judge);
      }
    }
  }
  disconnectAll() {
    for (const c of Object.values(this.clients ?? {})) c.disconnect();
  }
  async waitPhase(phase, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !this.stopped) {
      if (this.last?.phase === phase) return true;
      await sleep(50);
    }
    return false;
  }
  async run(untilMs) {
    const { admin, center } = this.clients;
    if (this.withInterval) {
      emit(admin, 'interval:command', { action: 'set', seconds: 600 });
      emit(admin, 'interval:command', { action: 'start' });
    }
    while (Date.now() < untilMs && !this.stopped) {
      // Tentativa: timer de 60s, atleta leva 1-3s, juízes votam, revela, limpa.
      emit(Math.random() < 0.5 ? admin : center, 'timer:command', { action: 'set', seconds: 60 });
      await sleep(rand(1000, 3000));
      emit(admin, 'timer:command', { action: 'stop' });
      for (const j of JUDGES) {
        await sleep(rand(50, 400));
        const red = Math.random() < 0.3;
        this.pending.set(j, performance.now());
        if (red) {
          emit(this.clients[j], 'ref:vote', { vote: 'red' });
          emit(this.clients[j], 'ref:card', { card: 1 + Math.floor(Math.random() * 3) });
        } else {
          emit(this.clients[j], 'ref:vote', { vote: 'white' });
        }
      }
      if (!(await this.waitPhase('revealed', 5000))) recordError('reveal_not_seen');
      await sleep(rand(1500, 2500));
      emit(admin, Math.random() < 0.5 ? 'admin:clear' : 'admin:ready');
      await this.waitPhase('idle', 5000);
      this.cycles += 1;
      if (this.cycles % 10 === 0) {
        emit(admin, 'legend:config', {
          config: { bgColor: '#000000', timerColor: '#FFFFFF', digitMode: 'mmss', showPlaceholders: true, showDashedFrame: true, keepAwake: true }
        });
      }
    }
  }
}

async function createRooms(n) {
  const rooms = [];
  for (let i = 0; i < n; i++) {
    const access = await post('/rooms', {});
    if (!access.roomId) throw new Error(`falha ao criar sala: ${JSON.stringify(access)}`);
    rooms.push(new SimRoom(access, { withInterval: i % 2 === 0 }));
  }
  return rooms;
}

function lastMonitor() {
  return monitor[monitor.length - 1];
}

function phaseSummary(phase) {
  const samples = monitor.filter((m) => m.phase === phase);
  const lat = latencies[phase];
  return {
    votes: lat?.length ?? 0,
    latencyMs: { p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: pct(lat, 100) },
    serverRssMB: samples.length ? { first: samples[0].rssMB, last: samples.at(-1).rssMB, max: Math.max(...samples.map((s) => s.rssMB)) } : null,
    serverHeapMB: samples.length ? { first: samples[0].heapUsedMB, last: samples.at(-1).heapUsedMB, max: Math.max(...samples.map((s) => s.heapUsedMB)) } : null,
    eventLoopLagMs: samples.length ? { p99Max: Math.max(...samples.map((s) => s.lagP99ms)), max: Math.max(...samples.map((s) => s.lagMaxMs)) } : null
  };
}

// ---------- cenários ----------
async function scenarioLoad() {
  currentPhase = 'load';
  const rooms = await createRooms(ROOMS);
  const ok = await Promise.all(rooms.map((r) => r.connectAll()));
  log(`${rooms.length} salas, ${rooms.length * 7} clientes; registrados: ${ok.filter(Boolean).length}/${rooms.length}`);
  const until = Date.now() + MINUTES * 60_000;
  const progress = setInterval(() => {
    const m = lastMonitor();
    log(`load: votos=${latencies.load?.length ?? 0} p95=${pct(latencies.load, 95)}ms rss=${m?.rssMB}MB heap=${m?.heapUsedMB}MB lagP99=${m?.lagP99ms}ms`);
  }, 30_000);
  await Promise.all(rooms.map((r) => r.run(until)));
  clearInterval(progress);

  // (b) tempestade de reconexão: todos caem e voltam ao mesmo tempo
  currentPhase = 'storm';
  for (const r of rooms) r.disconnectAll();
  await sleep(500);
  const t0 = performance.now();
  const back = await Promise.all(rooms.map((r) => r.connectAll()));
  const stormMs = performance.now() - t0;
  log(`storm: ${rooms.length * 7} reconexões em ${stormMs.toFixed(0)}ms; salas ok ${back.filter(Boolean).length}/${rooms.length}`);
  const stormUntil = Date.now() + 60_000;
  await Promise.all(rooms.map((r) => r.run(stormUntil)));

  // (c) flood: um admin legítimo de uma sala manda eventos sem parar enquanto
  // as outras salas operam normalmente
  currentPhase = 'flood';
  const victimRoom = rooms[0];
  const attacker = connectClient(victimRoom.roles()[0][1]);
  await register(attacker);
  const junk = connectClient({ role: 'admin', roomId: 'ZZZZ', pin: '0000' });
  let sent = 0;
  let attackerDisconnected = false;
  attacker.on('disconnect', () => (attackerDisconnected = true));
  const floodUntil = Date.now() + 60_000;
  const flooder = (async () => {
    while (Date.now() < floodUntil && attacker.connected) {
      for (let i = 0; i < 200; i++) {
        attacker.emit('admin:ready', () => {});
        attacker.emit('timer:command', { action: 'start' }, () => {});
        junk.emit('ref:vote', { vote: 'white' }, () => {});
        sent += 3;
      }
      await sleep(5);
    }
  })();
  await Promise.all([flooder, ...rooms.slice(1).map((r) => r.run(floodUntil))]);
  log(`flood: ${sent} eventos enviados; agressor desconectado pelo servidor: ${attackerDisconnected}`);
  junk.disconnect();
  attacker.disconnect();
  for (const r of rooms) r.disconnectAll();

  return {
    load: phaseSummary('load'),
    storm: { reconnectMs: Math.round(stormMs), roomsOk: back.filter(Boolean).length, ...phaseSummary('storm') },
    flood: { eventsSent: sent, attackerDisconnected, ...phaseSummary('flood') },
    cycles: rooms.reduce((a, r) => a + r.cycles, 0)
  };
}

async function scenarioSoak() {
  currentPhase = 'soak';
  // salas abandonadas: criadas e nunca usadas — devem ser arquivadas
  const abandoned = await createRooms(20);
  const rooms = await createRooms(ROOMS);
  await Promise.all(rooms.map((r) => r.connectAll()));
  const roomsAtStart = await activeRooms();
  log(`soak: ${rooms.length} salas ativas + ${abandoned.length} abandonadas (active=${roomsAtStart}) por ${MINUTES} min`);
  const until = Date.now() + MINUTES * 60_000;
  const progress = setInterval(() => {
    const m = lastMonitor();
    log(`soak: votos=${latencies.soak?.length ?? 0} rss=${m?.rssMB}MB heap=${m?.heapUsedMB}MB lagP99=${m?.lagP99ms}ms timers=${m?.resources?.Timeout ?? 0} db=${dbSizeKB()}KB`);
  }, 60_000);
  const dbStart = dbSizeKB();
  await Promise.all(rooms.map((r) => r.run(until)));
  clearInterval(progress);
  const roomsAtEnd = await activeRooms();
  const resourcesBusy = lastMonitor()?.resources;
  // tudo cai: timers de salas sem cliente param sozinhos? (timer de 60s)
  for (const r of rooms) {
    emit(r.clients.admin, 'interval:command', { action: 'stop' });
    emit(r.clients.admin, 'timer:command', { action: 'stop' });
  }
  await sleep(1000);
  for (const r of rooms) r.disconnectAll();
  currentPhase = 'idle-after';
  await sleep(15_000);
  const samples = monitor.filter((m) => m.phase === 'soak');
  const half = Math.floor(samples.length / 2);
  const avg = (arr, k) => +(arr.reduce((a, s) => a + s[k], 0) / Math.max(1, arr.length)).toFixed(1);
  return {
    soak: phaseSummary('soak'),
    heapTrendMB: { firstHalfAvg: avg(samples.slice(0, half), 'heapUsedMB'), secondHalfAvg: avg(samples.slice(half), 'heapUsedMB') },
    rssTrendMB: { firstHalfAvg: avg(samples.slice(0, half), 'rssMB'), secondHalfAvg: avg(samples.slice(half), 'rssMB') },
    rooms: { atStart: roomsAtStart, atEnd: roomsAtEnd, abandonedCreated: abandoned.length },
    resourcesWhileBusy: resourcesBusy,
    resourcesIdleAfter: lastMonitor()?.resources,
    dbKB: { start: dbStart, end: dbSizeKB() },
    cycles: rooms.reduce((a, r) => a + r.cycles, 0)
  };
}

function dbSizeKB() {
  let total = 0;
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      total += statSync(dbPath + suffix).size;
    } catch {}
  }
  return Math.round(total / 1024);
}

// ---------- main ----------
let exitCode = 0;
try {
  await waitHealth();
  await sleep(6000); // primeira amostra de base
  const baseline = lastMonitor();
  const result = scenario === 'soak' ? await scenarioSoak() : await scenarioLoad();
  const summary = {
    scenario,
    rooms: ROOMS,
    minutes: MINUTES,
    baseline: baseline && { rssMB: baseline.rssMB, heapUsedMB: baseline.heapUsedMB },
    ...result,
    errors,
    serverCrashed: serverExited !== null,
    serverErrorLines: serverLog.split('\n').filter((l) => /"level":(50|60)|Error|fatal/.test(l)).slice(0, 10)
  };
  console.log(JSON.stringify(summary, null, 2));
  if (summary.serverCrashed) exitCode = 1;
} catch (err) {
  console.error(err);
  console.error(serverLog.slice(-4000));
  exitCode = 1;
} finally {
  server.kill('SIGTERM');
  await sleep(300);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(exitCode);
}
