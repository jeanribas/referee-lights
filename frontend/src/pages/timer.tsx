import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { Seo } from '@/components/Seo';
import { FooterBadges } from '@/components/FooterBadges';
import TimerDisplay, { useCooldownBadges } from '@/components/TimerDisplay';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { getMessages, type Messages } from '@/lib/i18n/messages';

function useViewportScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      // In portrait/narrow: stack vertically, scale based on height only (width is fine)
      // In landscape/wide: side by side, scale based on both
      const isWide = window.innerWidth >= 768;
      const dw = isWide ? 768 : 380;
      const dh = isWide ? 650 : 1100;
      const sx = window.innerWidth / dw;
      const sy = window.innerHeight / dh;
      setScale(Math.min(sx, sy, 1));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return scale;
}

function formatInterval(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function TimerPage() {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const adminMessages = messages.admin;
  const displayMessages = messages.display;
  const commonMessages = messages.common;
  const isSpanishLocale = Boolean(locale?.startsWith('es'));
  const buttonTracking = isSpanishLocale ? 'tracking-[0.08em]' : 'tracking-[0.14em]';
  const buttonTextSize = isSpanishLocale ? 'text-[9px]' : 'text-[10px]';
  const labelTracking = isSpanishLocale ? 'tracking-[0.12em]' : 'tracking-[0.16em]';
  const smallLabelTracking = isSpanishLocale ? 'tracking-[0.18em]' : 'tracking-[0.26em]';
  const cardHeadingTracking = isSpanishLocale ? 'tracking-[0.25em]' : 'tracking-[0.3em]';
  const controlButtonBase = `min-h-[48px] rounded-lg px-3 py-2.5 ${buttonTextSize} font-semibold uppercase ${buttonTracking} leading-tight text-center whitespace-normal transition`;

  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : undefined;
  const adminPin = typeof router.query.pin === 'string' ? router.query.pin : undefined;

  const {
    state, error,
    timerStart, timerStop, timerReset, timerSet,
    intervalStart, intervalStop, intervalReset, intervalSet,
    intervalShow, intervalHide
  } = useRoomSocket('display', { roomId, adminPin });

  const cooldownBadges = useCooldownBadges(state?.phase);
  const [customMinutes, setCustomMinutes] = useState(1);
  const [intervalHours, setIntervalHours] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(0);

  useEffect(() => {
    if (!router.isReady) return;
    const targetLocale = state?.locale;
    if (!targetLocale) return;
    if (router.locale === targetLocale) return;
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000`;
    void router.replace({ pathname: router.pathname, query: router.query }, undefined, { locale: targetLocale });
  }, [router, state?.locale]);

  const handleSetMinutes = () => {
    timerSet(Math.max(0, customMinutes) * 60);
  };

  const handleIntervalSet = () => {
    const totalSeconds = intervalHours * 3600 + intervalMinutes * 60 + intervalSeconds;
    intervalSet(totalSeconds);
  };

  const intervalConfiguredDisplay = formatInterval(state?.intervalConfiguredMs ?? 0);
  const intervalDisplay = formatInterval(state?.intervalMs ?? 0);

  const viewportScale = useViewportScale();
  const scaleStyle: CSSProperties | undefined = viewportScale < 1 ? {
    transformOrigin: 'top left',
    transform: `scale(${viewportScale})`,
    width: `${100 / viewportScale}%`,
    height: `${100 / viewportScale}vh`,
  } : undefined;

  if (!roomId || !adminPin) {
    return <MissingTimerCredentials messages={displayMessages} />;
  }

  return (
    <>
      <Seo
        title="Referee Lights · Timer"
        description="Controle do cronômetro da plataforma Referee Lights."
        canonicalPath="/timer"
        noIndex
      />
      <div className="h-screen w-screen overflow-hidden bg-slate-950">
      <main className="flex h-screen flex-col items-center justify-center bg-slate-950 px-4 py-4 text-slate-100 overflow-hidden" style={scaleStyle}>
        <div className="flex w-full max-w-3xl flex-col gap-4 md:flex-row md:items-start">
          {/* Timer card */}
          <div className="flex flex-1 flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
            <h3 className={`text-xs font-semibold uppercase ${cardHeadingTracking} text-slate-300`}>
              {adminMessages.timer.title}
            </h3>
            <TimerDisplay remainingMs={state?.timerMs ?? 60_000} running={state?.running ?? false} variant="panel" />
            <div className="flex h-[2.6rem] items-center gap-2 pl-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
              {cooldownBadges.map((b) => (
                <span
                  key={b.id}
                  className="inline-flex -skew-x-12 items-center justify-center rounded-md h-[2.6rem] w-12 text-base font-black text-slate-900 shadow-[0_4px_0_rgba(0,0,0,0.3)]"
                  style={{ backgroundImage: b.gradient }}
                >
                  <span className="skew-x-12 leading-none tabular-nums">{b.value}</span>
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <button
                className={`${controlButtonBase} bg-emerald-500 text-slate-900 hover:bg-emerald-400/90`}
                onClick={timerStart}
              >
                {adminMessages.timer.start}
              </button>
              <button
                className={`${controlButtonBase} bg-amber-400 text-slate-900 hover:bg-amber-300/90`}
                onClick={timerStop}
              >
                {adminMessages.timer.stop}
              </button>
              <button
                className={`${controlButtonBase} bg-slate-700 text-white hover:bg-slate-600`}
                onClick={timerReset}
              >
                {adminMessages.timer.resetDefault}
              </button>
            </div>
            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-end sm:gap-3">
              <label className="flex flex-1 flex-col gap-1">
                <span className={`text-[10px] uppercase ${labelTracking} text-slate-400`}>
                  {adminMessages.timer.minutesLabel}
                </span>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(Number(e.target.value))}
                  className="w-full min-h-[44px] rounded-sm border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-hidden transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                />
              </label>
              <button
                className={`${controlButtonBase} w-full sm:w-auto bg-slate-200 text-slate-900 hover:bg-slate-100`}
                onClick={handleSetMinutes}
              >
                {adminMessages.timer.set}
              </button>
            </div>
          </div>

          {/* Interval card */}
          <div className="flex flex-1 flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-2xl">
            <header className="flex flex-col gap-1">
              <h3 className={`text-xs font-semibold uppercase ${cardHeadingTracking} text-slate-300`}>
                {adminMessages.interval.title}
              </h3>
              <span className={`text-[10px] uppercase ${smallLabelTracking} text-slate-500`}>
                {adminMessages.interval.configured}: {intervalConfiguredDisplay}
              </span>
              <span className={`text-[10px] uppercase ${smallLabelTracking} text-slate-500`}>
                {adminMessages.interval.remaining}: {intervalDisplay}
              </span>
            </header>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <label className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase ${labelTracking} text-slate-400`}>
                  {adminMessages.interval.hours}
                </span>
                <input
                  type="number"
                  min={0}
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(Number(e.target.value))}
                  className="min-h-[44px] rounded-sm border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-white/90 outline-hidden transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase ${labelTracking} text-slate-400`}>
                  {adminMessages.interval.minutes}
                </span>
                <input
                  type="number"
                  min={0}
                  value={intervalMinutes}
                  onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                  className="min-h-[44px] rounded-sm border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-white/90 outline-hidden transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className={`text-[10px] uppercase ${labelTracking} text-slate-400`}>
                  {adminMessages.interval.seconds}
                </span>
                <input
                  type="number"
                  min={0}
                  value={intervalSeconds}
                  onChange={(e) => setIntervalSeconds(Number(e.target.value))}
                  className="min-h-[44px] rounded-sm border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-white/90 outline-hidden transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <button
                className={`${controlButtonBase} bg-slate-200 text-slate-900 hover:bg-slate-100`}
                onClick={handleIntervalSet}
              >
                {adminMessages.interval.set}
              </button>
              <button
                className={`${controlButtonBase} bg-emerald-500 text-slate-900 hover:bg-emerald-400/90`}
                onClick={intervalStart}
              >
                {adminMessages.interval.start}
              </button>
              <button
                className={`${controlButtonBase} bg-amber-400 text-slate-900 hover:bg-amber-300/90`}
                onClick={intervalStop}
              >
                {adminMessages.interval.pause}
              </button>
              <button
                className={`${controlButtonBase} bg-slate-700 text-white hover:bg-slate-600`}
                onClick={intervalReset}
              >
                {adminMessages.interval.reset}
              </button>
              <button
                className={`col-span-2 ${controlButtonBase} bg-white/20 text-white hover:bg-white/30`}
                onClick={intervalShow}
              >
                {adminMessages.interval.showInterval}
              </button>
              <button
                className={`col-span-2 ${controlButtonBase} bg-white/20 text-white hover:bg-white/30`}
                onClick={intervalHide}
              >
                {adminMessages.interval.showLights}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              {adminMessages.interval.note}
            </p>
          </div>
        </div>
        <div className="mt-4 opacity-60">
          <FooterBadges />
        </div>
      </main>
      </div>
      {error && <StatusBanner message={error} errors={commonMessages.errors} />}
    </>
  );
}

function StatusBanner({ message, errors }: { message: string; errors: Record<string, string> }) {
  const text = errors[message] ?? message;
  return (
    <div className="fixed left-1/2 top-6 z-40 -translate-x-1/2 rounded-full border border-white/20 bg-white/15 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">
      {text}
    </div>
  );
}

function MissingTimerCredentials({ messages }: { messages: Messages['display'] }) {
  const translatedDescription = messages.missing.description.replace('/display?', '/timer?');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-white">
      <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">{messages.missing.title}</h1>
      <p className="max-w-xl text-sm text-white/70">{translatedDescription}</p>
      <Link
        href="/admin"
        className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
      >
        {messages.missing.goToAdmin}
      </Link>
    </main>
  );
}
