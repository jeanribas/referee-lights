// Checagens de segurança do pacote via HTTP (sem browser).
// Uso: node security-check.cjs [apiBase] [--key-relay] [--abuse=<pastaDoFrontend>]
//   --abuse: flood no socket (deve desconectar) e força bruta de PIN (31ª
//   tentativa = 429). BLOQUEIA o IP por 10 min: rode por ÚLTIMO.
//   --key-relay: o server foi iniciado com KEY_RELAY_AVAILABLE=true; testa
//   PIN obrigatório, lista branca de teclas e status sem roomId. NUNCA liga
//   o relay de verdade com tecla válida (start ok é seguido de stop).
const API = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://127.0.0.1:3333';
const withRelay = process.argv.includes('--key-relay');

const post = async (p, body) => {
  const r = await fetch(`${API}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log(`OK ${msg}`);
};

(async () => {
  const room = (await post('/rooms')).body;
  const status = await (await fetch(`${API}/key-relay/status`)).json();
  expect(status.roomId === null, 'status do key relay não expõe roomId');

  if (!withRelay) {
    const r = await post('/key-relay/start', { roomId: room.roomId, adminPin: room.adminPin });
    expect(r.status === 403, `start sem KEY_RELAY_AVAILABLE recusado (${r.status})`);
  } else {
    let r = await post('/key-relay/start', { roomId: room.roomId });
    expect(r.status === 403, `start sem PIN recusado (${r.status})`);
    r = await post('/key-relay/start', { roomId: 'ZZZZ', adminPin: room.adminPin });
    expect(r.status === 404, `start com sala inexistente recusado (${r.status})`);
    for (const bad of ["x');Start-Process calc;('", 'F13', 'ctrl+ctrl+ctrl+ctrl+a', '{ENTER}', 'a b', '"', 'Ctrl+%']) {
      r = await post('/key-relay/start', { roomId: room.roomId, adminPin: room.adminPin, validKey: bad, invalidKey: 'F10' });
      expect(r.status === 400 && r.body.error === 'invalid_key', `tecla rejeitada: ${JSON.stringify(bad)}`);
    }
    r = await post('/key-relay/stop', {});
    expect(r.status === 403 || r.status === 404, `stop sem PIN recusado (${r.status})`);
    r = await post('/key-relay/start', { roomId: room.roomId, adminPin: room.adminPin, validKey: 'Ctrl+Shift+F1', invalidKey: 'f10' });
    expect(r.status === 200, `start com PIN e teclas válidas aceito (${r.status})`);
    const st = await (await fetch(`${API}/key-relay/status`)).json();
    expect(st.active === true && st.roomId === null, 'status ativo sem expor roomId');
    r = await post('/key-relay/stop', { roomId: room.roomId, adminPin: '0000' === room.adminPin ? '0001' : '0000' });
    expect(r.status === 403, `stop com PIN errado recusado (${r.status})`);
    r = await post('/key-relay/stop', { roomId: room.roomId, adminPin: room.adminPin });
    expect(r.status === 200, 'stop com PIN aceito');
  }
  const abuseArg = process.argv.find((a) => a.startsWith('--abuse='));
  if (abuseArg) {
    const path = require('path');
    const { io } = require(path.join(path.resolve(abuseArg.slice(8)), 'node_modules', 'socket.io-client'));
    const s = io(API, { transports: ['websocket'], reconnection: false });
    await new Promise((r) => s.on('connect', r));
    const dropped = new Promise((r) => s.on('disconnect', r));
    for (let i = 0; i < 300; i++) s.emit('admin:ready', () => {});
    const res = await Promise.race([dropped.then(() => 'disconnected'), new Promise((r) => setTimeout(() => r('alive'), 3000))]);
    expect(res === 'disconnected', 'socket com flood (300 ev/s) desconectado');
    const huge = io(API, { transports: ['websocket'], reconnection: false });
    await new Promise((r) => huge.on('connect', r));
    const hugeDropped = new Promise((r) => huge.on('disconnect', r));
    huge.emit('legend:config', { config: 'x'.repeat(64 * 1024) });
    const hres = await Promise.race([hugeDropped.then(() => 'disconnected'), new Promise((r) => setTimeout(() => r('alive'), 3000))]);
    expect(hres === 'disconnected', 'mensagem > 16KB derruba só o socket');
    huge.close();
    const wrong = room.adminPin === '1000' ? '1001' : '1000';
    let last;
    for (let i = 0; i < 31; i++) last = await post(`/rooms/${room.roomId}/access`, { adminPin: wrong });
    expect(last.status === 429, `31ª tentativa de PIN errado bloqueada (${last.status})`);
    const right = await post(`/rooms/${room.roomId}/access`, { adminPin: room.adminPin });
    expect(right.status === 429, 'IP bloqueado mesmo com o PIN certo até a janela vencer');
    const health = await fetch(`${API}/health`);
    expect(health.ok, 'server segue vivo após abuso');
  }
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
