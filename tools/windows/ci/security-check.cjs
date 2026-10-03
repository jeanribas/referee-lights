// Checagens de segurança do pacote via HTTP (sem browser).
// Uso: node security-check.cjs [apiBase] [--key-relay]
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
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
