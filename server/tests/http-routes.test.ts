// Rotas HTTP públicas e administrativas: criação/acesso de sala, health, auth
// administrativa (sucesso, falha, 401 em todas as rotas protegidas), ingestão nos dois
// formatos e limites de taxa. Banco SQLite isolado em diretório
// temporário; envio externo desligado — nada sai da máquina.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';
// Simula o Traefik da produção: o X-Forwarded-For de um valor só é o IP real.
process.env.TRUST_PROXY_HOPS = '1';

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-http-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
let app: App;

// Cada cenário usa um "IP" próprio via X-Forwarded-For para não dividir o
// balde do rate limit com os outros testes.
let ipSeq = 0;
function freshIp() {
  ipSeq += 1;
  return `10.99.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

async function adminToken(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/master/auth',
    headers: { 'x-forwarded-for': freshIp() },
    payload: { user: 'test-user', password: 'test-password' }
  });
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

beforeAll(async () => {
  const { createServer } = await import('../src/server.js');
  app = await createServer();
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('health', () => {
  it('GET /health responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});

describe('salas', () => {
  it('POST /rooms cria sala com código, PIN e 3 tokens distintos', async () => {
    const res = await app.inject({ method: 'POST', url: '/rooms', payload: {} });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.roomId).toMatch(/^[A-Z0-9]{4,}$/);
    expect(body.adminPin).toMatch(/^\d{4,}$/);
    const tokens = [body.joinQRCodes.left.token, body.joinQRCodes.center.token, body.joinQRCodes.right.token];
    expect(new Set(tokens).size).toBe(3);
    tokens.forEach((t: string) => expect(t.length).toBeGreaterThan(8));
  });

  it('POST /rooms sem corpo continua compatível', async () => {
    const res = await app.inject({ method: 'POST', url: '/rooms' });
    expect(res.statusCode).toBe(201);
    expect(res.json().roomId).toBeTruthy();
  });

  it('salas criadas em sequência têm códigos únicos', async () => {
    const ids = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const res = await app.inject({ method: 'POST', url: '/rooms', payload: {} });
      ids.add(res.json().roomId);
    }
    expect(ids.size).toBe(30);
  });

  it('POST /rooms/:id/access valida PIN e sala', async () => {
    const created = (await app.inject({ method: 'POST', url: '/rooms', payload: {} })).json();

    const ok = await app.inject({
      method: 'POST',
      url: `/rooms/${created.roomId}/access`,
      payload: { adminPin: created.adminPin }
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(created);

    const wrongPin = await app.inject({
      method: 'POST',
      url: `/rooms/${created.roomId}/access`,
      payload: { adminPin: '0000x' }
    });
    expect(wrongPin.statusCode).toBe(403);
    expect(wrongPin.json()).toEqual({ error: 'invalid_pin' });

    const noPin = await app.inject({ method: 'POST', url: `/rooms/${created.roomId}/access`, payload: {} });
    expect(noPin.statusCode).toBe(403);

    const unknown = await app.inject({ method: 'POST', url: '/rooms/ZZZZZZ/access', payload: { adminPin: '1234' } });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: 'room_not_found' });
  });

  it('refresh-ref-tokens gera tokens novos e exige PIN', async () => {
    const created = (await app.inject({ method: 'POST', url: '/rooms', payload: {} })).json();
    const denied = await app.inject({
      method: 'POST',
      url: `/rooms/${created.roomId}/refresh-ref-tokens`,
      payload: { adminPin: 'errado' }
    });
    expect(denied.statusCode).toBe(403);

    const res = await app.inject({
      method: 'POST',
      url: `/rooms/${created.roomId}/refresh-ref-tokens`,
      payload: { adminPin: created.adminPin }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.roomId).toBe(created.roomId);
    expect(body.joinQRCodes.left.token).not.toBe(created.joinQRCodes.left.token);

    const missing = await app.inject({
      method: 'POST',
      url: '/rooms/ZZZZZZ/refresh-ref-tokens',
      payload: { adminPin: '1' }
    });
    expect(missing.statusCode).toBe(404);
  });
});

describe('auth administrativa', () => {
  it('credenciais corretas devolvem token', async () => {
    const token = await adminToken();
    expect(token).toContain('.');
  });

  it('credenciais erradas → 403 invalid_credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/master/auth',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { user: 'test-user', password: 'errada' }
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'invalid_credentials' });
  });

  it('corpo vazio → 403, sem 500', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/master/auth',
      headers: { 'x-forwarded-for': freshIp() }
    });
    expect(res.statusCode).toBe(403);
  });

  it('11ª tentativa do mesmo IP em 15 min → 429', async () => {
    const ip = freshIp();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/master/auth',
        headers: { 'x-forwarded-for': ip },
        payload: { user: 'x', password: 'y' }
      });
      codes.push(res.statusCode);
    }
    expect(codes.slice(0, 10).every((c) => c === 403)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  const protectedGets = [
    '/master/stats',
    '/master/sessions',
    '/master/geo',
    '/master/geo-markers',
    '/master/timeline',
    '/master/hourly',
    '/master/roles',
    '/master/duration',
    '/master/activity',
    '/master/instances',
    '/master/instances/abc/activity',
    '/master/devices',
    '/master/locales',
    '/master/referrers',
    '/master/clicks',
    '/master/active',
    '/master/online',
    '/master/pages',
    '/master/hosts'
  ];

  it.each(protectedGets)('GET %s sem token → 401', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it.each(protectedGets)('GET %s com token adulterado → 401', async (url) => {
    const token = await adminToken();
    const tampered = `${token.split('.')[0]}.assinatura-falsa`;
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tampered}` } });
    expect(res.statusCode).toBe(401);
  });

  it.each(protectedGets)('GET %s com token válido → 200', async (url) => {
    const token = await adminToken();
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
  });

  it('POST /master/instances/:id/label exige token', async () => {
    const res = await app.inject({ method: 'POST', url: '/master/instances/x/label', payload: { label: 'a' } });
    expect(res.statusCode).toBe(401);
  });

  it('token expirado (>24h) é recusado', async () => {
    const crypto = await import('node:crypto');
    const payload = Buffer.from(JSON.stringify({ user: 'test-user', ts: Date.now() - 25 * 3600_000 })).toString('base64url');
    const sig = crypto.createHmac('sha256', 'test-secret').update(payload).digest('base64url');
    const res = await app.inject({
      method: 'GET',
      url: '/master/stats',
      headers: { authorization: `Bearer ${payload}.${sig}` }
    });
    expect(res.statusCode).toBe(401);
  });

  it('/master/active lista salas vivas', async () => {
    const created = (await app.inject({ method: 'POST', url: '/rooms', payload: {} })).json();
    const token = await adminToken();
    const res = await app.inject({ method: 'GET', url: '/master/active', headers: { authorization: `Bearer ${token}` } });
    const ids = (res.json().rooms as Array<{ id?: string; roomId?: string }>).map((r) => r.id ?? r.roomId);
    expect(ids).toContain(created.roomId);
  });
});

