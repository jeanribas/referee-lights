// Todo número com recorte (Hoje / 7 dias / 30 dias / Tudo) usa a mesma régua:
// dias de calendário no fuso de quem consulta. Instalação que parou de rodar
// sai do dia/semana em que não rodou; nada fica preso no "histórico completo".
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.GEO_ENABLED = 'false';

const { AnalyticsStore, parseTz, periodWindow } = await import('../src/analytics.js');

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-period-'));
const store = new AnalyticsStore(path.join(dataDir, 'analytics.db'));
// acesso direto ao banco só para datar registros no passado
const db = (store as unknown as { db: { prepare: (sql: string) => { run: (...a: unknown[]) => unknown } } }).db;

const BRT = -180;

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('janela de período', () => {
  it('"hoje" é o dia local, não o dia UTC', () => {
    // 22h de 05/out em Brasília = 01h de 06/out em UTC
    const now = Date.parse('2026-10-06T01:00:00Z');
    expect(periodWindow('today', BRT, now).since).toBe('2026-10-05 03:00:00');
    expect(periodWindow('today', 0, now).since).toBe('2026-10-06 00:00:00');
  });

  it('7 e 30 dias = hoje + dias de calendário anteriores; tudo = sem corte', () => {
    const now = Date.parse('2026-10-05T15:00:00Z');
    expect(periodWindow('7d', BRT, now).since).toBe('2026-09-29 03:00:00');
    expect(periodWindow('30d', BRT, now).since).toBe('2026-09-06 03:00:00');
    expect(periodWindow(undefined, BRT, now).since).toBe('2026-09-06 03:00:00');
    expect(periodWindow('all', BRT, now).since).toBeNull();
  });

  it('fuso inválido vira UTC', () => {
    expect(parseTz('-180')).toBe(-180);
    expect(parseTz('abc')).toBe(0);
    expect(parseTz('1.5')).toBe(0);
    expect(parseTz('9999')).toBe(0);
    expect(parseTz("0'; DROP TABLE x")).toBe(0);
  });
});

describe('instalações no mapa', () => {
  const heartbeat = (instanceId: string) =>
    store.upsertHeartbeat({
      instanceId,
      platform: 'win32',
      arch: 'x64',
      nodeVersion: 'v22',
      uptimeSeconds: 60,
      stats: { activeRooms: 0, totalSessions: 0, totalConnections: 0, uniqueIps: 0 }
    });

  it('instalação sem sinal no recorte some do recorte, mas fica em "tudo"', () => {
    heartbeat('inst-hoje');
    heartbeat('inst-antiga');
    db.prepare("UPDATE instances SET lat = -27.6, lng = -48.6, city = 'Palhoça', country = 'BR'").run();
    db.prepare("UPDATE instances SET last_seen = datetime('now', '-10 days') WHERE instance_id = 'inst-antiga'").run();
    // amostra antiga no formato ISO da origem
    db.prepare(
      "UPDATE instance_samples SET sampled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-10 days') WHERE instance_id = 'inst-antiga'"
    ).run();

    const count = (period?: string) =>
      store.getInstanceMarkers('', period, BRT).reduce((acc: number, m: { count: number }) => acc + m.count, 0);
    expect(count('today')).toBe(1);
    expect(count('7d')).toBe(1);
    expect(count('30d')).toBe(2);
    expect(count('all')).toBe(2);
    expect(count(undefined)).toBe(2);
  });

  it('amostra recente conta mesmo com last_seen antigo (fila offline reenviada)', () => {
    heartbeat('inst-fila');
    db.prepare("UPDATE instances SET lat = 48.8, lng = 2.3, city = 'Paris', country = 'FR', last_seen = datetime('now', '-3 days') WHERE instance_id = 'inst-fila'").run();
    db.prepare(
      "UPDATE instance_samples SET sampled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-2 days') WHERE instance_id = 'inst-fila'"
    ).run();
    const paris = (period: string) =>
      store.getInstanceMarkers('', period, BRT).find((m: { city: string }) => m.city === 'Paris')?.count ?? 0;
    expect(paris('today')).toBe(0);
    expect(paris('7d')).toBe(1);
  });
});

describe('papéis, horário e geografia respeitam o recorte', () => {
  it('papéis: conexão antiga fica fora de 30 dias e dentro de "tudo"', () => {
    const sid = store.logSessionCreated('PAPL', '1111');
    store.logConnection(sid, 'left', 'left', '10.3.0.1');
    store.logConnection(sid, 'left', 'left', '10.3.0.1'); // reconexão: mesmo aparelho
    const old = store.logConnection(sid, 'center', 'center', '10.3.0.2');
    db.prepare("UPDATE connections SET connected_at = datetime('now', '-40 days') WHERE id = ?").run(old);

    const roles = (period?: string) =>
      Object.fromEntries(store.getRoleBreakdown(period, BRT).map((r: { role: string; count: number }) => [r.role, r.count]));
    expect(roles('30d')).toEqual({ left: 1 });
    expect(roles('all')).toEqual({ left: 1, center: 1 });
  });

  it('horário de pico na hora local', () => {
    const sid = store.logSessionCreated('HORA', '2222');
    const id = store.logConnection(sid, 'display', null, '10.4.0.1');
    db.prepare("UPDATE connections SET connected_at = '2026-01-10 13:15:00' WHERE id = ?").run(id);
    const hourly = store.getHourlyDistribution('all', BRT);
    expect(hourly[10].count).toBeGreaterThanOrEqual(1); // 13h UTC = 10h em Brasília
    expect(store.getHourlyDistribution('all', 0)[13].count).toBeGreaterThanOrEqual(1);
  });

  it('série diária agrupa pelo dia local', () => {
    store.logAccess('page_view', '/faq', '10.5.0.1');
    db.prepare("UPDATE access_logs SET timestamp = '2026-01-11 01:30:00' WHERE ip = (SELECT ip FROM access_logs ORDER BY id DESC LIMIT 1)").run();
    const days = store.getTimeline('all', BRT).map((r: { date: string }) => r.date);
    expect(days).toContain('2026-01-10');
    expect(days).not.toContain('2026-01-11');
  });

  it('países contam IPs distintos, não linhas', () => {
    for (let i = 0; i < 5; i += 1) store.logAccess('page_view', '/', '10.6.0.1');
    store.logAccess('page_view', '/', '10.6.0.2');
    db.prepare("UPDATE access_logs SET country = 'IT', city = 'Roma' WHERE country = '' OR country IS NULL").run();
    const it = store.getGeoDistribution('all', BRT).countries.find((c: { country: string }) => c.country === 'IT');
    // 10.5.0.1 (teste anterior) + 10.6.0.1 + 10.6.0.2
    expect(it?.count).toBe(3);
  });
});

