// Visitantes e aparelhos distintos por dia: recarregar a página, trocar o
// idioma ou cair e voltar na sala não pode inflar os números do painel.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.GEO_ENABLED = 'false';

const { AnalyticsStore } = await import('../src/analytics.js');

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-distinct-'));
const store = new AnalyticsStore(path.join(dataDir, 'analytics.db'));

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('contagem distinta na série diária', () => {
  it('visitantes = IPs distintos; páginas vistas seguem o total bruto', () => {
    for (let i = 0; i < 5; i += 1) store.logAccess('page_view', '/timer/ABCD', '10.0.0.1');
    store.logAccess('page_view', '/', '10.0.0.2');

    const today = store.getTimeline('today').at(-1)!;
    expect(today.views).toBe(6);
    expect(today.visitors).toBe(2);
  });

  it('reconexão do mesmo aparelho no mesmo papel não conta como aparelho novo', () => {
    const sessionId = store.logSessionCreated('ABCD', '1234');
    for (let i = 0; i < 4; i += 1) store.logConnection(sessionId, 'left', 'left', '10.0.0.3');
    store.logConnection(sessionId, 'center', 'center', '10.0.0.4');
    store.logConnection(sessionId, 'display', null, '10.0.0.5');

    const today = store.getTimeline('today').at(-1)!;
    expect(today.connections).toBe(6);
    expect(today.devices).toBe(3);
    expect(today.sessions).toBe(1);
  });

  it('bundles usam a mesma régua e toleram payload inválido', () => {
    const conn = (roomId: string, role: string, ipHash: string) => ({
      instanceId: 'itest-bundle',
      event: 'connection',
      roomId,
      data: { roomId, role, ipHash }
    });
    store.recordInstanceEvents([
      conn('ROOM1', 'left', 'h1'),
      conn('ROOM1', 'left', 'h1'),
      conn('ROOM1', 'left', 'h1'),
      conn('ROOM1', 'right', 'h2'),
      conn('ROOM2', 'left', 'h1'),
      // payload grande é truncado na ingestão e deixa de ser JSON válido
      { instanceId: 'itest-bundle', event: 'connection', roomId: 'ROOM3', data: { blob: 'x'.repeat(3000) } }
    ]);

    const today = store.getBundleTimeline('today').at(-1)!;
    expect(today.connections).toBe(6);
    expect(today.devices).toBe(4);
  });
});
