// Relatórios do site via Assist Stats: fetch mockado (nada sai da máquina).
// Cobre auth master, repasse idêntico, host/site fixos do env, timeout, JSON
// inválido, cache, env ausente e o que nunca pode vazar na resposta.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { config } from '../src/config.js';
import {
  buildStatsUrl,
  getSiteStatsReport,
  parseSitePeriod,
  readStatsEnv,
  resetSiteStatsState,
  STATS_TIMEOUT_MS
} from '../src/site-stats.js';

const STATS_HOST = 'https://stats.example.test';
const SECRET_TOKEN = 'svc-token-do-teste';

config.TELEMETRY_ENABLED = false;
config.GEO_ENABLED = false;
config.LOG_LEVEL = 'silent';
config.MASTER_USER = 'test-user';
config.MASTER_PASSWORD = 'test-password';
config.MASTER_TOKEN_SECRET = 'test-secret';

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-site-stats-'));
config.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
let app: App;

const overviewFixture = {
  current: { pageviews: 10, visitors: 4, anonSessions: 1, sessions: 5, avgDurationS: 12.5, bounceRate: 0.4321, liveNow: 0 },
  previous: null,
  excluded: { events: 2, sessions: 1 }
};

function enableStats(): void {
  config.STATS_API_URL = STATS_HOST;
  config.STATS_SERVICE_TOKEN = SECRET_TOKEN;
  config.STATS_SITE_ID = 'refereelights';
}

