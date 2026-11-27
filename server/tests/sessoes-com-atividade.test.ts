// Salas com atividade no período (online e bundle): sala criada antes do
// recorte mas conectada dentro dele conta; janela anterior de mesmo tamanho;
// campos antigos com o mesmo valor de antes. getStats e getBundleSummary (usados
// no heartbeat) não trazem os campos novos; eles saem só em /master/stats.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';
process.env.TRUST_PROXY_HOPS = '1';

// Antes de qualquer import de src: config.ts (via geo.ts) lê o ambiente na carga.
const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-atividade-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'rota-analytics.db');

const { AnalyticsStore, periodWindow, previousWindowBounds } = await import('../src/analytics.js');

let seq = 0;

function freshStore(): { store: InstanceType<typeof AnalyticsStore>; raw: Database.Database } {
  seq += 1;
  const dbPath = path.join(dataDir, `atividade-${seq}.db`);
  const store = new AnalyticsStore(dbPath);
  // Escrita direta com datas passadas (o analytics grava "agora").
  const raw = new Database(dbPath);
  return { store, raw };
}

/** Sessão (sala criada) com data relativa ao SQLite, ex.: '-3 days'. Devolve o id. */
function insertSession(raw: Database.Database, roomId: string, when: string): number {
  const res = raw
    .prepare(`INSERT INTO sessions (room_id, admin_pin_hash, created_at) VALUES (?, 'x', datetime('now', ?))`)
    .run(roomId, when);
  return Number(res.lastInsertRowid);
}

function insertConnection(raw: Database.Database, sessionId: number, when: string): void {
  raw
    .prepare(`INSERT INTO connections (session_id, role, ip, connected_at) VALUES (?, 'left', '10.0.0.1', datetime('now', ?))`)
    .run(sessionId, when);
}

/** Evento de bundle com data relativa ao SQLite ('-0 days', '-1 days'...). */
function insertBundleEvent(
  raw: Database.Database,
  instanceId: string,
  eventType: string,
  roomId: string | null,
  payload: string | null,
  when: string
): void {
  raw
    .prepare(
      `INSERT INTO instance_events (instance_id, event_type, room_id, payload, received_at) VALUES (?, ?, ?, ?, datetime('now', ?))`
    )
    .run(instanceId, eventType, roomId, payload, when);
}

/** Evento de bundle com data absoluta no formato do SQLite (para limites exatos). */
function insertBundleEventAt(
  raw: Database.Database,
  instanceId: string,
  eventType: string,
  roomId: string,
  receivedAt: string
): void {
  raw
    .prepare(`INSERT INTO instance_events (instance_id, event_type, room_id, payload, received_at) VALUES (?, ?, ?, NULL, ?)`)
    .run(instanceId, eventType, roomId, receivedAt);
}

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('salas online com atividade no período', () => {
  it('sala criada há 3 dias com conexão hoje conta como ativa hoje; campos antigos não mudam', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'OLD1', '-3 days');
    insertConnection(raw, sid, '-0 days');
    raw.close();

    const stats = store.getStats(0, 'today');
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalConnections).toBe(1);
    expect(stats.uniqueIps).toBe(1);
    expect(store.getActiveSessions('today').online).toEqual({ current: 1, previous: 0 });

    const today = store.getTimeline('today').at(-1)!;
    expect(today.sessions).toBe(0);
    expect(today.connections).toBe(1);
    expect(today.activeSessions).toBe(1);
  });

  it('duas conexões da mesma sala no mesmo dia contam 1', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'DUP1', '-2 days');
    insertConnection(raw, sid, '-0 days');
    insertConnection(raw, sid, '-0 days');
    raw.close();

    expect(store.getActiveSessions('today').online.current).toBe(1);
    expect(store.getTimeline('today').at(-1)!.activeSessions).toBe(1);
    expect(store.getStats(0, 'today').totalConnections).toBe(2);
  });

  it('sala criada e conectada no mesmo dia conta 1', () => {
    const { store } = freshStore();
    const sid = store.logSessionCreated('SAME', '1234');
    store.logConnection(sid, 'left', 'left', '10.0.0.1');
    store.logConnection(sid, 'right', 'right', '10.0.0.2');

    expect(store.getStats(0, 'today').totalSessions).toBe(1);
    expect(store.getActiveSessions('today').online.current).toBe(1);
    expect(store.getTimeline('today').at(-1)!.activeSessions).toBe(1);
  });

  it('sala criada hoje sem conexão conta como ativa (criada no período)', () => {
    const { store } = freshStore();
    store.logSessionCreated('ONLY', '1234');
    expect(store.getActiveSessions('today').online.current).toBe(1);
  });

  it('conexão online com session_id NULL não conta', () => {
    const { store } = freshStore();
    store.logConnection(null, 'left', 'left', '10.0.0.1');
    expect(store.getStats(0, 'today').totalConnections).toBe(1);
    expect(store.getActiveSessions('today').online).toEqual({ current: 0, previous: 0 });
  });

  it('janela anterior: sala só ativa ontem aparece no previous e não no atual', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'YEST', '-1 days');
    insertConnection(raw, sid, '-1 days');
    raw.close();

    expect(store.getActiveSessions('today').online).toEqual({ current: 0, previous: 1 });
  });

  it('janela anterior de 7d: sala ativa há 9 dias conta só no previous', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'OLDW', '-9 days');
    insertConnection(raw, sid, '-9 days');
    raw.close();

    expect(store.getActiveSessions('7d').online).toEqual({ current: 0, previous: 1 });
  });

  it('sala ativa nos dois períodos conta nos dois', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'BOTH', '-1 days');
    insertConnection(raw, sid, '-1 days');
    insertConnection(raw, sid, '-0 days');
    raw.close();

    expect(store.getActiveSessions('today').online).toEqual({ current: 1, previous: 1 });
  });

  it("period='all' devolve previous null", () => {
    const { store } = freshStore();
    store.logSessionCreated('ALL1', '1234');
    expect(store.getActiveSessions('all').online).toEqual({ current: 1, previous: null });
    expect(store.getActiveSessions('all').bundle.previous).toBeNull();
  });

  it('timeline por dia: cada dia conta as salas ativas nele', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'MULTI', '-3 days');
    insertConnection(raw, sid, '-3 days');
    insertConnection(raw, sid, '-1 days');
    raw.close();

    const withActivity = store.getTimeline('7d').filter((d) => d.activeSessions > 0);
    expect(withActivity).toHaveLength(2);
    expect(withActivity.every((d) => d.activeSessions === 1)).toBe(true);
  });
});

