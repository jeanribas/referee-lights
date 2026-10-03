// Smoke e2e do pacote (protocolo, sem browser): admin + display + 3 árbitros,
// votos, revelação no display. Usa o socket.io-client que JÁ vem dentro do
// standalone do frontend — testa o pacote como ele é, sem instalar nada.
//
// Uso: node smoke-e2e.cjs <pastaDoFrontendDoPacote> [apiBase] [--malformed]
//   --malformed: depois do fluxo, manda um payload/ack malformado sem
//   autenticar e confere que o server CONTINUA vivo (regressão do crash
//   "ack is not a function" que derrubava o processo inteiro).
const path = require('path');

const frontendDir = process.argv[2];
const API = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'http://127.0.0.1:3333';
const checkMalformed = process.argv.includes('--malformed');
const { io } = require(path.join(path.resolve(frontendDir), 'node_modules', 'socket.io-client'));
const ROLES = ['left', 'center', 'right'];

function conn(reg) {
  return new Promise((res, rej) => {
    const s = io(API, { transports: ['websocket'], reconnection: false, timeout: 5000 });
    s.on('connect_error', rej);
    s.on('connect', () =>
      s.emit('client:register', reg, (r) => (r && r.ok ? res(s) : rej(new Error(`register ${reg.role}: ${JSON.stringify(r)}`))))
    );
  });
}

const ack = (s, ev, ...a) =>
  new Promise((res, rej) =>
    s.timeout(5000).emit(ev, ...a, (e, r) => (e ? rej(e) : r && r.error ? rej(new Error(`${ev}: ${r.error}`)) : res(r)))
  );

async function health() {
  const r = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`health HTTP ${r.status}`);
}

(async () => {
  await health();
  const room = await (await fetch(`${API}/rooms`, { method: 'POST' })).json();
  const admin = await conn({ role: 'admin', roomId: room.roomId, pin: room.adminPin });
  const display = await conn({ role: 'display', roomId: room.roomId, pin: room.adminPin });
  const refs = await Promise.all(
    ROLES.map((r) => conn({ role: r, roomId: room.roomId, token: room.joinQRCodes[r].token }))
  );
  const revealed = new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('display não recebeu phase=revealed')), 8000);
    display.on('state:update', (s) => {
      if (s.phase === 'revealed') { clearTimeout(t); res(s); }
    });
  });
  await ack(admin, 'admin:ready');
  await ack(refs[0], 'ref:vote', { vote: 'white' });
  await ack(refs[1], 'ref:vote', { vote: 'white' });
  await ack(refs[2], 'ref:vote', { vote: 'red' });
  await ack(admin, 'admin:release').catch(() => {}); // revelação pode ser automática
  const s = await revealed;
  const v = s.votes || {};
  if (v.left !== 'white' || v.center !== 'white' || v.right !== 'red') {
    throw new Error(`votos revelados inesperados: ${JSON.stringify(v)}`);
  }
  console.log(`OK fluxo completo na sala ${room.roomId}: ${JSON.stringify(v)}`);
  // Cartão depois da revelação: quem votou vermelho completa o cartão; quem
  // votou branco NÃO pode virar a luz já exibida para vermelho.
  let last = s;
  display.on('state:update', (st) => { last = st; });
  await ack(refs[2], 'ref:card', { card: 1 });
  await ack(refs[0], 'ref:card', { card: 3 });
  await new Promise((r) => setTimeout(r, 400));
  if (last.votes.left !== 'white' || (last.cards.left || []).length !== 0) {
    throw new Error(`cartão após revelação alterou luz branca: ${JSON.stringify({ v: last.votes, c: last.cards })}`);
  }
  if ((last.cards.right || []).join() !== '1') throw new Error(`cartão do voto vermelho não registrado: ${JSON.stringify(last.cards)}`);
  console.log('OK cartão após revelação não altera luz branca');
  for (const x of [admin, display, ...refs]) x.close();

  if (checkMalformed) {
    const evil = io(API, { transports: ['websocket'], reconnection: false });
    await new Promise((r) => evil.on('connect', r));
    evil.emit('admin:ready', { not: 'a function' });
    evil.emit('ref:vote', null, 'nem isto');
    evil.emit('client:register', 'lixo', 42);
    // Papel viewer foi removido: registrar como viewer é recusado.
    const viewer = await new Promise((r) => evil.emit('client:register', { role: 'viewer', roomId: room.roomId }, r));
    if (!viewer || viewer.error !== 'invalid_payload') throw new Error(`viewer aceito: ${JSON.stringify(viewer)}`);
    await new Promise((r) => setTimeout(r, 1500));
    evil.close();
    await health().catch((e) => { throw new Error(`server MORREU após payload malformado (${e.message})`); });
    console.log('OK server sobreviveu a payload/ack malformado');
  }
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
