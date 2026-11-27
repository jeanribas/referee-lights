// Robô por User-Agent fora dos campos novos de visitantes e páginas do site, e
// somado aos contadores de bot. Campos antigos seguem com o mesmo valor de antes.
import { afterAll, describe, expect, it, vi } from 'vitest';
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

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-track-bot-'));
afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const UA_IN_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0.1 (iPhone15,2; iOS 17_4)';

// Humanos: 10.0.0.1 (navegador, 2 visitas), 10.0.0.2 (in-app).
// Robôs por UA: 10.0.0.3 (curl), 10.0.0.4 (UA vazio).
// Datacenter sem UA informado: 52.1.1.1 (is_dc = 1, is_bot = 0).
function seeded() {
  const store = new AnalyticsStore(path.join(dataDir, 'bot-metrics.db'));
  store.logAccess('page_view', '/timer/ABCD', '10.0.0.1', { userAgent: UA_BROWSER });
  store.logAccess('page_view', '/timer/ABCD', '10.0.0.1', { userAgent: UA_BROWSER });
  store.logAccess('page_view', '/', '10.0.0.2', { userAgent: UA_IN_APP });
  store.logAccess('page_view', '/', '10.0.0.3', { userAgent: 'curl/8.4.0' });
  store.logAccess('page_view', '/', '10.0.0.4', { userAgent: '' });
  store.logAccess('page_view', '/', '52.1.1.1');
  return store;
}

describe('robô por UA fora dos campos novos do site', () => {
  const store = seeded();

  it('siteVisitorsDistinct só conta humanos; siteBotViews soma datacenter e robôs de UA', () => {
    const stats = store.getStats(0, 'today');
    expect(stats.siteVisitorsDistinct).toBe(2);
    expect(stats.siteBotViews).toBe(3);
  });

  it('série diária: siteVisitors e bots seguem a regra nova; visitors e views seguem iguais', () => {
    const today = store.getTimeline('today').at(-1)!;
    expect(today.siteVisitors).toBe(2);
    expect(today.bots).toBe(3);
    // Antigos: IP distinto de todo page_view (5 IPs) e total bruto (6 visitas).
    expect(today.visitors).toBe(5);
    expect(today.views).toBe(6);
  });

  it('pages: views sem robô, botViews com robô; count segue a soma antiga', () => {
    const pages = store.getPages('today');
    const home = pages.find((p) => p.page === '/')!;
    expect(home).toMatchObject({ views: 1, botViews: 3, count: 4 });
    const timer = pages.find((p) => p.page === '/timer/ABCD')!;
    expect(timer).toMatchObject({ views: 2, botViews: 0, count: 2 });
  });

  it('geo: união antiga intacta; site sem robô; bots com robô', () => {
    const geo = store.getGeoDistribution('today');
    expect(geo.countries).toEqual([
      { country: 'BR', count: 4 },
      { country: 'US', count: 1 }
    ]);
    expect(geo.site.countries).toEqual([{ country: 'BR', count: 2 }]);
    expect(geo.bots.countries).toEqual([
      { country: 'BR', count: 2 },
      { country: 'US', count: 1 }
    ]);
  });

  it('marcadores: site sem robô; bots com robô', () => {
    expect(store.getGeoMarkersBySource('site', 'today')).toEqual([
      expect.objectContaining({ country: 'BR', count: 2 })
    ]);
    expect(store.getGeoMarkersBySource('bots', 'today')).toEqual([
      expect.objectContaining({ country: 'BR', count: 2 }),
      expect.objectContaining({ country: 'US', count: 1 })
    ]);
  });
});
