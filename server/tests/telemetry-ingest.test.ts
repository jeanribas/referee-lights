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

  it('grava eventos de decisão e de erro (uso e falhas são dados de primeira classe)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/telemetry/events',
      payload: {
        events: [
          { instanceId: INSTANCE, event: 'decision', data: { roomId: 'ROOM01', white: 2, red: 1 } },
          { instanceId: INSTANCE, event: 'error', data: { context: 'uncaughtException', message: 'boom' } }
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
          {
            instanceId: INSTANCE,
            appVersion: '1.2.3',
            hostname: 'PC-FEDERACAO',
            platform: 'win32',
            arch: 'x64',
            nodeVersion: 'v22.23.2',
            uptimeSeconds: 300,
            timestamp: new Date().toISOString(),
            stats: {
              activeRooms: 1,
              totalSessions: 3,
              totalConnections: 9,
              uniqueIps: 4,
              rooms: [{ id: 'VMRM', createdAt: Date.now(), connectedJudges: 2, phase: 'idle' }]
            }
          }
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
    expect(types).toEqual(['connection', 'decision', 'disconnection', 'error', 'session_created']);
    const withRoom = body.events.find((e: { event_type: string }) => e.event_type === 'session_created');
    expect(withRoom.room_id).toBe('ROOM01');
    expect(body.samples.length).toBeGreaterThanOrEqual(2);
  });

  it('todas as abas recebem o lado bundle: stats, online, timeline e sessões', async () => {
    const token = await masterToken();
    const auth = { authorization: `Bearer ${token}` };

    const stats = (await app.inject({ method: 'GET', url: '/master/stats?period=today', headers: auth })).json();
    expect(stats.bundle.instances).toBeGreaterThanOrEqual(1);
    // recorte por período vem dos eventos; vida inteira vem dos contadores
    expect(stats.bundle.sessions).toBe(1);
    expect(stats.bundle.connections).toBe(1);
    expect(stats.bundle.decisions).toBe(1);
    expect(stats.bundle.errors).toBe(1);
    expect(stats.bundle.lifetimeSessions).toBe(3);

    const hourly = (await app.inject({ method: 'GET', url: '/master/hourly', headers: auth })).json();
    expect(hourly.bundleHourly).toHaveLength(24);
    expect(hourly.bundleHourly.reduce((a: number, r: { count: number }) => a + r.count, 0)).toBe(1);

    const roles = (await app.inject({ method: 'GET', url: '/master/roles', headers: auth })).json();
    expect(roles.bundleRoles).toEqual([{ role: 'judge-left', count: 1 }]);

    const online = (await app.inject({ method: 'GET', url: '/master/online', headers: auth })).json();
    expect(online.bundleCount).toBeGreaterThanOrEqual(1);
    expect(online.bundleInstances[0].instance_id).toBe(INSTANCE);
    // granularidade por sala: o master vê a sala do bundle como vê as online
    expect(online.bundleInstances[0].rooms).toEqual([
      expect.objectContaining({ id: 'VMRM', connectedJudges: 2, phase: 'idle' })
    ]);

    const timeline = (await app.inject({ method: 'GET', url: '/master/timeline?period=today', headers: auth })).json();
    const today = timeline.bundleTimeline.at(-1);
    expect(today.sessions).toBe(1);
    expect(today.decisions).toBe(1);

    const sessions = (await app.inject({ method: 'GET', url: '/master/sessions', headers: auth })).json();
    const bs = sessions.bundleSessions.find((x: { room_id: string }) => x.room_id === 'ROOM01');
    expect(bs.instance_id).toBe(INSTANCE);
  });

  it('instalação pode ganhar apelido e ele volta nas listas', async () => {
    const token = await masterToken();
    const auth = { authorization: `Bearer ${token}` };
    const set = await app.inject({
      method: 'POST',
      url: `/master/instances/${INSTANCE}/label`,
      headers: auth,
      payload: { label: 'VM de Teste' }
    });
    expect(set.statusCode).toBe(200);
    const list = (await app.inject({ method: 'GET', url: '/master/instances', headers: auth })).json();
    expect(list.instances.find((i: { instance_id: string }) => i.instance_id === INSTANCE).label).toBe('VM de Teste');
    const missing = await app.inject({
      method: 'POST',
      url: '/master/instances/nao-existe/label',
      headers: auth,
      payload: { label: 'x' }
    });
    expect(missing.statusCode).toBe(404);
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
    // versão veio da amostra nova; a amostra sem stats/versão não a apagou
    expect(inst.app_version).toBe('1.2.3');
    // nome da máquina vem automático no heartbeat
    expect(inst.hostname).toBe('PC-FEDERACAO');
  });
});
