// UI no Chromium contra o pacote rodando (sem depender de textos/seletores,
// que mudam com i18n). Para CADA tela (admin, display, legend, timer e os 3
// árbitros):
//   - carrega sem erro de JS e sem 4xx/5xx em arquivo do próprio pacote;
//   - abre o websocket na MESMA origem da página (uma porta só; nenhuma URL
//     de produção inlinada);
//   - recebe as atualizações da sala (decisão revelada chega em todas);
//   - CSS presente inline (<style data-inline-css>) e a tela renderiza
//     IGUAL só com ele (links removidos → screenshot idêntico);
//   - tags de sessão (room, role, target=bundle) com a função global simulada.
// Display: wake lock único mesmo com focos repetidos.
// Raiz e /pt-BR redirecionam para /admin.
// Nada sai para a internet: requisições a outros hosts são abortadas.
//
// Uso: node ui-smoke.mjs <baseUrl ex. http://127.0.0.1:3000> <pastaDoFrontendDoPacote>
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoFrontend = path.resolve(here, '..', '..', '..', 'frontend');
const { chromium } = createRequire(path.join(repoFrontend, 'package.json'))('@playwright/test');
const { io } = createRequire(path.join(path.resolve(process.argv[3]), 'package.json'))('socket.io-client');

const base = process.argv[2] ?? 'http://127.0.0.1:3000';
const host = new URL(base).hostname;
const api = new URL(base).origin;

const room = await (await fetch(`${api}/rooms`, { method: 'POST' })).json();
const q = `roomId=${room.roomId}&pin=${room.adminPin}`;
const pages = {
  admin: `/admin?${q}`,
  display: `/display?${q}`,
  legend: `/legend?${q}`,
  timer: `/timer?${q}`,
  left: `/ref/left?roomId=${room.roomId}&token=${room.joinQRCodes.left.token}`,
  center: `/ref/center?roomId=${room.roomId}&token=${room.joinQRCodes.center.token}`,
  right: `/ref/right?roomId=${room.roomId}&token=${room.joinQRCodes.right.token}`
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.route('**/*', (route) => {
  const u = new URL(route.request().url());
  return u.hostname === host ? route.continue() : route.abort();
});
await context.addInitScript(() => {
  const w = window;
  w.__tagCalls = [];
  w.clarity = (...a) => w.__tagCalls.push(a);
  w.__wl = { requests: 0, active: 0 };
  const fake = {
    request: async () => {
      w.__wl.requests += 1;
      w.__wl.active += 1;
      const sentinel = {
        released: false,
        addEventListener: () => undefined,
        release: async () => {
          if (!sentinel.released) {
            sentinel.released = true;
            w.__wl.active -= 1;
          }
        }
      };
      return sentinel;
    }
  };
  Object.defineProperty(navigator, 'wakeLock', { value: fake, configurable: true });
});

const failures = [];
const opened = {};
for (const [name, p] of Object.entries(pages)) {
  const page = await context.newPage();
  const errors = [];
  const frames = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    // Nenhum 404 no pacote (o analytics da Vercel, que dava 404, saiu dele)
    const u = new URL(r.url());
    if (u.hostname === host && r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  const wsP = page.waitForEvent('websocket', { timeout: 20_000 }).catch(() => null);
  const res = await page.goto(base + p, { waitUntil: 'load' });
  const ws = await wsP;
  if (ws) ws.on('framereceived', (f) => frames.push(String(f.payload)));
  if (!res || res.status() >= 400) failures.push(`${name}: HTTP ${res?.status()}`);
  if (!ws) failures.push(`${name}: nenhum websocket aberto`);
  else if (!ws.url().startsWith(`ws://${new URL(base).host}/`)) failures.push(`${name}: websocket foi para ${ws.url()}`);
  opened[name] = { page, errors, frames };
}

// Painel aberto em localhost (como no computador do servidor): os links do
// display e do timer precisam levar o IP da rede, não "localhost" (abrem em
// OUTRO computador). Regressão: link relativo herdava localhost.
{
  const page = await context.newPage();
  const port = new URL(base).port || '80';
  const local = `http://localhost:${port}`;
  await context.route(`${local}/**`, (route) => route.continue());
  await page.goto(`${local}${pages.admin}`, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.querySelectorAll('a[href*="/display?"]')].some((a) => /^https?:\/\//.test(a.getAttribute('href') ?? '')), null, { timeout: 15_000 }).catch(() => undefined);
  const hrefs = await page.evaluate(() => ['/display?', '/timer?'].map((p) => document.querySelector(`a[href*="${p}"]`)?.getAttribute('href') ?? ''));
  for (const h of hrefs) {
    let host = '';
    try { host = new URL(h).hostname; } catch { /* relativo */ }
    if (!host || ['localhost', '127.0.0.1'].includes(host)) failures.push(`admin em localhost: link "${h}" não leva o IP da rede`);
  }
  await page.close();
}

// Legenda em telas comuns (inclui a prévia dentro do painel, ~1150x790):
// rodapé nunca por cima do timer; no modo de transmissão (OBS) tudo cabe.
for (const [w, h] of [[1150, 790], [1280, 720], [1366, 768], [1920, 1080]]) {
  for (const share of [false, true]) {
    const page = await context.newPage();
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${base}${pages.legend}${share ? '&view=share' : ''}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-legend-timer]', { timeout: 15_000 }).catch(() => undefined);
    const m = await page.evaluate(() => {
      const t = document.querySelector('[data-legend-timer]')?.getBoundingClientRect();
      const f = document.querySelector('[data-legend-footer]')?.getBoundingClientRect();
      return t && f ? { tBottom: t.bottom, fTop: f.top, vh: innerHeight } : null;
    });
    const label = `legenda ${share ? 'transmissão' : 'controle'} ${w}x${h}`;
    if (!m) failures.push(`${label}: timer/rodapé não encontrados`);
    else {
      if (m.fTop < m.tBottom) failures.push(`${label}: rodapé por cima do timer (rodapé ${m.fTop.toFixed(0)} < timer ${m.tBottom.toFixed(0)})`);
      if (share && m.tBottom > m.vh) failures.push(`${label}: timer cortado (fundo ${m.tBottom.toFixed(0)} > ${m.vh})`);
    }
    await page.close();
  }
}

// Coluna de controles do admin sem rolagem à toa nas resoluções comuns
for (const [w, h] of [[1280, 720], [1366, 768], [1920, 1080]]) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${base}${pages.admin}`, { waitUntil: 'load' });
  await page.waitForSelector('aside', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  const extra = await page.evaluate(() => { const a = document.querySelector('aside'); return a ? a.scrollHeight - a.clientHeight : -1; });
  if (extra > 0) failures.push(`admin ${w}x${h}: coluna de controles com rolagem (${extra}px a mais)`);
  await page.close();
}

// Tela de criar sessão cabe na janela sem rolagem (escala dinâmica)
for (const [w, h] of [[1280, 720], [1366, 768], [1424, 860], [1920, 1080]]) {
  const page = await context.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${base}/admin`, { waitUntil: 'load' });
  await page.waitForSelector('[data-fit-scale]', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-fit-scale]');
    const r = el?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom, vh: innerHeight, scroll: document.documentElement.scrollHeight } : null;
  });
  if (!m) failures.push(`criar sessão ${w}x${h}: conteúdo não encontrado`);
  else if (m.top < 0 || m.bottom > m.vh + 1 || m.scroll > m.vh + 1) failures.push(`criar sessão ${w}x${h}: não cabe (topo ${m.top.toFixed(0)}, fundo ${m.bottom.toFixed(0)}, janela ${m.vh})`);
  await page.close();
}

