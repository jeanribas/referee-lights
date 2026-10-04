#!/usr/bin/env node
// Teste de média duração ("soak") contra o app rodando, com TODAS as telas
// abertas num Chromium real, como numa competição:
//   admin, display, legend, timer + os 3 árbitros (cliques reais nos botões).
// Repete o ciclo de uma decisão (pronto → 3 árbitros clicam → revelação →
// limpar) por N minutos; a cada 10 decisões exercita timer, intervalo,
// legenda e idioma. No meio do teste derruba o server (--restart-cmd: o
// lançador do exe precisa reerguer sozinho) e recarrega telas.
//
// Falha se: erro de JS em qualquer tela, console.error fora da janela de
// restart, POST /client-errors vindo das telas, decisão não revelada ou com
// votos errados, tela parada (sem atualização), erro no log do server,
// memória do node ou das telas crescendo além do limite.
//
// Uso: node soak.mjs <baseUrl> <pastaFrontendComSocketIoClient> [--minutes 20]
//        [--restart-cmd "<comando que derruba o node>"] [--server-log <arquivo>]
//        [--node-match <trecho do caminho do node>] [--report <arquivo.json>]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoFrontend = path.resolve(here, '..', '..', '..', 'frontend');
const { chromium } = createRequire(path.join(repoFrontend, 'package.json'))('@playwright/test');
const { io } = createRequire(path.join(path.resolve(process.argv[3]), 'package.json'))('socket.io-client');

const base = process.argv[2];
const argv = process.argv.slice(4);
const opt = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def);
const MINUTES = Number(opt('--minutes', '20'));
const RESTART_CMD = opt('--restart-cmd', '');
const SERVER_LOG = opt('--server-log', '');
const NODE_MATCH = opt('--node-match', '');
const REPORT = opt('--report', '');
const host = new URL(base).hostname;

const NODE_RSS_GROWTH_MB = 150;
const PAGE_HEAP_GROWTH_MB = 40;
const BAD_LOG = /Cannot find module|MODULE_NOT_FOUND|ENOENT|ERR_DLOPEN_FAILED|uncaughtException|unhandledRejection|socket_handler_error|next_handler_error|"level":50/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const elapsed = () => `${((Date.now() - t0) / 60000).toFixed(1)}min`;
const log = (...a) => console.log(`[${elapsed()}]`, ...a);

const failures = [];
const fail = (msg) => { failures.push(`[${elapsed()}] ${msg}`); console.error(`[${elapsed()}] FALHA ${msg}`); };

// Janela de restart: erros de rede/socket esperados enquanto o node volta
let disruptionUntil = 0;
const inDisruption = () => Date.now() < disruptionUntil;

async function health(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const [h, a] = await Promise.all([fetch(`${base}/health`), fetch(`${base}/admin`)]);
      if (h.ok && a.ok) return true;
    } catch { /* subindo */ }
    await sleep(500);
  }
  return false;
}