describe('bundles: pares instância|sala com atividade', () => {
  it('mesma instância+sala em dois eventos conta 1; mesma sala em outra instância conta 2', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', 'ABCD', '{"roomId":"ABCD"}', '-0 days');
    insertBundleEvent(raw, 'inst-a', 'decision', 'ABCD', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.current).toBe(1);

    const again = freshStore();
    insertBundleEvent(again.raw, 'inst-a', 'connection', 'ABCD', null, '-0 days');
    insertBundleEvent(again.raw, 'inst-b', 'connection', 'ABCD', null, '-0 days');
    again.raw.close();
    expect(again.store.getActiveSessions('today', 0, 'self').bundle.current).toBe(2);
    const timeline = again.store.getBundleTimeline('today', 'self').at(-1)!;
    expect(timeline.activeSessions).toBe(2);
    expect(timeline.connections).toBe(2);
  });

  it('evento sem sala não conta', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', null, '{"message":"x"}', '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', '', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.current).toBe(0);
  });

  it('sala vinda do payload (room_id nulo) conta; payload inválido não derruba a consulta', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', null, '{"roomId":"PAY1"}', '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', null, '{truncado', '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.current).toBe(1);
  });

  it('a instância excluída (própria) não conta', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'self', 'connection', 'MINE', null, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', 'MINE', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.current).toBe(1);
    expect(store.getBundleTimeline('today', 'self').at(-1)!.activeSessions).toBe(1);
  });

  it('room_archived só não conta, nem no total nem na timeline', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'room_archived', 'ARCH', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.current).toBe(0);
    expect(store.getBundleTimeline('today', 'self').at(-1)!.activeSessions).toBe(0);
  });

  it('disconnection só não conta, nem no total nem na timeline', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'disconnection', 'DISC', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.current).toBe(0);
    expect(store.getBundleTimeline('today', 'self').at(-1)!.activeSessions).toBe(0);
  });

  it('room_archived de ontem não infla hoje nem conta a sala em dois dias', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', 'DOIS', null, '-1 days');
    insertBundleEvent(raw, 'inst-a', 'room_archived', 'DOIS', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle).toEqual({ current: 0, previous: 1 });
  });

  it('janela anterior de bundle: evento de ontem conta só no previous', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', 'YEST', null, '-1 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle).toEqual({ current: 0, previous: 1 });
    expect(store.getActiveSessions('all', 0, 'self').bundle.previous).toBeNull();
  });

  it('sala ativa nos dois períodos de bundle conta nos dois', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', 'BOTHB', null, '-1 days');
    insertBundleEvent(raw, 'inst-a', 'connection', 'BOTHB', null, '-0 days');
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle).toEqual({ current: 1, previous: 1 });
  });
});

