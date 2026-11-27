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
const cache = new Map<string, CacheEntry>();
const lastLogAt = new Map<UnavailableReason, number>();

export function resetSiteStatsState(): void {
  cache.clear();
  lastLogAt.clear();
}

function cacheGet(key: string, now: number): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (now - entry.at >= CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  if (!cache.has(key) && cache.size >= CACHE_MAX_ENTRIES) {
    // Map guarda a ordem de inserção: a primeira chave é a mais antiga.
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, entry);
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
 * Busca um relatório no stats. Resultado de sucesso fica 60 s em cache por
 * (rota, período); falhas nunca são cacheadas. `tz` não entra: o stats fixa BRT.
 */
export async function getSiteStatsReport(route: SiteStatsRoute, period: SiteStatsPeriod): Promise<SiteStatsResult> {
  const now = Date.now();
  const env = readStatsEnv();
  if (!env) return { source: 'stats', unavailable: true, reason: 'off' };

  const key = `${route}|${period}`;
  const hit = cacheGet(key, now);
  if (hit) return { source: 'stats', fetchedAt: hit.fetchedAt, data: hit.data };

  const url = buildStatsUrl(env, route, period);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, STATS_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${env.token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal
    });
    if (!res.ok) return unavailable('error', route, Date.now());
    const text = await res.text();
    if (text.length > MAX_BODY_CHARS) return unavailable('error', route, Date.now());
    const data: unknown = JSON.parse(text);
    if (!VALIDATORS[route](data)) return unavailable('error', route, Date.now());
    const fetchedAt = new Date(Date.now()).toISOString();
    cacheSet(key, { at: Date.now(), fetchedAt, data });
    return { source: 'stats', fetchedAt, data };
  } catch {
    // Mensagem do erro não entra em lugar nenhum: pode trazer a URL com dados internos.
    return unavailable(timedOut ? 'timeout' : 'error', route, Date.now());
  } finally {
    clearTimeout(timer);
  }
}
