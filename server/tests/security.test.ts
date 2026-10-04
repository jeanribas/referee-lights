// Revisão de segurança: força bruta de PIN/token (HTTP e socket), criação de
// salas em massa, Key Relay sem credencial / com tecla maliciosa, flood de
// eventos no socket e PIN gerado com crypto.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';
process.env.KEY_RELAY_AVAILABLE = 'true';
const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-sec-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
type Ack = { ok: true } | { error: string };
interface Room {
  roomId: string;
  adminPin: string;
  joinQRCodes: Record<'left' | 'center' | 'right', { token: string }>;
}
let app: App;
let baseUrl = '';
let cfg: typeof import('../src/config.js')['config'];
const sockets: Socket[] = [];

let ipSeq = 0;
const freshIp = () => `10.77.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

async function createRoom(remoteAddress = freshIp()): Promise<Room> {
  const res = await app.inject({ method: 'POST', url: '/rooms', remoteAddress, payload: {} });
  expect(res.statusCode).toBe(201);
  return res.json() as Room;
}

async function connect(headers: Record<string, string> = {}): Promise<Socket> {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: headers });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

const emitAck = (s: Socket, ev: string, ...args: unknown[]) => s.timeout(3000).emitWithAck(ev, ...args) as Promise<Ack>;

beforeAll(async () => {
  cfg = (await import('../src/config.js')).config;
  const { createServer } = await import('../src/server.js');
  app = await createServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('sem endereço');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(() => {
  while (sockets.length) sockets.pop()?.disconnect();
  cfg.TRUST_PROXY_HOPS = 0;
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('força bruta de PIN via HTTP', () => {
  it('30 PINs errados bloqueiam o IP — inclusive o PIN certo — e outro IP segue livre', async () => {
    const room = await createRoom();
    const ip = freshIp();
    const access = (pin: string, remoteAddress = ip) =>
      app.inject({ method: 'POST', url: `/rooms/${room.roomId}/access`, remoteAddress, payload: { adminPin: pin } });
    for (let i = 0; i < 30; i++) expect((await access('0000')).statusCode).toBe(403);
    expect((await access(room.adminPin)).statusCode).toBe(429);
    // refresh-ref-tokens divide o mesmo contador
    const refresh = await app.inject({
      method: 'POST',
      url: `/rooms/${room.roomId}/refresh-ref-tokens`,
      remoteAddress: ip,
      payload: { adminPin: room.adminPin }
    });
    expect(refresh.statusCode).toBe(429);
    expect((await access(room.adminPin, freshIp())).statusCode).toBe(200);
  });

  it('acertos não contam: muitos acessos válidos seguidos continuam liberados', async () => {
    const room = await createRoom();
    const ip = freshIp();
    for (let i = 0; i < 50; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/rooms/${room.roomId}/access`,
        remoteAddress: ip,
        payload: { adminPin: room.adminPin }
      });
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('força bruta de PIN/token via socket', () => {
  it('30 credenciais erradas bloqueiam o registro do IP, mesmo trocando X-Forwarded-For', async () => {
    const room = await createRoom();
    // hops=0: o header forjado é ignorado; todos contam para 127.0.0.1
    for (let i = 0; i < 30; i++) {
      const s = await connect({ 'x-forwarded-for': `5.5.5.${i}` });
      const ack = await emitAck(s, 'client:register', { role: i % 2 ? 'admin' : 'left', roomId: room.roomId, pin: 'x', token: 'x' });
      expect(ack).toHaveProperty('error');
      s.disconnect();
    }
    const s = await connect({ 'x-forwarded-for': '5.5.6.1' });
    expect(await emitAck(s, 'client:register', { role: 'admin', roomId: room.roomId, pin: room.adminPin })).toEqual({
      error: 'too_many_attempts'
    });
    // Atrás do proxy (hops=1), o cliente real (valor à direita) tem balde próprio
    cfg.TRUST_PROXY_HOPS = 1;
    const other = await connect({ 'x-forwarded-for': '200.20.20.20' });
    expect(await emitAck(other, 'client:register', { role: 'admin', roomId: room.roomId, pin: room.adminPin })).toEqual({
      ok: true
    });
  });
});

describe('criação de salas', () => {
  it('limite de 30 salas por IP a cada 10 min (loopback isento)', async () => {
    const ip = freshIp();
    for (let i = 0; i < 30; i++) await createRoom(ip);
    const res = await app.inject({ method: 'POST', url: '/rooms', remoteAddress: ip, payload: {} });
    expect(res.statusCode).toBe(429);
    for (let i = 0; i < 35; i++) await createRoom('127.0.0.1');
  });

  it('PIN tem 4 dígitos', async () => {
    const room = await createRoom();
    expect(room.adminPin).toMatch(/^[1-9]\d{3}$/);
  });
});

