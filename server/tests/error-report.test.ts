// Relatório de erros: erros do servidor central e das telas da web (online)
// e das instalações (bundle), agrupados, no recorte pedido.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';

const { AnalyticsStore } = await import('../src/analytics.js');

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-errors-'));
const store = new AnalyticsStore(path.join(dataDir, 'analytics.db'));
const db = (store as unknown as { db: { prepare: (sql: string) => { run: (...a: unknown[]) => unknown } } }).db;

const SELF = 'central-0001';
const err = (instanceId: string, data: Record<string, unknown>) => ({ instanceId, event: 'error', data });

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('relatório de erros', () => {
  beforeAll(() => {
    store.recordInstanceEvents([
      err(SELF, { context: 'ui admin', message: 'x is undefined', origin: 'ui', kind: 'TypeError', screen: 'admin', appVersion: '1.3.3' }),
      err(SELF, { context: 'ui admin', message: 'x is undefined', origin: 'ui', kind: 'TypeError', screen: 'admin', appVersion: '1.3.3', stack: 'at novo' }),
      err(SELF, { context: 'uncaughtException', message: 'boom', origin: 'server', kind: 'Error' }),
      err('pc-a', { context: 'socket ref:vote', message: 'bad', origin: 'server', kind: 'TypeError', appVersion: '1.3.2', stack: 'at vote' }),
      err('pc-b', { context: 'socket ref:vote', message: 'bad', origin: 'server', kind: 'TypeError', appVersion: '1.3.3' }),
      err('pc-b', { context: 'launcher porta', message: 'porta ocupada', origin: 'launcher', kind: 'launcher_error' }),
      // bundle antigo: só context/message
      err('pc-velho', { context: 'unhandledRejection', message: 'timeout' }),
      // payload que não é JSON válido não derruba o relatório
      { instanceId: 'pc-c', event: 'error', data: { blob: 'y'.repeat(3000) } }
    ]);
    store.recordInstanceEvents([err('pc-antigo', { context: 'x', message: 'antigo' })]);
    db.prepare("UPDATE instance_events SET received_at = datetime('now', '-10 days') WHERE instance_id = 'pc-antigo'").run();
  });

  it('separa online × bundle e conta instalações afetadas', () => {
    const r = store.getErrorReport('today', -180, SELF);
    expect(r.total).toBe(8);
    expect(r.online).toBe(3);
    expect(r.bundle).toBe(5);
    expect(r.instancesAffected).toBe(4);
  });

  it('agrupa erros iguais com versões, instalações e a ocorrência mais recente', () => {
    const r = store.getErrorReport('today', -180, SELF);
    const ui = r.groups.find((g) => g.context === 'ui admin');
    expect(ui).toMatchObject({ target: 'online', origin: 'ui', kind: 'TypeError', count: 2, screen: 'admin', stack: 'at novo' });
    const vote = r.groups.find((g) => g.context === 'socket ref:vote');
    // a ocorrência mais recente veio sem stack: mostra o da anterior
    expect(vote).toMatchObject({ target: 'bundle', count: 2, instances: 2, stack: 'at vote' });
    expect(vote?.versions.split(',').sort()).toEqual(['1.3.2', '1.3.3']);
    const velho = r.groups.find((g) => g.context === 'unhandledRejection');
    expect(velho).toMatchObject({ origin: 'server', kind: '—' });
  });

  it('respeita o recorte', () => {
    expect(store.getErrorReport('today', -180, SELF).groups.some((g) => g.message === 'antigo')).toBe(false);
    expect(store.getErrorReport('30d', -180, SELF).groups.some((g) => g.message === 'antigo')).toBe(true);
    const daily = store.getErrorReport('30d', -180, SELF).daily;
    expect(daily.reduce((a, d) => a + d.online + d.bundle, 0)).toBe(9);
  });
});
