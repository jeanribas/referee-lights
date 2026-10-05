#!/usr/bin/env node
// Teste de PRESSÃO nas telas dos árbitros, numa sala JÁ ABERTA (ou numa nova).
// Procura travamento: tela que para de responder, clique que não chega,
// reconexão que não volta, tarefa longa no navegador, erro de JS.
//
//  A) latência: clique do árbitro → estado no display (p50/p95/máx)
//  B) rajadas: cliques muito rápidos alternando branco/cartões, toque
//     duplo; o estado final da tela tem que bater com o do servidor
//  C) várias abas por árbitro, F5 em sequência e queda/volta de Wi-Fi
//     (offline simulado): tempo para cada tela voltar
//
// Uso: node stress-ref.mjs <baseUrl> <pastaComSocketIoClient> [--room ABCD --pin 1234] [--minutes 6]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, '..', '..', '..', 'frontend', 'package.json'))('@playwright/test');
const { io } = createRequire(path.join(path.resolve(process.argv[3]), 'package.json'))('socket.io-client');
const base = process.argv[2];
const argv = process.argv.slice(4);
const opt = (n, d) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : d);
const MINUTES = Number(opt('--minutes', '6'));
const host = new URL(base).hostname;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 60000).toFixed(1)}min]`, ...a);
const failures = [];
const fail = (m) => { failures.push(m); console.error('FALHA', m); };
const pct = (arr, p) => { if (!arr.length) return NaN; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

let room;
if (opt('--room')) {
  const r = await fetch(`${base}/rooms/${opt('--room')}/access`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ adminPin: opt('--pin') }) });
  if (!r.ok) throw new Error(`sala ${opt('--room')}: HTTP ${r.status}`);
  room = await r.json();
} else {
  room = await (await fetch(`${base}/rooms`, { method: 'POST' })).json();
}
log(`sala ${room.roomId}`);
const JUDGES = ['left', 'center', 'right'];
const refUrl = (j) => `${base}/ref/${j}?roomId=${room.roomId}&token=${room.joinQRCodes[j].token}`;

// Sockets de controle (admin e display de teste)
const ctl = (reg) => {
  const s = io(base, { transports: ['websocket'] });
  let last = null;
  const listeners = new Set();
  s.on('connect', () => s.emit('client:register', reg, () => undefined));
  s.on('state:update', (st) => { last = st; for (const l of listeners) l(st); });
  return { s, state: () => last, on: (f) => { listeners.add(f); return () => listeners.delete(f); } };
};
const admin = ctl({ role: 'admin', roomId: room.roomId, pin: room.adminPin });
const display = ctl({ role: 'display', roomId: room.roomId, pin: room.adminPin });
const ack = (s, ev, ...a) => new Promise((res) => s.timeout(8000).emit(ev, ...a, () => res()));
const waitState = (pred, ms = 8000) => new Promise((res) => {
  if (display.state() && pred(display.state())) return res(display.state());
  const off = display.on((st) => { if (pred(st)) { off(); clearTimeout(t); res(st); } });
  const t = setTimeout(() => { off(); res(null); }, ms);
});
await waitState(() => true, 10_000);

const browser = await chromium.launch();
const pages = [];
async function openRef(judge, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === host ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const info = { judge, label, ctx, page, errors: 0, wsOpen: 0 };
  page.on('pageerror', (e) => fail(`${label}: erro de JS: ${e.message}`));
  page.on('request', (r) => { if (r.url().includes('/client-errors')) fail(`${label}: tela reportou erro: ${r.postData()?.slice(0, 200)}`); });
  page.on('websocket', () => { info.wsOpen += 1; });
  await page.addInitScript(() => {
    window.__long = [];
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(e.duration); }).observe({ type: 'longtask', buffered: true });
    } catch { /* sem suporte */ }
  });
  await page.goto(refUrl(judge), { waitUntil: 'load' });
  await page.waitForSelector('button.bg-white.py-9:not([disabled])', { timeout: 20_000 });
  pages.push(info);
  return info;
}
const validBtn = (p) => p.page.locator('button.bg-white.py-9:visible').first();
// O botão branco liga/desliga: antes de clicar, a tela tem que mostrar a
// rodada limpa (como o árbitro vê), senão o clique desliga o voto anterior.
const cleared = (p) => p.page.waitForFunction(
  () => ![...document.querySelectorAll('button.py-9')].some((b) => b.className.includes('ring-4')),
  null, { timeout: 8000 }
).catch(() => fail(`${p.label}: tela não mostrou a rodada limpa em 8 s`));
const cardBtn = (p, n) => p.page.locator(`button.py-9:visible`).nth(n); // 0 = branco, 1..3 = cartões

// Tela responde? (thread principal livre)
async function responsive(p, ms = 2000) {
  const t = Date.now();
  try {
    await Promise.race([p.page.evaluate(() => performance.now()), sleep(ms).then(() => { throw new Error('timeout'); })]);
    return Date.now() - t;
  } catch { return Infinity; }
}

const refs = {};
for (const j of JUDGES) refs[j] = await openRef(j, j);
log('3 telas de árbitro abertas');

// ---------------- A) latência ----------------
const lat = [];
const endA = Date.now() + MINUTES * 60_000 * 0.4;
let rounds = 0;
while (Date.now() < endA) {
  await ack(admin.s, 'admin:clear');
  await waitState((s) => s.phase === 'idle' && JUDGES.every((j) => s.votes[j] === null));
  await Promise.all(JUDGES.map((j) => cleared(refs[j])));
  await ack(admin.s, 'admin:ready');
  const want = {};
  for (const j of JUDGES) {
    const white = Math.random() < 0.6;
    want[j] = white ? 'white' : 'red';
    const t = Date.now();
    await (white ? validBtn(refs[j]) : cardBtn(refs[j], 1 + Math.floor(Math.random() * 3))).click({ timeout: 8000 });
    const got = await waitState((s) => s.votes[j] === want[j] || (s.phase === 'revealed' && s.votes[j] === want[j]), 8000);
    if (!got) fail(`latência: clique de ${j} (${want[j]}) não chegou ao display em 8 s`);
    else lat.push(Date.now() - t);
  }
  await ack(admin.s, 'admin:release');
  const rev = await waitState((s) => s.phase === 'revealed', 8000);
  if (!rev) fail(`rodada ${rounds + 1}: não revelou`);
  else for (const j of JUDGES) if (rev.votes[j] !== want[j]) fail(`rodada ${rounds + 1}: ${j} clicou ${want[j]}, display mostra ${rev.votes[j]}`);
  rounds++;
}
log(`A) ${rounds} rodadas, latência clique→display p50=${pct(lat, 50)}ms p95=${pct(lat, 95)}ms máx=${Math.max(...lat)}ms`);

// ---------------- B) rajadas ----------------
const endB = Date.now() + MINUTES * 60_000 * 0.3;
let bursts = 0;
let maxResp = 0;
while (Date.now() < endB) {
  await ack(admin.s, 'admin:clear');
  await waitState((s) => s.phase === 'idle');
  await ack(admin.s, 'admin:ready');
  await Promise.all(JUDGES.map(async (j) => {
    const p = refs[j];
    for (let i = 0; i < 15; i++) {
      const n = Math.floor(Math.random() * 4);
      await cardBtn(p, n).click({ timeout: 8000, delay: 0, noWaitAfter: true }).catch((e) => fail(`${j}: clique travou: ${e.message.split('\n')[0]}`));
      if (Math.random() < 0.3) await cardBtn(p, n).dblclick({ timeout: 8000 }).catch(() => undefined);
    }
  }));
  await sleep(1500); // deixa assentar
  const st = display.state();
  for (const j of JUDGES) {
    const r = await responsive(refs[j]);
    maxResp = Math.max(maxResp, r);
    if (r === Infinity) fail(`${j}: tela não respondeu em 2 s depois da rajada (TRAVOU)`);
    // A tela mostra o mesmo que o servidor? (botão branco ativo ⇔ voto white)
    const whiteActive = await validBtn(refs[j]).evaluate((b) => b.className.includes('ring-4')).catch(() => null);
    if (whiteActive !== null && st && whiteActive !== (st.votes[j] === 'white')) {
      fail(`${j}: depois da rajada a tela mostra branco=${whiteActive} mas o servidor tem ${st.votes[j]}`);
    }
  }
  bursts++;
}
log(`B) ${bursts} rajadas de 15+ cliques por árbitro; pior tempo de resposta da tela ${maxResp}ms`);

// ---------------- C) várias abas, F5, queda de Wi-Fi ----------------
for (const j of JUDGES) for (let k = 2; k <= 3; k++) await openRef(j, `${j}#${k}`);
log(`C) ${pages.length} telas de árbitro abertas (3 por juiz)`);
const reconnect = [];
const endC = Date.now() + MINUTES * 60_000 * 0.3;
let cycles = 0;
while (Date.now() < endC) {
  const p = pages[Math.floor(Math.random() * pages.length)];
  if (Math.random() < 0.5) {
    const t = Date.now();
    await p.page.reload({ waitUntil: 'load' });
    await p.page.waitForSelector('button.bg-white.py-9:not([disabled])', { timeout: 30_000 }).then(() => reconnect.push(Date.now() - t)).catch(() => fail(`${p.label}: não voltou em 30 s após F5`));
  } else {
    await p.ctx.setOffline(true);
    await sleep(2000 + Math.random() * 4000);
    const t = Date.now();
    await p.ctx.setOffline(false);
    await p.page.waitForSelector('button.bg-white.py-9:not([disabled])', { timeout: 30_000 }).then(() => reconnect.push(Date.now() - t)).catch(() => fail(`${p.label}: não reconectou em 30 s após a volta do Wi-Fi`));
  }
  // Uma decisão no meio: a aba que acabou de voltar precisa funcionar
  await ack(admin.s, 'admin:clear');
  await waitState((s) => s.phase === 'idle');
  await ack(admin.s, 'admin:ready');
  await cleared(p);
  await validBtn(p).click({ timeout: 8000 }).catch((e) => fail(`${p.label}: clique após reconexão travou: ${e.message.split('\n')[0]}`));
  const ok = await waitState((s) => s.votes[p.judge] === 'white', 8000);
  if (!ok) fail(`${p.label}: voto após reconexão não chegou`);
  cycles++;
}
log(`C) ${cycles} quedas/F5; tempo para voltar p50=${pct(reconnect, 50)}ms p95=${pct(reconnect, 95)}ms máx=${Math.max(...reconnect)}ms`);