describe('Key Relay', () => {
  const post = (url: string, payload: Record<string, unknown>, remoteAddress = freshIp()) =>
    app.inject({ method: 'POST', url, remoteAddress, payload });

  it('start/stop sem PIN ou com PIN errado são recusados', async () => {
    const room = await createRoom();
    expect((await post('/key-relay/start', { roomId: room.roomId })).statusCode).toBe(403);
    expect((await post('/key-relay/start', { roomId: room.roomId, adminPin: '0000' })).statusCode).toBe(403);
    expect((await post('/key-relay/start', { roomId: 'NOPE', adminPin: room.adminPin })).statusCode).toBe(404);
    const ok = await post('/key-relay/start', { roomId: room.roomId, adminPin: room.adminPin, validKey: 'Ctrl+F2', invalidKey: 'F10' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().keys).toEqual({ valid: 'Ctrl+F2', invalid: 'F10' });
    const st = (await app.inject({ method: 'GET', url: '/key-relay/status' })).json();
    expect(st.active).toBe(true);
    expect(st.roomId).toBeNull();
    // outra sala (PIN válido dela) não desliga o relay desta
    const other = await createRoom();
    expect((await post('/key-relay/stop', { roomId: other.roomId, adminPin: other.adminPin })).statusCode).toBe(403);
    expect((await post('/key-relay/stop', {})).statusCode).toBe(403);
    expect((await post('/key-relay/stop', { roomId: room.roomId, adminPin: room.adminPin })).statusCode).toBe(200);
  });

  it('tecla com injeção de comando é recusada', async () => {
    const room = await createRoom();
    for (const evil of ["x');Start-Process calc;('", 'a" & do shell script "id', 'Ctrl+Shift+Alt+Meta+F1', 'Enter', '{F1}', 123]) {
      const res = await post('/key-relay/start', { roomId: room.roomId, adminPin: room.adminPin, validKey: evil, invalidKey: 'F10' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: 'invalid_key' });
    }
    const status = await app.inject({ method: 'GET', url: '/key-relay/status' });
    expect(status.json().active).toBe(false);
  });

  it('indisponível onde KEY_RELAY_AVAILABLE=false', async () => {
    const room = await createRoom();
    cfg.KEY_RELAY_AVAILABLE = false;
    const { createServer } = await import('../src/server.js');
    const other = await createServer();
    const res = await other.inject({ method: 'POST', url: '/key-relay/start', payload: { roomId: room.roomId, adminPin: room.adminPin } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'key_relay_unavailable' });
    await other.close();
    cfg.KEY_RELAY_AVAILABLE = true;
  });
});

describe('flood de eventos no socket', () => {
  it('excedente recebe rate_limited, flood contínuo derruba só o agressor', async () => {
    cfg.TRUST_PROXY_HOPS = 1;
    const room = await createRoom();
    const admin = await connect({ 'x-forwarded-for': freshIp() });
    expect(await emitAck(admin, 'client:register', { role: 'admin', roomId: room.roomId, pin: room.adminPin })).toEqual({ ok: true });
    const attacker = await connect({ 'x-forwarded-for': freshIp() });
    const disconnected = new Promise<void>((resolve) => attacker.once('disconnect', () => resolve()));
    const acks: Ack[] = [];
    for (let i = 0; i < 300; i++) attacker.emit('admin:ready', (a: Ack) => acks.push(a));
    await disconnected;
    expect(acks.some((a) => 'error' in a && a.error === 'rate_limited')).toBe(true);
    // o admin legítimo segue atendido
    expect(await emitAck(admin, 'admin:ready')).toEqual({ ok: true });
  });

  it('mensagem acima de 16KB derruba a conexão sem afetar o servidor', async () => {
    cfg.TRUST_PROXY_HOPS = 1;
    const s = await connect({ 'x-forwarded-for': freshIp() });
    const closed = new Promise<void>((resolve) => s.once('disconnect', () => resolve()));
    s.emit('legend:config', { config: 'x'.repeat(64 * 1024) });
    await closed;
    const room = await createRoom();
    const ok = await connect({ 'x-forwarded-for': freshIp() });
    expect(await emitAck(ok, 'client:register', { role: 'admin', roomId: room.roomId, pin: room.adminPin })).toEqual({ ok: true });
  });
});
