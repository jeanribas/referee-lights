/**
 * Relatórios do site refereelights.app, buscados no Assist Stats (servidor a servidor)
 * e repassados sem recálculo para o painel interno (`/master/site/*`).
 *
 * O host vem da env STATS_API_URL e o site é sempre o de STATS_SITE_ID: o cliente
 * não escolhe host nem site. Sem as envs a integração fica desligada (`off`).
 * Falha, timeout ou JSON inesperado viram `unavailable` — nunca corpo nem mensagem
 * do stats, nunca URL com token.
 */

import { config } from './config.js';

export const SITE_STATS_ROUTES = ['overview', 'timeline', 'geo', 'pages', 'sources', 'audience'] as const;
export type SiteStatsRoute = (typeof SITE_STATS_ROUTES)[number];

export const SITE_STATS_PERIODS = ['today', '7d', '30d', 'all'] as const;
export type SiteStatsPeriod = (typeof SITE_STATS_PERIODS)[number];

export type UnavailableReason = 'off' | 'timeout' | 'error';

export type SiteStatsResult =
  | { source: 'stats'; fetchedAt: string; data: unknown }
  | { source: 'stats'; unavailable: true; reason: UnavailableReason };

export const STATS_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 60_000;
// Falha (timeout/error) fica de fora por pouco tempo: evita martelar o stats fora do ar.
const NEGATIVE_TTL_MS = 10_000;
const CACHE_MAX_ENTRIES = 64;
const LOG_INTERVAL_MS = 60_000;
const MAX_BODY_CHARS = 1_000_000;
const SITE_ID_RE = /^[a-z0-9-]{1,32}$/;

/** Período pedido pelo painel. Ausente = 30d; valor fora da lista = null (400 na rota). */
export function parseSitePeriod(raw: unknown): SiteStatsPeriod | null {
  if (raw === undefined || raw === '') return '30d';
  if (typeof raw !== 'string') return null;
  return SITE_STATS_PERIODS.find((p) => p === raw) ?? null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const arrOfObj = (v: unknown): boolean => Array.isArray(v) && v.every(isObj);

const KPI_KEYS = ['pageviews', 'visitors', 'anonSessions', 'sessions', 'avgDurationS', 'bounceRate', 'liveNow'] as const;
const isKpis = (v: unknown): boolean => isObj(v) && KPI_KEYS.every((k) => isNum(v[k]));

/**
 * Checagem dos campos principais de cada rota. Não recalcula nada: só confere
 * que a forma é a esperada antes de repassar o JSON original.
 */
const VALIDATORS: Record<SiteStatsRoute, (d: unknown) => boolean> = {
  overview: (d) =>
    isObj(d) &&
    isKpis(d.current) &&
    (d.previous === null || isKpis(d.previous)) &&
    isObj(d.excluded) &&
    isNum(d.excluded.events) &&
    isNum(d.excluded.sessions),
  timeline: (d) =>
    isObj(d) &&
    Array.isArray(d.timeline) &&
    d.timeline.every((r) => isObj(r) && isStr(r.date) && isNum(r.pageviews) && isNum(r.visitors) && isNum(r.sessions)),
  geo: (d) => isObj(d) && arrOfObj(d.countries) && arrOfObj(d.cities) && arrOfObj(d.markers),
  pages: (d) => isObj(d) && arrOfObj(d.top) && arrOfObj(d.entry) && arrOfObj(d.exit),
  sources: (d) =>
    isObj(d) &&
    arrOfObj(d.channels) &&
    arrOfObj(d.referrers) &&
    isObj(d.utm) &&
    arrOfObj(d.utm.source) &&
    arrOfObj(d.utm.medium) &&
    arrOfObj(d.utm.campaign),
  audience: (d) =>
    isObj(d) && arrOfObj(d.devices) && arrOfObj(d.browsers) && arrOfObj(d.os) && arrOfObj(d.langs) && arrOfObj(d.screens)
};

type StatsEnv = { origin: string; token: string; siteId: string };

/** Lê as envs a cada chamada. Qualquer valor ausente ou inválido = integração desligada. */
export function readStatsEnv(): StatsEnv | null {
  const rawUrl = config.STATS_API_URL.trim();
  const token = config.STATS_SERVICE_TOKEN.trim();
  const siteId = config.STATS_SITE_ID.trim() || 'refereelights';
  if (rawUrl === '' || token === '' || !SITE_ID_RE.test(siteId)) return null;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return { origin: parsed.origin, token, siteId };
}

/** URL do stats: host do env, caminho fixo por rota, `scope` sempre o do env. */
export function buildStatsUrl(env: StatsEnv, route: SiteStatsRoute, period: SiteStatsPeriod): URL {
  const url = new URL(`/api/stats/${route}`, env.origin);
  url.searchParams.set('scope', `site:${env.siteId}`);
  // timeline não tem período no stats: a série é o histórico inteiro.
  if (route !== 'timeline') url.searchParams.set('period', period);
  return url;
}

type CacheEntry = { at: number; fetchedAt: string; data: unknown };
type NegativeEntry = { at: number; reason: FailureReason };
type FailureReason = Exclude<UnavailableReason, 'off'>;

const cache = new Map<string, CacheEntry>();
const negativeCache = new Map<string, NegativeEntry>();
// Busca em andamento por chave: chamadas simultâneas com cache frio esperam a mesma.
const inflight = new Map<string, Promise<SiteStatsResult>>();
const lastLogAt = new Map<UnavailableReason, number>();

export function resetSiteStatsState(): void {
  cache.clear();
  negativeCache.clear();
  inflight.clear();
  lastLogAt.clear();
}

/** Chave por (rota, período). A timeline ignora o período no stats: uma chave só. */
function cacheKey(route: SiteStatsRoute, period: SiteStatsPeriod): string {
  return route === 'timeline' ? 'timeline' : `${route}|${period}`;
}

function freshEntry<V extends { at: number }>(map: Map<string, V>, key: string, ttl: number, now: number): V | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (now - entry.at >= ttl) {
    map.delete(key);
    return null;
  }
  return entry;
}