// ---------------- final ----------------
let longTotal = 0;
let longMax = 0;
let longOver1s = 0;
for (const p of pages) {
  const l = await p.page.evaluate(() => window.__long ?? []).catch(() => []);
  longTotal += l.filter((d) => d > 200).length;
  longOver1s += l.filter((d) => d > 1000).length;
  longMax = Math.max(longMax, ...l, 0);
  if (await responsive(p) === Infinity) fail(`${p.label}: tela travada no fim`);
}
log(`tarefas longas >200ms no navegador: ${longTotal} (maior ${Math.round(longMax)}ms; acima de 1 s: ${longOver1s})`);
// Travamento de verdade = repetido ou longo. Um engasgo isolado entre 1 e 2 s
// na VM do CI (2 núcleos com exe + node + 9 abas; antivírus varrendo o pacote)
// reprovava a release com o mesmo código que passou em todos os outros runs e
// no hardware real (05/out: 1,3 s só num run, mesmo artefato).
if (longMax > 2000) fail(`tarefa de ${Math.round(longMax)}ms na tela do árbitro (congelou > 2 s)`);
else if (longOver1s > 1) fail(`${longOver1s} tarefas acima de 1 s nas telas dos árbitros (travamentos repetidos)`);
else if (longOver1s === 1) log(`aviso: um engasgo isolado de ${Math.round(longMax)}ms (tolerado: 1 entre 1 e 2 s)`);
const h = Date.now();
await fetch(`${base}/health`);
log(`servidor respondendo (/health em ${Date.now() - h}ms)`);
await ack(admin.s, 'admin:clear');
admin.s.close();
display.s.close();
await browser.close();
if (failures.length) {
  console.error(`\n❌ stress: ${failures.length} falha(s)\n${failures.slice(0, 30).join('\n')}`);
  process.exit(1);
}
console.log('\n✅ stress: nenhum travamento nas telas dos árbitros');
process.exit(0);