// Tags de sessão depois do register
const expectedRole = { admin: 'admin', display: 'display', legend: 'legend', timer: 'timer', left: 'left', center: 'center', right: 'right' };
for (const [name, { page }] of Object.entries(opened)) {
  try {
    await page.waitForFunction(() => window.__tagCalls.some((c) => c[1] === 'room'), null, { timeout: 15_000 });
  } catch { /* conferido abaixo */ }
  const calls = await page.evaluate(() => window.__tagCalls.filter((c) => c[0] === 'set').map((c) => `${c[1]}=${c[2]}`));
  for (const want of [`room=${room.roomId}`, `role=${expectedRole[name]}`, 'target=bundle']) {
    if (!calls.includes(want)) failures.push(`${name}: tag de sessão ausente "${want}" (tem: ${calls.join(', ')})`);
  }
  const identify = await page.evaluate(() => window.__tagCalls.some((c) => c[0] === 'identify'));
  if (identify) failures.push(`${name}: identify não deveria ser chamado`);
}

// Fluxo: votos pelos sockets de teste (UI dos árbitros depende de texto)
const ack = (s, ev, ...a) => new Promise((r) => s.emit(ev, ...a, r));
const conn = (reg) =>
  new Promise((res, rej) => {
    const s = io(api, { transports: ['websocket'], reconnection: false });
    s.on('connect', () => s.emit('client:register', reg, (r) => (r?.ok ? res(s) : rej(new Error(JSON.stringify(r))))));
    s.on('connect_error', rej);
  });