describe('ingestão nos dois formatos', () => {
  it('amostra única (bundles < 1.3.1)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/heartbeat',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { instanceId: 'http-single-0001', appVersion: '1.2.0', hostname: 'PC-1', uptimeSeconds: 10, stats: {} }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, stored: 1 });
  });

  it('formato {samples:[...]} grava todas', async () => {
    const now = Date.now();
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/heartbeat',
      headers: { 'x-forwarded-for': freshIp() },
      payload: {
        samples: [
          { instanceId: 'http-multi-0001', appVersion: '1.3.1', timestamp: new Date(now - 600_000).toISOString() },
          { instanceId: 'http-multi-0001', appVersion: '1.3.1', timestamp: new Date(now).toISOString() },
          { semInstanceId: true }
        ]
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, stored: 2 });

    const token = await adminToken();
    const list = await app.inject({ method: 'GET', url: '/master/instances', headers: { authorization: `Bearer ${token}` } });
    const ids = (list.json().instances as Array<{ instance_id: string }>).map((i) => i.instance_id);
    expect(ids).toEqual(expect.arrayContaining(['http-single-0001', 'http-multi-0001']));
  });

  it('sinal sem instanceId → 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/heartbeat',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { hostname: 'x' }
    });
    expect(res.statusCode).toBe(400);
  });

  it('sinal com corpo nulo/inválido não derruba a rota', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/heartbeat',
      headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/json' },
      payload: 'null'
    });
    expect(res.statusCode).toBe(400);
  });

  it('eventos: lista vazia/inválida responde stored 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { events: [{ foo: 1 }, null, 'x'] }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, stored: 0 });
  });

  it('sinal: 31ª requisição do mesmo IP no minuto → 429', async () => {
    const ip = freshIp();
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/telemetry/heartbeat',
        headers: { 'x-forwarded-for': ip },
        payload: { instanceId: 'http-rate-0001' }
      });
      last = res.statusCode;
    }
    expect(last).toBe(429);
  });
});

describe('track', () => {
  it('/track/click exige url e limita por IP', async () => {
    const ip = freshIp();
    const missing = await app.inject({ method: 'POST', url: '/track/click', headers: { 'x-forwarded-for': ip }, payload: {} });
    expect(missing.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'POST',
      url: '/track/click',
      headers: { 'x-forwarded-for': ip },
      payload: { url: 'https://example.com' }
    });
    expect(ok.statusCode).toBe(200);
  });

  it('/track/page recusa path sem barra inicial', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/track/page',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { path: 'http://evil' }
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('key relay', () => {
  it('status responde e start exige roomId', async () => {
    const status = await app.inject({ method: 'GET', url: '/key-relay/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ available: false, active: false });
    const start = await app.inject({ method: 'POST', url: '/key-relay/start', payload: {} });
    expect(start.statusCode).toBe(400);
    expect(start.json()).toEqual({ error: 'missing_room_id' });
    const stop = await app.inject({ method: 'POST', url: '/key-relay/stop' });
    expect(stop.statusCode).toBe(200);
  });
});
