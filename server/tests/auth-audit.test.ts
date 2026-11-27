// Auditoria de falha de PIN/token: sanitização da entrada do atacante, janela
// de 10 s (log e banco), gravação no analytics, rota /master/auth-failures e
// os pontos reais de falha (HTTP e socket). Nunca PIN/token ou IP cru no log.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';
import { AuthFailThrottle, sanitizeRole, sanitizeRoomId } from '../src/auth-audit.js';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';
// Traefik da produção: X-Forwarded-For de um valor só é o IP real.
process.env.TRUST_PROXY_HOPS = '1';

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-audit-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

// Importado depois do env: config.ts lê as variáveis na primeira importação.
let AnalyticsStore: typeof import('../src/analytics.js')['AnalyticsStore'];

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
let app: App;
let baseUrl = '';
const sockets: Socket[] = [];

// Cada cenário usa um IP próprio: o contador de falhas e a janela de 10 s são por IP.
let ipSeq = 0;
function freshIp() {
  ipSeq += 1;
  return `10.88.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

const WRONG_PIN = 'PIN-ERRADO-XYZ';
const WRONG_TOKEN = 'TOKEN-ERRADO-XYZ';

interface RoomAccess {
  roomId: string;
  adminPin: string;
  joinQRCodes: Record<string, { token: string }>;
}

interface FailuresBody {
  total: number;
  byKind: Record<string, number>;
  byVia: Record<string, number>;
  topIps: Array<{ ipHash: string; n: number; rooms: number; first: string; last: string }>;
  byDay: Array<{ day: string; count: number }>;
  recent: Array<{ roomId: string; ipHash: string; kind: string; via: string; role: string }>;
  error?: string;
}

async function createRoom(): Promise<RoomAccess> {
  const res = await app.inject({ method: 'POST', url: '/rooms', payload: {} });
  return res.json() as RoomAccess;
}

async function masterToken(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/master/auth',
    headers: { 'x-forwarded-for': freshIp() },
    payload: { user: 'test-user', password: 'test-password' }
  });
  return (res.json() as { token: string }).token;
}

async function failures(query = '', token?: string) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  const res = await app.inject({ method: 'GET', url: `/master/auth-failures${query}`, headers });
  return { status: res.statusCode, body: res.json() as FailuresBody };
}

/** Chamadas de log `auth_fail` desde o início do cenário. */
function authFailLogs(spy: { mock: { calls: unknown[][] } }): unknown[][] {
  return spy.mock.calls.filter((args) => (args[0] as { event?: string } | undefined)?.event === 'auth_fail');
}

beforeAll(async () => {
  ({ AnalyticsStore } = await import('../src/analytics.js'));
  const { createServer } = await import('../src/server.js');
  app = await createServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('sem endereço');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  while (sockets.length) sockets.pop()?.disconnect();
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('sanitização da entrada do atacante', () => {
  it('código de sala válido passa; o resto vira invalid', () => {
    expect(sanitizeRoomId('K6XT')).toBe('K6XT');
    expect(sanitizeRoomId('../../etc')).toBe('invalid');
    expect(sanitizeRoomId('k6xt')).toBe('invalid');
    expect(sanitizeRoomId('ABCDE')).toBe('invalid');
    expect(sanitizeRoomId('AB\nCD')).toBe('invalid');
    expect(sanitizeRoomId(undefined)).toBe('invalid');
    expect(sanitizeRoomId({ x: 1 })).toBe('invalid');
  });

  it('papel só passa se for conhecido', () => {
    expect(sanitizeRole('left')).toBe('left');
    expect(sanitizeRole('admin')).toBe('admin');
    expect(sanitizeRole('root; drop')).toBe('invalid');
    expect(sanitizeRole(42)).toBe('invalid');
  });
});

describe('janela de 10 s', () => {
  it('segunda falha da mesma chave dentro da janela é suprimida e contada na próxima', () => {
    const t = new AuthFailThrottle(10_000);
    expect(t.take('invalid_pin|h1', 0)).toEqual({ allowed: true, suppressed: 0 });
    expect(t.take('invalid_pin|h1', 1_000)).toEqual({ allowed: false, suppressed: 0 });
    expect(t.take('invalid_pin|h1', 9_000)).toEqual({ allowed: false, suppressed: 0 });
    expect(t.take('invalid_pin|h1', 10_000)).toEqual({ allowed: true, suppressed: 2 });
  });

  it('chaves diferentes (outro tipo ou outro IP) não se atrapalham', () => {
    const t = new AuthFailThrottle(10_000);
    expect(t.take('invalid_pin|h1', 0).allowed).toBe(true);
    expect(t.take('blocked|h1', 1).allowed).toBe(true);
    expect(t.take('invalid_pin|h2', 2).allowed).toBe(true);
  });

  it('teto global: 120 gravações por minuto; o excedente sai como suppressed na próxima', () => {
    const t = new AuthFailThrottle(10_000, 5_000, 120);
    let allowed = 0;
    for (let i = 0; i < 150; i++) if (t.take(`k${i}`, 1_000).allowed) allowed++;
    expect(allowed).toBe(120);
    // minuto seguinte: a primeira gravada carrega as 30 que passaram do teto
    expect(t.take('nova', 61_000)).toEqual({ allowed: true, suppressed: 30 });
  });

  it('mapa tem teto: chave mais antiga sai quando lota', () => {
    const t = new AuthFailThrottle(10_000, 3);
    for (let i = 0; i < 4; i++) t.take(`k${i}`, i);
    // k0 foi despejada, então volta a ser registrada na hora
    expect(t.take('k0', 5).allowed).toBe(true);
  });
});

describe('AnalyticsStore: auth_failures', () => {
  it('grava uma linha por (IP, tipo) a cada 10 s, com IP só como hash', () => {
    const store = new AnalyticsStore(path.join(dataDir, 'store-unit.db'));
    const t0 = 1_700_000_000_000;
    const first = store.recordAuthFailure({ kind: 'invalid_pin', via: 'http', roomId: 'AAAA', role: 'admin', ip: '203.0.113.7' }, t0);
    const again = store.recordAuthFailure({ kind: 'invalid_pin', via: 'http', roomId: 'AAAA', role: 'admin', ip: '203.0.113.7' }, t0 + 2_000);
    const other = store.recordAuthFailure({ kind: 'blocked', via: 'http', roomId: 'AAAA', role: 'admin', ip: '203.0.113.7' }, t0 + 2_000);
    const later = store.recordAuthFailure({ kind: 'invalid_pin', via: 'http', roomId: 'AAAA', role: 'admin', ip: '203.0.113.7' }, t0 + 11_000);

    expect(first.logged).toBe(true);
    expect(again.logged).toBe(false);
    expect(other.logged).toBe(true);
    expect(later).toMatchObject({ logged: true, suppressed: 1 });
    expect(first.ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(first.ipHash).not.toContain('203.0.113.7');
    expect(again.ipHash).toBe(first.ipHash);

    const agg = store.getAuthFailures('all');
    expect(agg.total).toBe(3);
    expect(agg.byKind).toEqual({ invalid_pin: 2, blocked: 1 });
    expect(agg.byVia).toEqual({ http: 3 });
    expect(agg.recent).toHaveLength(3);
    expect(JSON.stringify(agg)).not.toContain('203.0.113.7');
  });

  it('agregados por IP: total, salas distintas, primeiro e último', () => {
    const store = new AnalyticsStore(path.join(dataDir, 'store-top.db'));
    const t0 = 1_700_000_000_000;
    store.recordAuthFailure({ kind: 'invalid_token', via: 'socket', roomId: 'ROOM', role: 'left', ip: '198.51.100.1' }, t0);
    store.recordAuthFailure({ kind: 'invalid_token', via: 'socket', roomId: 'ROOM', role: 'left', ip: '198.51.100.1' }, t0 + 20_000);
    store.recordAuthFailure({ kind: 'invalid_pin', via: 'socket', roomId: 'OUTR', role: 'admin', ip: '198.51.100.1' }, t0 + 40_000);
    store.recordAuthFailure({ kind: 'invalid_pin', via: 'http', roomId: 'OUTR', role: 'admin', ip: '198.51.100.9' }, t0 + 50_000);

    const agg = store.getAuthFailures('all');
    expect(agg.topIps[0]).toMatchObject({ n: 3, rooms: 2 });
    expect(agg.topIps[0].first).toBeTruthy();
    expect(agg.topIps[0].last).toBeTruthy();
    expect(agg.topIps[0].first <= agg.topIps[0].last).toBe(true);
    expect(agg.topIps).toHaveLength(2);
    expect(agg.byDay.reduce((sum, d) => sum + d.count, 0)).toBe(agg.total);
  });

  it('limpeza: linhas com mais de 90 dias saem na inicialização', () => {
    const file = path.join(dataDir, 'store-retention.db');
    new AnalyticsStore(file);
    const raw = new Database(file);
    raw.exec(`
      INSERT INTO auth_failures (ts, kind, via, room_id, role, ip_hash, country, city)
      VALUES (datetime('now', '-120 days'), 'invalid_pin', 'http', 'AAAA', 'admin', 'deadbeefdeadbeef', '', '');
      INSERT INTO auth_failures (ts, kind, via, room_id, role, ip_hash, country, city)
      VALUES (datetime('now', '-10 days'), 'invalid_pin', 'http', 'AAAA', 'admin', 'deadbeefdeadbeef', '', '');
    `);
    raw.close();
    const reopened = new AnalyticsStore(file);
    expect(reopened.getAuthFailures('all').total).toBe(1);
  });
});

describe('falha de PIN por HTTP', () => {
  it('grava linha e log sem PIN nem IP cru; sala válida vai como código', async () => {
    const warn = vi.spyOn(app.log, 'warn');
    const ip = freshIp();
    const room = await createRoom();
    const res = await app.inject({
      method: 'POST',
      url: `/rooms/${room.roomId}/access`,
      headers: { 'x-forwarded-for': ip },
      payload: { adminPin: WRONG_PIN }
    });
    expect(res.statusCode).toBe(403);

    const logs = authFailLogs(warn);
    expect(logs).toHaveLength(1);
    const [entry, msg] = logs[0] as [Record<string, unknown>, string];
    expect(msg).toBe('falha de autenticação');
    expect(entry).toMatchObject({ event: 'auth_fail', kind: 'invalid_pin', via: 'http', roomId: room.roomId, role: 'admin' });
    expect(entry.ipHash).toMatch(/^[0-9a-f]{16}$/);
    const serialized = JSON.stringify(logs);
    expect(serialized).not.toContain(WRONG_PIN);
    expect(serialized).not.toContain(ip);
    warn.mockRestore();

    const { status, body } = await failures('?period=all', await masterToken());
    expect(status).toBe(200);
    expect(body.recent.some((r) => r.roomId === room.roomId)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(ip);
  });

  it('refresh de tokens com PIN errado grava invalid_pin via http', async () => {
    const warn = vi.spyOn(app.log, 'warn');
    const ip = freshIp();
    const room = await createRoom();
    const res = await app.inject({
      method: 'POST',
      url: `/rooms/${room.roomId}/refresh-ref-tokens`,
      headers: { 'x-forwarded-for': ip },
      payload: { adminPin: WRONG_PIN }
    });
    expect(res.statusCode).toBe(403);
    const logs = authFailLogs(warn);
    expect(logs[0][0]).toMatchObject({ kind: 'invalid_pin', via: 'http', roomId: room.roomId, role: 'admin' });
    warn.mockRestore();

    const { body } = await failures('?period=all', await masterToken());
    expect(body.recent.some((r) => r.roomId === room.roomId && r.kind === 'invalid_pin' && r.via === 'http')).toBe(true);
  });

  it('roomId fora do formato vira invalid (aqui via bloqueio, o caminho que aceita qualquer id)', async () => {
    const warn = vi.spyOn(app.log, 'warn');
    const ip = freshIp();
    const room = await createRoom();
    // 30 falhas com a sala válida esgotam o orçamento do IP
    for (let i = 0; i < 30; i++) {
      await app.inject({
        method: 'POST',
        url: `/rooms/${room.roomId}/access`,
        headers: { 'x-forwarded-for': ip },
        payload: { adminPin: `${i}-${WRONG_PIN}` }
      });
    }
    // o bloqueio roda antes da busca da sala: id lixo chega até o log
    const blocked = await app.inject({
      method: 'POST',
      url: '/rooms/%3Cscript%3Ealert(1)%3C%2Fscript%3E/access',
      headers: { 'x-forwarded-for': ip },
      payload: { adminPin: '0000' }
    });
    expect(blocked.statusCode).toBe(429);
    const last = authFailLogs(warn).at(-1) as [Record<string, unknown>] | undefined;
    expect(last?.[0]).toMatchObject({ kind: 'blocked', via: 'http', roomId: 'invalid', role: 'admin' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('script');
    warn.mockRestore();
  });

  it('dentro de 10 s, repetir a mesma falha não gera nova linha nem novo log', async () => {
    const warn = vi.spyOn(app.log, 'warn');
    const ip = freshIp();
    const room = await createRoom();
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: `/rooms/${room.roomId}/access`,
        headers: { 'x-forwarded-for': ip },
        payload: { adminPin: WRONG_PIN }
      });
    }
    expect(authFailLogs(warn)).toHaveLength(1);
    warn.mockRestore();

    const { body } = await failures('?period=all', await masterToken());
    const mine = body.recent.filter((r) => r.roomId === room.roomId);
    expect(mine).toHaveLength(1);
  });
});

describe('falha de token/PIN pelo socket', () => {
  it('client:register com PIN errado grava linha e log com via socket', async () => {
    const warn = vi.spyOn(app.log, 'warn');
    const ip = freshIp();
    const room = await createRoom();
    const socket = ioClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { 'x-forwarded-for': ip }
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const ack = await socket.timeout(3000).emitWithAck('client:register', {
      roomId: room.roomId,
      role: 'admin',
      pin: WRONG_PIN
    });
    expect(ack).toEqual({ error: 'invalid_pin' });

    const logs = authFailLogs(warn);
    expect(logs).toHaveLength(1);
    expect(logs[0][0]).toMatchObject({ kind: 'invalid_pin', via: 'socket', roomId: room.roomId, role: 'admin' });
    expect(JSON.stringify(logs)).not.toContain(WRONG_PIN);
    expect(JSON.stringify(logs)).not.toContain(ip);
    warn.mockRestore();
  });

  it('token de árbitro errado grava invalid_token com o papel', async () => {
    const warn = vi.spyOn(app.log, 'warn');
    const ip = freshIp();
    const room = await createRoom();
    const socket = ioClient(baseUrl, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { 'x-forwarded-for': ip }
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const ack = await socket.timeout(3000).emitWithAck('client:register', {
      roomId: room.roomId,
      role: 'center',
      token: WRONG_TOKEN
    });
    expect(ack).toEqual({ error: 'invalid_token' });
    const logs = authFailLogs(warn);
    expect(logs[0][0]).toMatchObject({ kind: 'invalid_token', via: 'socket', role: 'center' });
    expect(JSON.stringify(logs)).not.toContain(WRONG_TOKEN);
    warn.mockRestore();
  });
});

describe('GET /master/auth-failures', () => {
  it('sem token → 401', async () => {
    const { status, body } = await failures('?period=all');
    expect(status).toBe(401);
    expect(body).toEqual({ error: 'unauthorized' });
  });

  it('Bearer forjado → 401', async () => {
    const forged = await failures('?period=all', 'forjado.token.xyz');
    expect(forged.status).toBe(401);
    // assinatura válida de outra chave também não passa
    const fakeSig = `${Buffer.from('{"u":"test-user"}').toString('base64url')}.AAAA`;
    const sig = await failures('?period=all', fakeSig);
    expect(sig.status).toBe(401);
  });

  it('com token válido → formato agregado', async () => {
    const { status, body } = await failures('?period=7d&tz=-180', await masterToken());
    expect(status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        byKind: expect.any(Object),
        byVia: expect.any(Object),
        topIps: expect.any(Array),
        byDay: expect.any(Array),
        recent: expect.any(Array)
      })
    );
    expect(body.recent.length).toBeLessThanOrEqual(50);
  });
});