const adminS = await conn({ role: 'admin', roomId: room.roomId, pin: room.adminPin });
await ack(adminS, 'admin:ready');
// Os árbitros já estão conectados pelas páginas: novos sockets com o mesmo token
const refS = await Promise.all(['left', 'center', 'right'].map((r) => conn({ role: r, roomId: room.roomId, token: room.joinQRCodes[r].token })));
const displayShotBefore = await opened.display.page.screenshot();
await ack(refS[0], 'ref:vote', { vote: 'white' });
await ack(refS[1], 'ref:vote', { vote: 'red' });
await ack(refS[2], 'ref:vote', { vote: 'red' });
await ack(adminS, 'timer:command', { action: 'set', seconds: 60 });
await new Promise((r) => setTimeout(r, 2500));
for (const [name, { frames }] of Object.entries(opened)) {
  if (!frames.some((f) => f.includes('"phase":"revealed"'))) failures.push(`${name}: não recebeu a decisão revelada`);
}
const displayShotAfter = await opened.display.page.screenshot();
if (displayShotBefore.equals(displayShotAfter)) failures.push('display: tela não mudou após a decisão');

// Wake lock: focos repetidos não acumulam sentinels
{
  const page = opened.display.page;
  for (let i = 0; i < 5; i++) await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(400);
  const wl = await page.evaluate(() => window.__wl);
  if (wl.active !== 1 || wl.requests !== 1) failures.push(`display: wake lock acumulou (${JSON.stringify(wl)})`);
}

// CSS inline: presente e suficiente sozinho (render idêntico sem os <link>).
// Timer parado e animações congeladas: só o CSS pode mudar o resultado.
await ack(adminS, 'timer:command', { action: 'stop' });
await new Promise((r) => setTimeout(r, 800));
for (const name of ['admin', 'display', 'left']) {
  const { page } = opened[name];
  const info = await page.evaluate(async () => {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
    const styles = [...document.querySelectorAll('style[data-inline-css]')];
    let linked = 0;
    for (const l of links) linked += (await (await fetch(l.href)).text()).length;
    return { links: links.length, styles: styles.length, inlined: styles.reduce((n, s) => n + s.textContent.length, 0), linked };
  });
  if (info.styles < 1 || info.styles !== info.links || info.inlined < 1000 || info.inlined < info.linked * 0.95) {
    failures.push(`${name}: CSS inline incompleto ${JSON.stringify(info)}`);
    continue;
  }
  // Compara o estilo COMPUTADO de todos os elementos (screenshot oscila com
  // timer/relógio ao vivo): com <link> + <style> vs só o <style> inline.
  const snapshotStyles = () =>
    page.evaluate(() => {
      const props = ['display', 'position', 'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'margin', 'padding', 'width', 'height', 'border', 'flex-direction', 'justify-content', 'align-items', 'grid-template-columns', 'opacity', 'transform', 'border-radius', 'box-shadow'];
      return [...document.querySelectorAll('body *')].map((el) => {
        const cs = getComputedStyle(el);
        return props.map((p) => cs.getPropertyValue(p)).join('|');
      }).join('\n');
    });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
  await page.waitForTimeout(200);
  const withLinks = await snapshotStyles();
  await page.evaluate(() => document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => l.remove()));
  await page.waitForTimeout(300);
  const onlyInline = await snapshotStyles();
  const unstyled = await page.evaluate(() => getComputedStyle(document.body).margin);
  if (withLinks !== onlyInline) {
    const a = withLinks.split('\n');
    const b = onlyInline.split('\n');
    const i = a.findIndex((l, k) => l !== b[k]);
    failures.push(`${name}: estilo computado muda sem os <link> (CSS inline não equivale) — elemento ${i}/${a.length} vs ${b.length}: "${a[i]}" → "${b[i]}"`);
  }
  else if (unstyled === '8px') failures.push(`${name}: body sem estilo do app após remover os <link>`);
  else console.log(`OK ${name}: ${info.styles} <style data-inline-css> (${info.inlined} bytes), render idêntico`);
}

for (const [name, { errors }] of Object.entries(opened)) {
  if (errors.length) failures.push(`${name}: ${errors.join(' | ')}`);
  else console.log(`OK ${name}`);
}

// A raiz NÃO pode mostrar a home de marketing no pacote.
for (const p of ['/', '/pt-BR', '/en-US']) {
  const page = await context.newPage();
  await page.goto(base + p, { waitUntil: 'domcontentloaded' });
  if (!/\/admin$/.test(new URL(page.url()).pathname)) failures.push(`${p} não redirecionou para /admin (foi para ${page.url()})`);
}

for (const s of [adminS, ...refS]) s.close();
await browser.close();
if (failures.length) {
  console.error('FAIL\n - ' + failures.join('\n - '));
  process.exit(1);
}
console.log('OK UI smoke');