// --- memória do node -------------------------------------------------------
function nodeRssMb() {
  if (!NODE_MATCH) return null;
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='node.exe'\\" | Select-Object ExecutablePath,WorkingSetSize | ConvertTo-Json -Compress"`,
        { encoding: 'utf8' }
      );
      const list = [].concat(JSON.parse(out || '[]'));
      const p = list.find((x) => (x.ExecutablePath || '').includes(NODE_MATCH));
      return p ? p.WorkingSetSize / 1024 / 1024 : null;
    }
    const out = execSync('ps -axo rss=,command=', { encoding: 'utf8' });
    const line = out.split('\n').find((l) => l.includes(NODE_MATCH) && l.includes('dist/index.js'));
    return line ? Number(line.trim().split(/\s+/)[0]) / 1024 : null;
  } catch {
    return null;
  }
}

// --- sockets de controle (admin e display de teste) -------------------------
function controlSocket(reg) {
  const s = io(base, { transports: ['websocket'] });
  s.on('connect', () => s.emit('client:register', reg, () => undefined));
  let last = null;
  s.on('state:update', (st) => { last = st; });
  return { s, state: () => last };
}
const ack = (s, ev, ...a) =>
  new Promise((res, rej) => s.timeout(8000).emit(ev, ...a, (e, r) => (e ? rej(e) : r?.error ? rej(new Error(`${ev}: ${r.error}`)) : res(r))));

async function until(ctl, pred, label, ms = 10_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const st = ctl.state();
    if (st && pred(st)) return st;
    await sleep(100);
  }
  throw new Error(`timeout: ${label}`);
}

async function main() {
  if (!(await health())) throw new Error(`app não respondeu em ${base}`);
  const room = await (await fetch(`${base}/rooms`, { method: 'POST' })).json();
  log(`sala ${room.roomId}, ${MINUTES} min`);
  const q = `roomId=${room.roomId}&pin=${room.adminPin}`;
  const screens = {
    admin: `/admin?${q}`,
    display: `/display?${q}`,
    legend: `/legend?${q}`,
    timer: `/timer?${q}`,
    left: `/ref/left?roomId=${room.roomId}&token=${room.joinQRCodes.left.token}`,
    center: `/ref/center?roomId=${room.roomId}&token=${room.joinQRCodes.center.token}`,
    right: `/ref/right?roomId=${room.roomId}&token=${room.joinQRCodes.right.token}`
  };

  const browser = await chromium.launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const pages = {};
  const stats = {};
  for (const [name, p] of Object.entries(screens)) {
    const mobile = ['left', 'center', 'right'].includes(name);
    const context = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
    // Nada sai para a internet
    await context.route('**/*', (route) => (new URL(route.request().url()).hostname === host ? route.continue() : route.abort()));
    const page = await context.newPage();
    stats[name] = { frames: 0, lastFrameAt: Date.now(), wsOpened: 0, heap: [] };
    page.on('pageerror', (e) => fail(`${name}: erro de JS: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error' || inDisruption()) return;
      const text = m.text();
      // Recurso externo bloqueado pelo teste (route.abort) não é erro do app
      if (/ERR_FAILED|net::ERR_ABORTED/.test(text)) return;
      fail(`${name}: console.error: ${text.slice(0, 200)}`);
    });
    page.on('request', (r) => {
      if (r.url().includes('/client-errors') && !inDisruption()) fail(`${name}: tela reportou erro: ${r.postData()?.slice(0, 300)}`);
    });
    page.on('response', (r) => {
      const u = new URL(r.url());
      if (u.hostname === host && r.status() >= 400 && !inDisruption()) fail(`${name}: HTTP ${r.status()} ${u.pathname}`);
    });
    page.on('websocket', (ws) => {
      stats[name].wsOpened += 1;
      ws.on('framereceived', () => { stats[name].frames += 1; stats[name].lastFrameAt = Date.now(); });
    });
    await page.goto(base + p, { waitUntil: 'load' });
    pages[name] = page;
  }
  log('7 telas abertas');

  const admin = controlSocket({ role: 'admin', roomId: room.roomId, pin: room.adminPin });
  const display = controlSocket({ role: 'display', roomId: room.roomId, pin: room.adminPin });
  await until(display, () => true, 'estado inicial no display');

  const sample = async (label) => {
    const rss = nodeRssMb();
    const heaps = {};
    for (const [name, page] of Object.entries(pages)) {
      try {
        heaps[name] = await page.evaluate(() => {
          if (typeof window.gc === 'function') window.gc();
          return performance.memory ? performance.memory.usedJSHeapSize / 1024 / 1024 : null;
        });
      } catch { heaps[name] = null; }
    }
    return { at: elapsed(), label, rss, heaps };
  };

  const samples = [];
  const totalMs = MINUTES * 60_000;
  const restartAt = t0 + totalMs * 0.4;
  const reloadAt = t0 + totalMs * 0.7;
  let restarted = !RESTART_CMD;
  let reloaded = false;
  let decisions = 0;
  let timeouts = 0;
  let nextSampleAt = Date.now() + 60_000;
  let baseline = null;          // 2 min após o início (aquecido)
  let baselineAfterRestart = null;
  let lastBeforeRestart = null;

  while (Date.now() - t0 < totalMs) {
    // --- interrupções planejadas ---
    if (!restarted && Date.now() >= restartAt) {
      restarted = true;
      lastBeforeRestart = await sample('antes do restart');
      samples.push(lastBeforeRestart);
      log(`derrubando o server: ${RESTART_CMD}`);
      disruptionUntil = Date.now() + 90_000;
      const before = Object.fromEntries(Object.entries(stats).map(([n, s]) => [n, s.wsOpened]));
      try { execSync(RESTART_CMD, { stdio: 'inherit' }); } catch (e) { fail(`comando de restart falhou: ${e.message}`); }
      await sleep(1500);
      if (!(await health(60_000))) { fail('server não voltou em 60 s após cair'); break; }
      log('server voltou');
      // Todas as telas reconectam sozinhas (socket novo) em até 45 s
      const deadline = Date.now() + 45_000;
      while (Date.now() < deadline && Object.entries(stats).some(([n, s]) => s.wsOpened <= before[n])) await sleep(500);
      for (const [n, s] of Object.entries(stats)) if (s.wsOpened <= before[n]) fail(`${n}: não reconectou após o restart`);
      const ctlDeadline = Date.now() + 30_000;
      while (Date.now() < ctlDeadline && !(admin.s.connected && display.s.connected)) await sleep(300);
      if (!(admin.s.connected && display.s.connected)) fail('sockets de controle não reconectaram');
      await sleep(1000); // re-register depois do connect
      disruptionUntil = Date.now() + 5_000;
      setTimeout(async () => { baselineAfterRestart = await sample('base pós-restart'); samples.push(baselineAfterRestart); }, 90_000);
    }
    if (!reloaded && Date.now() >= reloadAt) {
      reloaded = true;
      log('recarregando display e legend (operador apertou F5)');
      for (const n of ['display', 'legend']) await pages[n].reload({ waitUntil: 'load' });
    }

    // --- uma decisão pelas telas dos árbitros ---
    try {
      await ack(admin.s, 'admin:ready');
      const want = {};
      for (const judge of ['left', 'center', 'right']) {
        const white = Math.random() < 0.6;
        want[judge] = white ? 'white' : 'red';
        const page = pages[judge];
        const btn = white ? page.locator('button.bg-white.py-9:visible').first() : page.locator('button.bg-red-500.py-9:visible').first();
        await btn.click({ timeout: 8000 });
        await sleep(100 + Math.random() * 300);
      }
      await ack(admin.s, 'admin:release').catch(() => undefined);
      const st = await until(display, (s) => s.phase === 'revealed', `decisão ${decisions + 1} revelada`);
      for (const j of ['left', 'center', 'right']) {
        if (st.votes[j] !== want[j]) fail(`decisão ${decisions + 1}: ${j} clicou ${want[j]} mas o display mostra ${st.votes[j]}`);
      }
      decisions += 1;
      await sleep(800);
      await ack(admin.s, 'admin:clear');
      await until(display, (s) => s.phase === 'idle', 'limpar');
      await sleep(300); // telas dos árbitros recebem o "limpar" junto
    } catch (e) {
      if (inDisruption()) { await sleep(1000); continue; }
      timeouts += 1;
      fail(`ciclo da decisão ${decisions + 1}: ${e.message}`);
      if (timeouts > 5) break;
      await ack(admin.s, 'admin:clear').catch(() => undefined);
    }

    // --- a cada 10 decisões: timer, intervalo, legenda, idioma ---
    if (decisions > 0 && decisions % 10 === 0) {
      try {
        await ack(admin.s, 'timer:command', { action: 'set', seconds: 60 });
        await until(display, (s) => s.running, 'timer rodando');
        await sleep(1500);
        await ack(admin.s, 'timer:command', { action: 'stop' });
        await ack(admin.s, 'timer:command', { action: 'reset' });
        await ack(admin.s, 'interval:command', { action: 'set', seconds: 120 });
        await ack(admin.s, 'interval:command', { action: 'show' });
        await ack(admin.s, 'interval:command', { action: 'start' });
        await until(display, (s) => s.intervalVisible && s.intervalRunning, 'intervalo visível');
        await sleep(1000);
        await ack(admin.s, 'interval:command', { action: 'stop' });
        await ack(admin.s, 'interval:command', { action: 'hide' });
        const bg = decisions % 20 === 0 ? '#00ff00' : '#000000';
        await ack(admin.s, 'legend:config', { config: { bgColor: bg, timerColor: '#ffffff', digitMode: 'mmss', showPlaceholders: true, showDashedFrame: true, keepAwake: true } });
        await until(display, (s) => s.legendConfig?.bgColor === bg, 'legenda aplicada');
        const loc = decisions % 20 === 0 ? 'en-US' : 'pt-BR';
        await ack(admin.s, 'locale:change', { locale: loc });
        await until(display, (s) => s.locale === loc, `idioma ${loc}`);
      } catch (e) {
        if (!inDisruption()) fail(`extras após ${decisions} decisões: ${e.message}`);
      }
    }

    // --- telas vivas e memória ---
    if (Date.now() >= nextSampleAt) {
      nextSampleAt = Date.now() + 60_000;
      const s = await sample('minuto');
      samples.push(s);
      if (!baseline && Date.now() - t0 >= 120_000 && !inDisruption() && (!lastBeforeRestart)) baseline = s;
      if (!inDisruption()) {
        for (const [n, st] of Object.entries(stats)) {
          if (Date.now() - st.lastFrameAt > 45_000) fail(`${n}: tela sem atualização há ${Math.round((Date.now() - st.lastFrameAt) / 1000)} s`);
        }
      }
      log(`${decisions} decisões; node ${s.rss?.toFixed(0) ?? '?'} MB; telas ${Object.entries(s.heaps).map(([n, h]) => `${n}=${h?.toFixed(1) ?? '?'}`).join(' ')}`);
    }
  }

  const final = await sample('final');
  samples.push(final);

  // --- memória: crescimento aquecido → fim (e antes/depois do restart) ---
  const growth = (a, b) => (a?.rss != null && b?.rss != null ? b.rss - a.rss : null);
  const segs = lastBeforeRestart
    ? [[baseline, lastBeforeRestart, 'até o restart'], [baselineAfterRestart, final, 'após o restart']]
    : [[baseline, final, 'teste todo']];
  for (const [a, b, label] of segs) {
    const g = growth(a, b);
    if (g != null && g > NODE_RSS_GROWTH_MB) fail(`node cresceu ${g.toFixed(0)} MB (${label}; limite ${NODE_RSS_GROWTH_MB})`);
  }
  const heapBase = baseline ?? samples[0];
  for (const n of ['admin', 'timer', 'left', 'center', 'right']) {
    const a = heapBase?.heaps?.[n];
    const b = final.heaps[n];
    if (a != null && b != null && b - a > PAGE_HEAP_GROWTH_MB) fail(`${n}: memória da tela cresceu ${(b - a).toFixed(1)} MB (limite ${PAGE_HEAP_GROWTH_MB})`);
  }

  // --- log do server ---
  if (SERVER_LOG && existsSync(SERVER_LOG)) {
    const bad = readFileSync(SERVER_LOG, 'utf8').split('\n').filter((l) => BAD_LOG.test(l));
    for (const l of bad.slice(0, 10)) fail(`log do server: ${l.slice(0, 250)}`);
  }

  if (decisions < MINUTES * 5) fail(`poucas decisões concluídas: ${decisions} em ${MINUTES} min`);

  admin.s.close();
  display.s.close();
  await browser.close();

  const report = { minutes: MINUTES, decisions, timeouts, restarted: !!lastBeforeRestart, failures, samples, wsOpened: Object.fromEntries(Object.entries(stats).map(([n, s]) => [n, s.wsOpened])) };
  if (REPORT) writeFileSync(REPORT, JSON.stringify(report, null, 2));
  log(`${decisions} decisões, ${failures.length} falha(s)`);
  if (failures.length) {
    console.error(`\n❌ soak: ${failures.length} falha(s)\n${failures.slice(0, 40).join('\n')}`);
    process.exit(1);
  }
  console.log(`\n✅ soak: ${MINUTES} min, ${decisions} decisões, todas as telas sem erro`);
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ soak: ${e.stack || e.message}`);
  if (failures.length) console.error(failures.join('\n'));
  process.exit(1);
});