describe('listas de sessões', () => {
  it('sessões online trazem aparelhos distintos e respeitam o recorte', () => {
    const sid = store.logSessionCreated('LIST', '3333');
    for (let i = 0; i < 20; i += 1) store.logConnection(sid, 'right', 'right', '10.9.0.1');
    store.logConnection(sid, 'display', null, '10.9.0.2');
    const row = store.getRecentSessions(50, 0, 'today', BRT).find((r: { room_id: string }) => r.room_id === 'LIST');
    expect(row?.connection_count).toBe(21);
    expect(row?.device_count).toBe(2);

    const antiga = store.logSessionCreated('VELHA', '4444');
    db.prepare("UPDATE sessions SET created_at = datetime('now', '-20 days') WHERE id = ?").run(antiga);
    const ids = (period?: string) => store.getRecentSessions(50, 0, period, BRT).map((r: { room_id: string }) => r.room_id);
    expect(ids('7d')).not.toContain('VELHA');
    expect(ids('30d')).toContain('VELHA');
    expect(ids(undefined)).toContain('VELHA');
  });

  it('sessões de bundle trazem aparelhos distintos', () => {
    const ev = (event: string, data: Record<string, unknown>) => ({ instanceId: 'inst-lista', event, roomId: 'B1', data: { roomId: 'B1', ...data } });
    store.recordInstanceEvents([
      ev('session_created', {}),
      ev('connection', { role: 'left', ipHash: 'x1' }),
      ev('connection', { role: 'left', ipHash: 'x1' }),
      ev('connection', { role: 'center', ipHash: 'x2' })
    ]);
    const row = store.getBundleSessions(10, '', 'today', BRT).find((r: { room_id: string | null }) => r.room_id === 'B1');
    expect(row?.connections).toBe(3);
    expect(row?.devices).toBe(2);
  });
});

describe('sessões pelo período em que estiveram ativas', () => {
  it('sala criada antes do recorte mas usada nele aparece; sala parada some', () => {
    const usada = store.logSessionCreated('USADA', '5555');
    const parada = store.logSessionCreated('PARADA', '6666');
    db.prepare("UPDATE sessions SET created_at = datetime('now', '-3 days') WHERE id IN (?, ?)").run(usada, parada);
    store.logConnection(usada, 'left', 'left', '10.10.0.1'); // conexão de agora
    const velha = store.logConnection(parada, 'left', 'left', '10.10.0.2');
    db.prepare(
      "UPDATE connections SET connected_at = datetime('now', '-3 days'), disconnected_at = datetime('now', '-3 days', '+2 hours') WHERE id = ?"
    ).run(velha);
    db.prepare("UPDATE sessions SET closed_at = datetime('now', '-2 days') WHERE id = ?").run(parada);

    const ids = (period: string) => store.getRecentSessions(100, 0, period, BRT).map((r: { room_id: string }) => r.room_id);
    expect(ids('today')).toContain('USADA');
    expect(ids('today')).not.toContain('PARADA');
    expect(ids('7d')).toContain('PARADA');
  });

  it('conexão sem desconexão registrada não mantém sala morta; sala viva agora aparece', () => {
    const esquecida = store.logSessionCreated('ESQUEC', '7777');
    const viva = store.logSessionCreated('VIVA', '8888');
    db.prepare("UPDATE sessions SET created_at = datetime('now', '-5 days') WHERE id IN (?, ?)").run(esquecida, viva);
    for (const sid of [esquecida, viva]) {
      const c = store.logConnection(sid, 'display', null, '10.11.0.1');
      db.prepare("UPDATE connections SET connected_at = datetime('now', '-5 days') WHERE id = ?").run(c);
    }
    const ids = store.getRecentSessions(100, 0, 'today', BRT, ['VIVA']).map((r: { room_id: string }) => r.room_id);
    expect(ids).not.toContain('ESQUEC');
    expect(ids).toContain('VIVA');
  });

  it('sessão de bundle aparece no dia em que teve evento, não depois', () => {
    store.recordInstanceEvents([
      { instanceId: 'inst-ontem', event: 'session_created', roomId: 'Z9', data: { roomId: 'Z9' } },
      { instanceId: 'inst-ontem', event: 'connection', roomId: 'Z9', data: { roomId: 'Z9', role: 'left', ipHash: 'q' } }
    ]);
    db.prepare("UPDATE instance_events SET received_at = datetime('now', '-2 days') WHERE instance_id = 'inst-ontem'").run();
    const rooms = (period: string) =>
      store.getBundleSessions(50, '', period, BRT).map((r: { room_id: string | null }) => r.room_id);
    expect(rooms('today')).not.toContain('Z9');
    expect(rooms('7d')).toContain('Z9');
  });
});