function disableStats(): void {
  config.STATS_API_URL = '';
  config.STATS_SERVICE_TOKEN = '';
  config.STATS_SITE_ID = 'refereelights';
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

type FetchMock = ReturnType<typeof vi.fn<(input: URL | string, init?: RequestInit) => Promise<Response>>>;

function stubFetch(impl: (input: URL | string, init?: RequestInit) => Promise<Response>): FetchMock {
  const mock = vi.fn(impl);
  vi.stubGlobal('fetch', mock);
  return mock;
}

async function masterToken(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/master/auth',
    headers: { 'x-forwarded-for': '10.80.0.1' },
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

beforeEach(() => {
  resetSiteStatsState();
  enableStats();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  disableStats();
});

describe('período', () => {
  it('ausente vira 30d; valores aceitos passam; o resto é recusado', () => {
    expect(parseSitePeriod(undefined)).toBe('30d');
    expect(parseSitePeriod('')).toBe('30d');
    expect(parseSitePeriod('today')).toBe('today');
    expect(parseSitePeriod('7d')).toBe('7d');
    expect(parseSitePeriod('all')).toBe('all');
    expect(parseSitePeriod('365d')).toBeNull();
    expect(parseSitePeriod(['7d', '30d'])).toBeNull();
  });
});

describe('env e URL do stats', () => {
  it('sem URL ou token a integração fica desligada', () => {
    disableStats();
    expect(readStatsEnv()).toBeNull();
    config.STATS_API_URL = STATS_HOST;
    expect(readStatsEnv()).toBeNull();
  });

  it('só https é aceito; site inválido desliga', () => {
    config.STATS_API_URL = 'http://stats.example.test';
    expect(readStatsEnv()).toBeNull();
    config.STATS_API_URL = STATS_HOST;
    config.STATS_SITE_ID = 'site/../../x';
    expect(readStatsEnv()).toBeNull();
  });

  it('URL monta só com host do env, scope do env e período; timeline sem period', () => {
    const env = readStatsEnv();
    expect(env).not.toBeNull();
    if (!env) return;
    const url = buildStatsUrl(env, 'overview', 'all');
    expect(url.origin).toBe(STATS_HOST);
    expect(url.pathname).toBe('/api/stats/overview');
    expect(url.searchParams.getAll('scope')).toEqual(['site:refereelights']);
    expect(url.searchParams.get('period')).toBe('all');
    expect(buildStatsUrl(env, 'timeline', '7d').searchParams.has('period')).toBe(false);
  });
});

describe('getSiteStatsReport', () => {
  it('env ausente → off, sem chamar o stats', async () => {
    disableStats();
    const fetchMock = stubFetch(async () => jsonResponse(overviewFixture));
    await expect(getSiteStatsReport('overview', '30d')).resolves.toEqual({
      source: 'stats',
      unavailable: true,
      reason: 'off'
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('repasse idêntico do JSON, com Bearer e só GET', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(overviewFixture));
    const result = await getSiteStatsReport('overview', '7d');
    expect(result).toMatchObject({ source: 'stats', data: overviewFixture });
    expect(typeof (result as { fetchedAt?: unknown }).fetchedAt).toBe('string');
    const init = fetchMock.mock.calls[0][1];
    expect(init?.method).toBe('GET');
    expect(init?.redirect).toBe('error');
    expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${SECRET_TOKEN}`);
  });

  it('JSON inválido ou fora da forma esperada → error', async () => {
    stubFetch(async () => new Response('{não é json', { status: 200 }));
    await expect(getSiteStatsReport('overview', '30d')).resolves.toMatchObject({ unavailable: true, reason: 'error' });
    stubFetch(async () => jsonResponse({ current: 'nope' }));
    await expect(getSiteStatsReport('overview', '30d')).resolves.toMatchObject({ unavailable: true, reason: 'error' });
  });

  it('timeout de 4 s → timeout', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    stubFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('abortado', 'AbortError')));
        })
    );
    const pending = getSiteStatsReport('geo', '30d');
    await vi.advanceTimersByTimeAsync(STATS_TIMEOUT_MS);
    await expect(pending).resolves.toEqual({ source: 'stats', unavailable: true, reason: 'timeout' });
  });

  it('status não 2xx ou erro de rede → error, sem corpo nem mensagem vazando', async () => {
    stubFetch(async () => new Response('corpo interno do stats', { status: 500 }));
    const byStatus = await getSiteStatsReport('pages', '30d');
    expect(byStatus).toEqual({ source: 'stats', unavailable: true, reason: 'error' });
    expect(JSON.stringify(byStatus)).not.toContain('corpo interno');

    stubFetch(async () => {
      throw new Error(`falhou em ${STATS_HOST}/api?token=${SECRET_TOKEN}`);
    });
    const byNetwork = await getSiteStatsReport('sources', '30d');
    expect(byNetwork).toEqual({ source: 'stats', unavailable: true, reason: 'error' });
    expect(JSON.stringify(byNetwork)).not.toContain(SECRET_TOKEN);
  });

  it('cache de 60 s por (rota, período): hit não chama o stats; depois de 60 s chama de novo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const fetchMock = stubFetch(async () => jsonResponse(overviewFixture));

    const first = await getSiteStatsReport('overview', '30d');
    const second = await getSiteStatsReport('overview', '30d');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    await getSiteStatsReport('overview', '7d');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date('2026-11-27T12:01:01Z'));
    await getSiteStatsReport('overview', '30d');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('falha não entra no cache', async () => {
    const fetchMock = stubFetch(async () => new Response('x', { status: 503 }));
    await getSiteStatsReport('audience', '30d');
    await getSiteStatsReport('audience', '30d');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('log no máximo uma linha por minuto por motivo, sem token', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-27T12:00:00Z'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    stubFetch(async () => new Response('x', { status: 500 }));

    await getSiteStatsReport('overview', '30d');
    await getSiteStatsReport('geo', '30d');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).not.toContain(SECRET_TOKEN);

    vi.setSystemTime(new Date('2026-11-27T12:01:05Z'));
    await getSiteStatsReport('pages', '30d');
    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('rotas /master/site/*', () => {
  it('sem token de master → 401, mesmo com stats configurado', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(overviewFixture));
    const none = await app.inject({ method: 'GET', url: '/master/site/overview' });
    expect(none.statusCode).toBe(401);
    const bad = await app.inject({
      method: 'GET',
      url: '/master/site/overview',
      headers: { authorization: 'Bearer nao-e-um-token' }
    });
    expect(bad.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com master: repassa o JSON embrulhado em { source, fetchedAt, data }', async () => {
    stubFetch(async () => jsonResponse(overviewFixture));
    const token = await masterToken();
    const res = await app.inject({
      method: 'GET',
      url: '/master/site/overview?period=7d',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.source).toBe('stats');
    expect(typeof body.fetchedAt).toBe('string');
    expect(body.data).toEqual(overviewFixture);
    expect(body.unavailable).toBeUndefined();
  });

  it('site do cliente é ignorado: o scope vem sempre do env e o host também', async () => {
    const fetchMock = stubFetch(async () => jsonResponse(overviewFixture));
    const token = await masterToken();
    await app.inject({
      method: 'GET',
      url: '/master/site/overview?scope=site:outro&site=outro&period=all',
      headers: { authorization: `Bearer ${token}` }
    });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.origin).toBe(STATS_HOST);
    expect(url.searchParams.getAll('scope')).toEqual(['site:refereelights']);
    expect(url.searchParams.get('period')).toBe('all');
    expect(url.searchParams.has('site')).toBe(false);
  });

  it('period inválido → 400; env ausente → 200 unavailable off', async () => {
    const token = await masterToken();
    const bad = await app.inject({
      method: 'GET',
      url: '/master/site/overview?period=1y',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(bad.statusCode).toBe(400);

    disableStats();
    const fetchMock = stubFetch(async () => jsonResponse(overviewFixture));
    const off = await app.inject({
      method: 'GET',
      url: '/master/site/timeline',
      headers: { authorization: `Bearer ${token}` }
    });
    expect(off.statusCode).toBe(200);
    expect(off.json()).toEqual({ source: 'stats', unavailable: true, reason: 'off' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
