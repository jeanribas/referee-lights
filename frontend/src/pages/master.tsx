import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  ComposableMap, Geographies, Geography, Marker, ZoomableGroup
} from 'react-simple-maps';

import { Seo } from '@/components/Seo';
import { getMessages } from '@/lib/i18n/messages';
import {
  masterAuth,
  getMasterStats,
  getMasterGeo,
  getMasterActive,
  getMasterTimeline,
  getMasterDuration,
  getMasterOnline,
  getMasterPages,
  getMasterHosts,
  getMasterInstances,
  getMasterGeoMarkers,
  type MasterStats,
  type MasterGeoResponse,
  type MasterActiveResponse,
  type MasterTimelineResponse,
  type MasterDurationResponse,
  type MasterOnlineResponse,
  type MasterPagesResponse,
  type MasterHostsResponse,
  type MasterInstancesResponse,
  type MasterGeoMarkersResponse
} from '@/lib/api';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

type Period = 'today' | '7d' | '30d' | 'all';

const PERIOD_LABELS: Record<Period, string> = {
  today: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
  all: 'Tudo'
};

const REFRESH_INTERVAL = 30_000;
const ONLINE_REFRESH_INTERVAL = 10_000;

const PAGE_LABELS: Record<string, string> = {
  '/admin': 'Painel Admin',
  '/display': 'Display',
  '/ref/left': 'Árbitro Esquerdo',
  '/ref/center': 'Árbitro Central',
  '/ref/right': 'Árbitro Direito',
  '/': 'Visitante'
};

