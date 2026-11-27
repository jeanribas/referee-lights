// Salas com atividade no período (online e bundle): sala criada antes do
// recorte mas conectada dentro dele conta; janela anterior de mesmo tamanho;
// campos antigos com o mesmo valor de antes.
import { afterAll, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const { AnalyticsStore } = await import('../src/analytics.js');

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-atividade-'));
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
    // Antigo: sala criada no período = 0; conexão de hoje = 1.
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalConnections).toBe(1);
    expect(stats.uniqueIps).toBe(1);
    // Novo: a sala foi usada hoje.
    expect(stats.activeSessions).toBe(1);

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

    expect(store.getStats(0, 'today').activeSessions).toBe(1);
    expect(store.getTimeline('today').at(-1)!.activeSessions).toBe(1);
    // Antigo continua somando conexões (2).
    expect(store.getStats(0, 'today').totalConnections).toBe(2);
  });

  it('sala criada e conectada no mesmo dia conta 1', () => {
    const { store } = freshStore();
    const sid = store.logSessionCreated('SAME', '1234');
    store.logConnection(sid, 'left', 'left', '10.0.0.1');
    store.logConnection(sid, 'right', 'right', '10.0.0.2');

    const stats = store.getStats(0, 'today');
    expect(stats.totalSessions).toBe(1);
    expect(stats.activeSessions).toBe(1);
    expect(store.getTimeline('today').at(-1)!.activeSessions).toBe(1);
  });

  it('sala criada hoje sem conexão conta como ativa (criada no período)', () => {
    const { store } = freshStore();
    store.logSessionCreated('ONLY', '1234');
    expect(store.getStats(0, 'today').activeSessions).toBe(1);
  });

  it('janela anterior: sala só ativa antes aparece no previous e não no atual', () => {
    const { store, raw } = freshStore();
    // Ativa só ontem: entra na janela anterior de 'today'.
    const sid = insertSession(raw, 'YEST', '-1 days');
    insertConnection(raw, sid, '-1 days');
    raw.close();

    const stats = store.getStats(0, 'today');
    expect(stats.activeSessions).toBe(0);
    expect(stats.activeSessionsPrevious).toBe(1);
  });

  it('janela anterior de 7d: sala ativa há 9 dias conta só no previous', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'OLDW', '-9 days');
    insertConnection(raw, sid, '-9 days');
    raw.close();

    const stats = store.getStats(0, '7d');
    expect(stats.activeSessions).toBe(0);
    expect(stats.activeSessionsPrevious).toBe(1);
  });

  it("period='all' devolve activeSessionsPrevious null", () => {
    const { store } = freshStore();
    store.logSessionCreated('ALL1', '1234');
    const stats = store.getStats(0, 'all');
    expect(stats.activeSessionsPrevious).toBeNull();
    expect(stats.activeSessions).toBe(1);
  });

  it('timeline por dia: cada dia conta as salas ativas nele, mesmo que a sala seja de antes', () => {
    const { store, raw } = freshStore();
    const sid = insertSession(raw, 'MULTI', '-3 days');
    insertConnection(raw, sid, '-3 days');
    insertConnection(raw, sid, '-1 days');
    raw.close();

    const days = store.getTimeline('7d');
    const withActivity = days.filter((d) => d.activeSessions > 0);
    // Sala ativa em dois dias distintos: 1 em cada dia.
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
    expect(store.getBundleSummary('self', 'today').activeSessions).toBe(1);

    const again = freshStore();
    insertBundleEvent(again.raw, 'inst-a', 'connection', 'ABCD', null, '-0 days');
    insertBundleEvent(again.raw, 'inst-b', 'connection', 'ABCD', null, '-0 days');
    again.raw.close();
    expect(again.store.getBundleSummary('self', 'today').activeSessions).toBe(2);
    const timeline = again.store.getBundleTimeline('today', 'self').at(-1)!;
    expect(timeline.activeSessions).toBe(2);
    // Antigo intacto: eventos de connection = 2.
    expect(timeline.connections).toBe(2);
  });

  it('evento sem sala não conta', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'error', null, '{"message":"x"}', '-0 days');
    insertBundleEvent(raw, 'inst-a', 'error', '', null, '-0 days');
    raw.close();
    expect(store.getBundleSummary('self', 'today').activeSessions).toBe(0);
  });

  it('sala vinda do payload (room_id nulo) conta; payload inválido não derruba a consulta', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', null, '{"roomId":"PAY1"}', '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', null, '{truncado', '-0 days');
    raw.close();
    expect(store.getBundleSummary('self', 'today').activeSessions).toBe(1);
  });

  it('a instância excluída (própria) não conta', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'self', 'connection', 'MINE', null, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', 'MINE', null, '-0 days');
    raw.close();
    expect(store.getBundleSummary('self', 'today').activeSessions).toBe(1);
    expect(store.getBundleTimeline('today', 'self').at(-1)!.activeSessions).toBe(1);
  });

  it('janela anterior de bundle: evento de ontem conta só no previous', () => {
    const { store, raw } = freshStore();
    insertBundleEvent(raw, 'inst-a', 'connection', 'YEST', null, '-1 days');
    raw.close();
    const summary = store.getBundleSummary('self', 'today');
    expect(summary.activeSessions).toBe(0);
    expect(summary.activeSessionsPrevious).toBe(1);
    expect(store.getBundleSummary('self', 'all').activeSessionsPrevious).toBeNull();
  });
});

describe('campos antigos do resumo e da timeline não regridem', () => {
  it('sessões, conexões e bundle antigos mantêm os mesmos valores', () => {
    const { store, raw } = freshStore();
    const old = insertSession(raw, 'ANT1', '-3 days');
    insertConnection(raw, old, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'session_created', 'BDL1', null, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'connection', 'BDL1', null, '-0 days');
    insertBundleEvent(raw, 'inst-a', 'decision', 'BDL1', null, '-0 days');
    raw.close();

    const stats = store.getStats(3, 'today');
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalConnections).toBe(1);
    expect(stats.uniqueIps).toBe(1);
    expect(stats.activeRooms).toBe(3);

    const bundle = store.getBundleSummary('self', 'today');
    expect(bundle).toMatchObject({ sessions: 1, connections: 1, decisions: 1, errors: 0 });

    const bt = store.getBundleTimeline('today', 'self').at(-1)!;
    expect(bt).toMatchObject({ sessions: 1, connections: 1, devices: 1, decisions: 1 });

    const tl = store.getTimeline('today').at(-1)!;
    expect(tl).toMatchObject({ sessions: 0, connections: 1, devices: 1 });
  });
});