describe('limites das janelas', () => {
  it('evento exatamente em since conta no atual e não no anterior', () => {
    const { store, raw } = freshStore();
    const { since } = periodWindow('today', 0);
    insertBundleEventAt(raw, 'inst-a', 'connection', 'EDGE1', since!);
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle).toEqual({ current: 1, previous: 0 });
  });

  it('evento exatamente no início do anterior (= from) conta no anterior', () => {
    const { store, raw } = freshStore();
    const prev = previousWindowBounds('today', 0, Date.now())!;
    insertBundleEventAt(raw, 'inst-a', 'connection', 'EDGE2', prev.from);
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle).toEqual({ current: 0, previous: 1 });
  });

  it('evento exatamente no fim do anterior (= since) fica fora do anterior', () => {
    const { store, raw } = freshStore();
    const { since } = periodWindow('today', 0);
    insertBundleEventAt(raw, 'inst-a', 'connection', 'EDGE3', since!);
    raw.close();
    expect(store.getActiveSessions('today', 0, 'self').bundle.previous).toBe(0);
  });

  it('previousWindowBounds com tz -180 (Brasília) fecha no since local', () => {
    // 27/11/2026 12:00 UTC = 27/11 09:00 em Brasília.
    const now = Date.UTC(2026, 10, 27, 12, 0, 0);
    expect(previousWindowBounds('today', -180, now)).toEqual({
      from: '2026-11-26 03:00:00',
      to: '2026-11-27 03:00:00'
    });
  });

  it('período desconhecido cai em 30 dias', () => {
    const now = Date.UTC(2026, 10, 27, 12, 0, 0);
    expect(previousWindowBounds('xyz', 0, now)).toEqual({
      from: '2026-09-29 00:00:00',
      to: '2026-10-29 00:00:00'
    });
    expect(previousWindowBounds(undefined, 0, now)).toEqual(previousWindowBounds('30d', 0, now));
  });
});

describe('campos antigos não regridem e heartbeat não muda', () => {
  it('sessões, conexões e bundle antigos mantêm os mesmos valores', () => {
    const { store, raw } = freshStore();
    const old = insertSession(raw, 'ANT1', '-3 days');
    insertConnection(raw, old, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'session_created', 'BDL1', null, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', 'BDL1', null, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'decision', 'BDL1', null, '-0 days');
    raw.close();

    const stats = store.getStats(3, 'today');
    expect(stats).toMatchObject({ totalSessions: 0, totalConnections: 1, uniqueIps: 1, activeRooms: 3 });

    const bundle = store.getBundleSummary('self', 'today');
    expect(bundle).toMatchObject({ sessions: 1, connections: 1, decisions: 1, errors: 0 });

    const bt = store.getBundleTimeline('today', 'self').at(-1)!;
    expect(bt).toMatchObject({ sessions: 1, connections: 1, devices: 1, decisions: 1 });

    const tl = store.getTimeline('today').at(-1)!;
    expect(tl).toMatchObject({ sessions: 0, connections: 1, devices: 1 });
  });

  it('getStats e getBundleSummary não trazem os campos novos (heartbeat igual)', () => {
    const { store } = freshStore();
    store.logSessionCreated('HB', '1234');
    const stats = store.getStats(0, 'today');
    const bundle = store.getBundleSummary('self', 'today');
    expect(Object.keys(stats)).not.toContain('activeSessions');
    expect(Object.keys(stats)).not.toContain('activeSessionsPrevious');
    expect(Object.keys(bundle)).not.toContain('activeSessions');
    expect(Object.keys(bundle)).not.toContain('activeSessionsPrevious');
  });
});

describe('rota /master/stats', () => {
  type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
  let app: App;

  beforeAll(async () => {
    const { createServer } = await import('../src/server.js');
    app = await createServer();
    // Mesma base que o servidor usa: dados com datas controladas.
    const raw = new Database(process.env.ANALYTICS_DB_PATH!);
    const sid = insertSession(raw, 'ROUTE', '-3 days');
    insertConnection(raw, sid, '-0 days');
    insertBundleEvent(raw, 'inst-x', 'connection', 'R1', null, '-0 days');
    raw.close();
  });

  afterAll(async () => {
    await app.close();
  });

  it('sem token responde 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/master/stats?period=today',
      headers: { 'x-forwarded-for': '10.98.0.1' }
    });
    expect(res.statusCode).toBe(401);
  });

  it('com token traz os 4 campos novos e os antigos', async () => {
    const auth = await app.inject({
      method: 'POST',
      url: '/master/auth',
      headers: { 'x-forwarded-for': '10.98.0.2' },
      payload: { user: 'test-user', password: 'test-password' }
    });
    const token = auth.json().token as string;
    const res = await app.inject({
      method: 'GET',
      url: '/master/stats?period=today',
      headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': '10.98.0.3' }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      totalSessions: 0,
      totalConnections: 1,
      activeSessions: 1,
      activeSessionsPrevious: 0,
      bundle: { activeSessions: 1, activeSessionsPrevious: 0 }
    });
    expect(typeof body.bundle.sessions).toBe('number');
  });
});