function boundedSet<V>(map: Map<string, V>, key: string, value: V): void {
  if (!map.has(key) && map.size >= CACHE_MAX_ENTRIES) {
    // Map guarda a ordem de inserção: a primeira chave é a mais antiga.
    const oldest = map.keys().next();
    if (!oldest.done) map.delete(oldest.value);
  }
  map.set(key, value);
}

/** Uma linha por minuto por motivo. Só route e motivo: nada do stats, nada de token. */
function logUnavailable(reason: UnavailableReason, route: SiteStatsRoute, now: number): void {
  const last = lastLogAt.get(reason);
  if (last !== undefined && now - last < LOG_INTERVAL_MS) return;
  lastLogAt.set(reason, now);
  console.warn(`[site-stats] indisponível: motivo=${reason} rota=${route}`);
}

function unavailable(reason: UnavailableReason, route: SiteStatsRoute, now: number): SiteStatsResult {
  if (reason !== 'off') logUnavailable(reason, route, now);
  return { source: 'stats', unavailable: true, reason };
}

/**
 * Busca um relatório no stats. Sucesso fica 60 s em cache por (rota, período);
 * timeout e erro ficam 10 s em cache negativo; `off` nunca é cacheado. Buscas
 * simultâneas da mesma chave compartilham uma única chamada. `tz` não entra: o stats fixa BRT.
 */
export async function getSiteStatsReport(route: SiteStatsRoute, period: SiteStatsPeriod): Promise<SiteStatsResult> {
  const env = readStatsEnv();
  if (!env) return { source: 'stats', unavailable: true, reason: 'off' };

  const key = cacheKey(route, period);
  const now = Date.now();
  const hit = freshEntry(cache, key, CACHE_TTL_MS, now);
  if (hit) return { source: 'stats', fetchedAt: hit.fetchedAt, data: hit.data };
  const failed = freshEntry(negativeCache, key, NEGATIVE_TTL_MS, now);
  if (failed) return { source: 'stats', unavailable: true, reason: failed.reason };
  const running = inflight.get(key);
  if (running) return running;

  // Sem await antes deste ponto: a segunda chamada simultânea já encontra a busca registrada.
  const job = fetchReport(env, route, period, key).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, job);
  return job;
}

async function fetchReport(
  env: StatsEnv,
  route: SiteStatsRoute,
  period: SiteStatsPeriod,
  key: string
): Promise<SiteStatsResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STATS_TIMEOUT_MS);

  const fail = (reason: FailureReason): SiteStatsResult => {
    const at = Date.now();
    boundedSet(negativeCache, key, { at, reason });
    return unavailable(reason, route, at);
  };

  try {
    const res = await fetch(buildStatsUrl(env, route, period), {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal
    });
    if (!res.ok) {
      // Corpo de erro não é lido nem repassado: só solta a conexão.
      await res.body?.cancel().catch(() => undefined);
      return fail('error');
    }
    const text = await res.text();
    if (text.length > MAX_BODY_CHARS) return fail('error');
    const data: unknown = JSON.parse(text);
    if (!VALIDATORS[route](data)) return fail('error');
    const at = Date.now();
    const fetchedAt = new Date(at).toISOString();
    boundedSet(cache, key, { at, fetchedAt, data });
    return { source: 'stats', fetchedAt, data };
  } catch {
    // Mensagem do erro não entra em lugar nenhum: pode trazer a URL com dados internos.
    return fail(timedOut ? 'timeout' : 'error');
  } finally {
    clearTimeout(timer);
  }
}
