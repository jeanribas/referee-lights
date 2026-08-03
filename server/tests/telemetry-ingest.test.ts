// Integração: filhos (bundles) reportam eventos + heartbeat, e o master lê
// tudo em /master/instances/:id/activity. Protege a premissa do produto de
// regressões como a de 02/ago/2026, quando a rota passou a descartar eventos.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-analytics-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

const INSTANCE = 'itest-instance-0001';

let app: Awaited<ReturnType<typeof buildApp>>;

async function buildApp() {
  const { createServer } = await import('../src/server.js');
  return createServer();
}

async function masterToken(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/master/auth',
    payload: { user: 'test-user', password: 'test-password' }
  });
  expect(res.statusCode).toBe(200);
  return res.json().token as string;
}

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('ingestão de telemetria dos filhos', () => {
  it('grava eventos por sala enviados pelo bundle', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      payload: {
        events: [
          { instanceId: INSTANCE, event: 'session_created', data: { roomId: 'ROOM01' }, timestamp: new Date().toISOString() },
          { instanceId: INSTANCE, event: 'connection', data: { roomId: 'ROOM01', role: 'judge-left', ipHash: 'abcd1234' } }
        ]
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, stored: 2 });
  });

  it('ignora eventos malformados sem derrubar o lote', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      payload: { events: [{ foo: 'bar' }, 42, null, { instanceId: INSTANCE, event: 'disconnection' }] }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, stored: 1 });
  });

  it('aceita heartbeat no formato antigo (amostra única, bundles 1.2.x)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/heartbeat',
      payload: {
        instanceId: INSTANCE,
        platform: 'win32',
        arch: 'x64',
        nodeVersion: 'v20.18.1',
        uptimeSeconds: 120,
        stats: { activeRooms: 1, totalSessions: 3, totalConnections: 9, uniqueIps: 4 }
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, stored: 1 });
  });

  it('aceita heartbeat no formato novo ({samples:[...]})', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/heartbeat',
      payload: {
        samples: [
          { instanceId: INSTANCE, platform: 'win32', arch: 'x64', nodeVersion: 'v22.23.2', uptimeSeconds: 300, timestamp: new Date().toISOString() }
        ]
      }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, stored: 1 });
  });
});

describe('leitura pelo master', () => {
  it('exige autenticação na atividade da instância', async () => {
    const res = await app.inject({ method: 'GET', url: `/master/instances/${INSTANCE}/activity` });
    expect(res.statusCode).toBe(401);
  });

  it('devolve eventos e histórico de heartbeat da instância', async () => {
    const token = await masterToken();
    const res = await app.inject({
      method: 'GET',
      url: `/master/instances/${INSTANCE}/activity`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const types = body.events.map((e: { event_type: string }) => e.event_type).sort();
    expect(types).toEqual(['connection', 'disconnection', 'session_created']);
    const withRoom = body.events.find((e: { event_type: string }) => e.event_type === 'session_created');
    expect(withRoom.room_id).toBe('ROOM01');
    expect(body.samples.length).toBeGreaterThanOrEqual(2);
  });

  it('a instância aparece na lista com os contadores do heartbeat', async () => {
    const token = await masterToken();
    const res = await app.inject({
      method: 'GET',
      url: '/master/instances',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(200);
    const inst = res.json().instances.find((i: { instance_id: string }) => i.instance_id === INSTANCE);
    expect(inst).toBeDefined();
    expect(inst.total_sessions).toBe(3);
  });
});