const tooltipStyle = {
  contentStyle: { background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', fontSize: '12px' },
  labelStyle: { color: '#94a3b8' },
  itemStyle: { color: '#e2e8f0' }
};

/* ─── Shared components ─── */

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
      <div className={`absolute -right-4 -top-4 h-20 w-20 rounded-full opacity-10 blur-2xl ${accent ?? 'bg-indigo-500'}`} />
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-3xl font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function SectionCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-white/[0.06] bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5 ${className}`}>
      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">{title}</h2>
      {children}
    </section>
  );
}

function ProgressList({ items, labelKey, valueKey, labelMap }: {
  items: Array<Record<string, any>>;
  labelKey: string;
  valueKey: string;
  labelMap?: Record<string, string>;
}) {
  if (items.length === 0) return <p className="text-sm text-slate-600">Sem dados.</p>;
  const max = items[0][valueKey] as number;
  return (
    <div className="space-y-2.5">
      {items.slice(0, 10).map((item, i) => {
        const raw = String(item[labelKey]);
        const label = labelMap?.[raw] ?? raw;
        const count = item[valueKey] as number;
        const pct = max > 0 ? (count / max) * 100 : 0;
        return (
          <div key={raw + i}>
            <div className="flex items-center justify-between mb-1">
              <span className="truncate text-xs text-slate-300">{label || '—'}</span>
              <span className="ml-3 text-xs font-bold tabular-nums text-white">{count}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.04]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Interactive map ─── */

function GeoMap({ markers }: {
  markers: MasterGeoMarkersResponse['markers'];
}) {
  const [hoveredMarker, setHoveredMarker] = useState<{ city: string; country: string; count: number } | null>(null);
  const maxCount = markers.length > 0 ? markers[0].count : 1;

  return (
    <div className="relative overflow-hidden rounded-xl bg-slate-950/50 flex-1 min-h-[300px]">
      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 140, center: [0, 30] }}
        style={{ width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      >
        <ZoomableGroup>
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1e293b"
                  stroke="#334155"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: '#334155', outline: 'none' },
                    pressed: { outline: 'none' }
                  }}
                />
              ))
            }
          </Geographies>
          {markers.map((m) => {
            const size = 4 + (m.count / maxCount) * 16;
            return (
              <Marker
                key={`${m.city}-${m.country}`}
                coordinates={[m.lng, m.lat]}
                onMouseEnter={() => setHoveredMarker(m)}
                onMouseLeave={() => setHoveredMarker(null)}
              >
                <circle
                  r={size}
                  fill="#6366f1"
                  fillOpacity={0.5}
                  stroke="#818cf8"
                  strokeWidth={1}
                  style={{ cursor: 'pointer' }}
                />
                <circle
                  r={size * 0.4}
                  fill="#a5b4fc"
                  fillOpacity={0.9}
                />
              </Marker>
            );
          })}
        </ZoomableGroup>
      </ComposableMap>
      {hoveredMarker && (
        <div className="pointer-events-none absolute left-4 bottom-4 rounded-lg border border-white/[0.08] bg-slate-900/95 px-3 py-2 text-xs backdrop-blur">
          <span className="font-medium text-white">{hoveredMarker.city}, {hoveredMarker.country}</span>
          <span className="ml-2 text-indigo-300">{hoveredMarker.count} conexões</span>
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */

export default function MasterPage() {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const m = messages.master;

  const [authenticated, setAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');

  const [period, setPeriod] = useState<Period>('30d');
  const [stats, setStats] = useState<MasterStats | null>(null);
  const [timeline, setTimeline] = useState<MasterTimelineResponse | null>(null);
  const [geo, setGeo] = useState<MasterGeoResponse | null>(null);
  const [geoMarkers, setGeoMarkers] = useState<MasterGeoMarkersResponse | null>(null);
  const [duration, setDuration] = useState<MasterDurationResponse | null>(null);
  const [active, setActive] = useState<MasterActiveResponse | null>(null);
  const [online, setOnline] = useState<MasterOnlineResponse | null>(null);
  const [pages, setPages] = useState<MasterPagesResponse | null>(null);
  const [hosts, setHosts] = useState<MasterHostsResponse | null>(null);
  const [instances, setInstances] = useState<MasterInstancesResponse | null>(null);

  const periodRef = useRef(period);
  periodRef.current = period;

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('master_token')) {
      setAuthenticated(true);
    }
  }, []);

  const handleLogin = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setLoginError(null);
      try {
        const res = await masterAuth(user, password);
        sessionStorage.setItem('master_token', res.token);
        setAuthenticated(true);
      } catch (err: unknown) {
        const code =
          err && typeof err === 'object' && 'code' in err && typeof (err as any).code === 'string'
            ? (err as any).code
            : '';
        if (code === 'master_not_configured') {
          setLoginError(m.login.notConfigured);
        } else {
          setLoginError(m.login.error);
        }
      }
    },
    [user, password, m.login.error, m.login.notConfigured]
  );

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('master_token');
    setAuthenticated(false);
    setStats(null);
    setTimeline(null);
    setGeo(null);
    setGeoMarkers(null);
    setDuration(null);
    setActive(null);
    setOnline(null);
    setPages(null);
    setHosts(null);
    setInstances(null);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const p = periodRef.current;
      const [s, tl, g, gm, dur, act, pg, h, inst] = await Promise.all([
        getMasterStats(p),
        getMasterTimeline(p),
        getMasterGeo(p),
        getMasterGeoMarkers(p),
        getMasterDuration(p),
        getMasterActive(),
        getMasterPages(p),
        getMasterHosts(p),
        getMasterInstances()
      ]);
      setStats(s);
      setTimeline(tl);
      setGeo(g);
      setGeoMarkers(gm);
      setDuration(dur);
      setActive(act);
      setPages(pg);
      setHosts(h);
      setInstances(inst);
    } catch {
      handleLogout();
    }
  }, [handleLogout]);

  const fetchOnline = useCallback(async () => {
    try {
      setOnline(await getMasterOnline());
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    void fetchData();
    void fetchOnline();
    const dataId = setInterval(() => void fetchData(), REFRESH_INTERVAL);
    const onlineId = setInterval(() => void fetchOnline(), ONLINE_REFRESH_INTERVAL);
    return () => { clearInterval(dataId); clearInterval(onlineId); };
  }, [authenticated, fetchData, fetchOnline]);

  useEffect(() => {
    if (authenticated) void fetchData();
  }, [period, authenticated, fetchData]);

  const formatRelative = useCallback((isoOrTimestamp: string | number) => {
    const ts = typeof isoOrTimestamp === 'number' ? isoOrTimestamp : new Date(isoOrTimestamp).getTime();
    const diffMs = Date.now() - ts;
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return '< 1 min';
    if (diffMin < 60) return `${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ${diffMin % 60}m`;
    return `${Math.floor(diffH / 24)}d`;
  }, []);

  const pageHead = (
    <Seo
      title={`Referee Lights · ${m.header.title}`}
      description={m.metaDescription}
      canonicalPath="/master"
      noIndex
    />
  );

  // ----- LOGIN -----
  if (!authenticated) {
    return (
      <>
        {pageHead}
        <main className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-6 py-16 text-white">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm space-y-6 rounded-2xl border border-white/[0.06] bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-8 shadow-2xl backdrop-blur"
          >
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500/20">
                <svg className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h1 className="text-lg font-semibold uppercase tracking-[0.4em]">{m.login.title}</h1>
            </div>

            <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {m.login.userLabel}
              <input
                value={user}
                onChange={(e) => setUser(e.target.value)}
                className="min-h-[44px] rounded-lg border border-white/[0.06] bg-slate-950/80 px-3 text-sm font-medium text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {m.login.passwordLabel}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-[44px] rounded-lg border border-white/[0.06] bg-slate-950/80 px-3 text-sm font-medium text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/30"
              />
            </label>

            {loginError && (
              <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-2 text-center text-sm text-red-300">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={!user || !password}
              className="w-full rounded-lg bg-indigo-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {m.login.submit}
            </button>
          </form>
        </main>
      </>
    );
  }

  // Prepare chart data
  const timelineData = timeline?.timeline.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString(locale ?? 'pt-BR', { day: '2-digit', month: 'short' })
  })) ?? [];

  // ----- DASHBOARD -----
  return (
    <>
      {pageHead}
      <main className="min-h-screen bg-[#0a0e1a] text-slate-100">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-white/[0.04] bg-[#0a0e1a]/80 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/20">
                <svg className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h1 className="text-sm font-semibold uppercase tracking-[0.35em]">{m.header.title}</h1>
            </div>

            <div className="flex items-center gap-4">
              {/* Period selector */}
              <nav className="flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1">
                {(['today', '7d', '30d', 'all'] as Period[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPeriod(p)}
                    className={`rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.15em] transition ${
                      period === p ? 'bg-indigo-500/20 text-indigo-300' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </nav>

              {/* Online count badge */}
              {online && (
                <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  <span className="text-[11px] font-bold tabular-nums text-emerald-300">{online.count}</span>
                  <span className="text-[10px] text-emerald-400/70">agora</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              >
                {m.header.logout}
              </button>
            </div>
          </div>
        </header>

        <div className="space-y-6 px-6 py-6">
          {/* ─── Stat cards ─── */}
          {stats && (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Visitantes agora"
                value={online?.count ?? 0}
                sub="conectados via WebSocket"
                accent="bg-emerald-500"
              />
              <StatCard label="Sessões" value={stats.totalSessions} accent="bg-indigo-500" />
              <StatCard label="Conexões" value={stats.totalConnections} accent="bg-cyan-500" />
              <StatCard
                label="Tempo médio"
                value={duration ? `${duration.avgMinutes} min` : '—'}
                sub="por conexão"
                accent="bg-amber-500"
              />
            </section>
          )}

          {/* ─── Left stack (Sessions, Pages, Hosts) + Map (right) ─── */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <SectionCard title={`Sessões — ${PERIOD_LABELS[period]}`}>
                {timelineData.length === 0 ? (
                  <p className="py-12 text-center text-sm text-slate-600">Sem dados ainda.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={timelineData}>
                      <defs>
                        <linearGradient id="gradSessions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} width={30} />
                      <Tooltip {...tooltipStyle} />
                      <Area type="monotone" dataKey="sessions" name="Sessões" stroke="#6366f1" fill="url(#gradSessions)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </SectionCard>
              <SectionCard title="Páginas">
                <ProgressList
                  items={pages?.pages ?? []}
                  labelKey="page"
                  valueKey="count"
                  labelMap={PAGE_LABELS}
                />
              </SectionCard>
              <SectionCard title="Subdomínios">
                <ProgressList
                  items={hosts?.hosts ?? []}
                  labelKey="host"
                  valueKey="count"
                />
              </SectionCard>
            </div>
            <SectionCard title="Mapa de conexões" className="flex flex-col">
              <GeoMap markers={geoMarkers?.markers ?? []} />
            </SectionCard>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <SectionCard title="Países">
              <ProgressList
                items={geo?.countries ?? []}
                labelKey="country"
                valueKey="count"
              />
            </SectionCard>
            <SectionCard title="Cidades">
              <ProgressList
                items={(geo?.cities ?? []).map((c) => ({ ...c, label: `${c.city}, ${c.country}` }))}
                labelKey="label"
                valueKey="count"
              />
            </SectionCard>
          </div>

          {/* ─── Active rooms ─── */}
          <SectionCard title="Salas ativas">
            {!active || active.rooms.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhuma sala ativa.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {active.rooms.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-4 py-3">
                    <div>
                      <span className="font-mono text-sm text-indigo-300">{r.id}</span>
                      <p className="text-[10px] text-slate-500">{formatRelative(r.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${r.connectedJudges === 3 ? 'bg-emerald-400' : r.connectedJudges > 0 ? 'bg-amber-400' : 'bg-slate-600'}`} />
                      <span className="text-xs tabular-nums text-slate-400">{r.connectedJudges}/3</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ─── Online visitors ─── */}
          <SectionCard title="Ao vivo">
            {!online || online.visitors.length === 0 ? (
              <p className="text-sm text-slate-600">Nenhum visitante agora.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.04] text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                      <th className="px-3 py-2">Página</th>
                      <th className="px-3 py-2">Sala</th>
                      <th className="px-3 py-2">Subdomínio</th>
                      <th className="px-3 py-2">País</th>
                      <th className="px-3 py-2">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {online.visitors.map((v, i) => (
                      <tr key={i} className="border-b border-white/[0.02] transition hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs text-slate-300">{PAGE_LABELS[v.page] ?? v.page}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-indigo-300">{v.roomId}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-400">{v.host || '—'}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-400">{v.country ? `${v.country}${v.city ? `, ${v.city}` : ''}` : '—'}</td>
                        <td className="px-3 py-2.5 text-xs tabular-nums text-slate-500">{formatRelative(v.connectedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* ─── Instances ─── */}
          {instances && instances.instances.length > 0 && (
            <SectionCard title="Instâncias">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {instances.instances.map((inst) => {
                  const ago = Date.now() - new Date(inst.last_seen + 'Z').getTime();
                  const isOnline = ago < 10 * 60_000;
                  const uptimeH = Math.floor(inst.uptime_seconds / 3600);
                  const uptimeM = Math.floor((inst.uptime_seconds % 3600) / 60);
                  const uptimeStr = uptimeH > 0 ? `${uptimeH}h ${uptimeM}m` : `${uptimeM}m`;
                  return (
                    <div key={inst.instance_id} className="rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-indigo-300">{inst.instance_id.slice(0, 8)}...</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                          isOnline ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                          {isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                        <span>{inst.platform}/{inst.arch}</span>
                        <span className="text-right">Uptime: {uptimeStr}</span>
                        <span>Salas: <span className="text-slate-300">{inst.active_rooms}</span></span>
                        <span className="text-right">Sessões: <span className="text-slate-300">{inst.total_sessions}</span></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}
        </div>
      </main>
    </>
  );
}
