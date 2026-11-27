// Campos novos do painel (distintos no período, datacenter à parte, páginas e
// geo por fonte) e campos antigos com o mesmo valor de antes. Geo é simulado:
// 10.x = visitante normal (BR), 52.x = datacenter (US, ASN de nuvem).
import { afterAll, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

vi.mock('../src/geo.js', () => ({
  initGeo: async () => undefined,
  lookupGeo: (ip: string) =>
    ip.startsWith('52.')
      ? { country: 'US', region: 'VA', city: 'Ashburn', lat: 39.0438, lng: -77.4874 }
      : { country: 'BR', region: 'SP', city: 'Sao Paulo', lat: -23.5505, lng: -46.6333 },
  lookupNetwork: (ip: string) =>
    ip.startsWith('52.')
      ? { asn: 16509, org: 'AMAZON-02', datacenter: true }
      : { asn: 8167, org: 'Claro', datacenter: false }
}));

const { AnalyticsStore } = await import('../src/analytics.js');

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-novos-'));
let seq = 0;

function freshStore(): { store: InstanceType<typeof AnalyticsStore>; dbPath: string } {
  seq += 1;
  const dbPath = path.join(dataDir, `novos-${seq}.db`);
  return { store: new AnalyticsStore(dbPath), dbPath };
}

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('distintos no período são diferentes da soma diária', () => {
  it('um visitante que volta em outro dia conta uma vez no período', () => {
    const { store, dbPath } = freshStore();
    // Escrita direta com timestamps passados (o analytics grava "agora").
    const raw = new Database(dbPath);
    const insert = raw.prepare(
      `INSERT INTO access_logs (event_type, room_id, ip, country, region, city, user_agent, lat, lng, is_dc, asn, timestamp)
       VALUES ('page_view', '/', ?, 'BR', 'SP', 'Sao Paulo', '', -23.5, -46.6, 0, 0, datetime('now', ?))`
    );
    insert.run('h-a', '-2 days');
    insert.run('h-a', '-1 days');
    insert.run('h-a', '-0 days');
    insert.run('h-b', '-0 days');
    raw.close();

    const stats = store.getStats(0, '7d');
    expect(stats.siteVisitorsDistinct).toBe(2);

    const days = store.getTimeline('7d');
    const sumDaily = days.reduce((acc, day) => acc + day.siteVisitors, 0);
    expect(sumDaily).toBe(4);
    expect(stats.siteVisitorsDistinct).not.toBe(sumDaily);
  });
});

describe('datacenter excluído do site e contado à parte', () => {
  // Visitantes normais: 10.0.0.1 (2 visitas) e 10.0.0.2 (1 visita).
  // Datacenter: 52.1.1.1, três visitas. Salas: 10.0.0.9 entra duas vezes como
  // árbitro esquerdo e uma como admin.
  const { store } = freshStore();
  store.logAccess('page_view', '/timer/ABCD', '10.0.0.1');
  store.logAccess('page_view', '/timer/ABCD', '10.0.0.1');
  store.logAccess('page_view', '/', '10.0.0.2');
  for (let i = 0; i < 3; i += 1) store.logAccess('page_view', '/', '52.1.1.1');
  const sessionId = store.logSessionCreated('ABCD', '1234');
  store.logConnection(sessionId, 'left', 'left', '10.0.0.9');
  store.logConnection(sessionId, 'left', 'left', '10.0.0.9');
  store.logConnection(sessionId, 'admin', null, '10.0.0.9');

  it('site distinto e visitas de bot separados', () => {
    const stats = store.getStats(0, 'today');
    expect(stats.siteVisitorsDistinct).toBe(2);
    expect(stats.siteBotViews).toBe(3);
  });

  it('série diária: campos antigos intactos e campos novos separados', () => {
    const today = store.getTimeline('today').at(-1)!;
    // Antigos: visitors inclui datacenter (3 IPs), views inclui bot (6 page_view).
    expect(today.visitors).toBe(3);
    expect(today.views).toBe(6);
    // Novos: visitantes sem datacenter e bots do dia.
    expect(today.siteVisitors).toBe(2);
    expect(today.bots).toBe(3);
  });

  it('pages separa views, botViews e connections; count segue a soma antiga', () => {
    const pages = store.getPages('today');
    const timer = pages.find((p) => p.page === '/timer/ABCD')!;
    expect(timer).toMatchObject({ views: 2, botViews: 0, connections: 0, count: 2 });

    const home = pages.find((p) => p.page === '/')!;
    // page_view '/' : 10.0.0.2 (normal) + 3 do datacenter
    expect(home).toMatchObject({ views: 1, botViews: 3, connections: 0, count: 4 });

    const left = pages.find((p) => p.page === '/ref/left')!;
    expect(left).toMatchObject({ views: 0, botViews: 0, connections: 2, count: 2 });

    const admin = pages.find((p) => p.page === '/admin')!;
    expect(admin).toMatchObject({ connections: 1, count: 1 });
  });

  it('geo: campos antigos (união) intactos e site, salas e bots à parte', () => {
    const geo = store.getGeoDistribution('today');

    // Antigo: salas + todo page_view. BR = 10.0.0.9, 10.0.0.1, 10.0.0.2; US = 52.1.1.1.
    expect(geo.countries).toEqual([
      { country: 'BR', count: 3 },
      { country: 'US', count: 1 }
    ]);

    expect(geo.site.countries).toEqual([{ country: 'BR', count: 2 }]);
    expect(geo.salas.countries).toEqual([{ country: 'BR', count: 1 }]);
    expect(geo.bots.countries).toEqual([{ country: 'US', count: 1 }]);
    expect(geo.bots.cities).toEqual([{ city: 'Ashburn', country: 'US', count: 1 }]);
  });

  it('marcadores: antigos com o mesmo valor e fontes separadas', () => {
    const markers = store.getGeoMarkers('today');
    expect(markers).toHaveLength(2);
    const br = markers.find((m) => m.country === 'BR')!;
    expect(br).toMatchObject({ users: 1, visitors: 2, count: 3 });
    const us = markers.find((m) => m.country === 'US')!;
    expect(us).toMatchObject({ users: 0, visitors: 1, count: 1 });

    expect(store.getGeoMarkersBySource('site', 'today')).toEqual([
      expect.objectContaining({ country: 'BR', count: 2 })
    ]);
    expect(store.getGeoMarkersBySource('salas', 'today')).toEqual([
      expect.objectContaining({ country: 'BR', count: 1 })
    ]);
    expect(store.getGeoMarkersBySource('bots', 'today')).toEqual([
      expect.objectContaining({ country: 'US', count: 1 })
    ]);
  });
});
