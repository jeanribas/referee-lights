import Link from 'next/link';
import { useRouter } from 'next/router';

import { DecisionLights } from '@/components/DecisionLights';
import { FullscreenButton } from '@/components/FullscreenButton';
import TimerDisplay from '@/components/TimerDisplay';
import IntervalCountdown from '@/components/IntervalCountdown';
import IntervalFull from '@/components/IntervalFull';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useWakeLock } from '@/hooks/useWakeLock';
import { getMessages, type Messages } from '@/lib/i18n/messages';
import { Seo } from '@/components/Seo';
import { FooterBadges } from '@/components/FooterBadges';

function useViewportScale(designWidth = 1920, designHeight = 1080) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / designWidth;
      const sy = window.innerHeight / designHeight;
      setScale(Math.min(sx, sy, 1));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [designWidth, designHeight]);
  return scale;
}

export default function DisplayPage() {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const displayMessages = messages.display;
  const commonMessages = messages.common;
  const isSpanishLocale = Boolean(locale?.startsWith('es'));
  const buttonTrackingClass = isSpanishLocale ? 'tracking-[0.22em]' : 'tracking-[0.3em]';
  const sectionLabelTrackingClass = isSpanishLocale ? 'tracking-[0.26em]' : 'tracking-[0.32em]';
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : undefined;
  const adminPin = typeof router.query.pin === 'string' ? router.query.pin : undefined;

  const { state, error } = useRoomSocket('display', {
    roomId,
    adminPin
  });

  const viewportScale = useViewportScale();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [keepAwake, setKeepAwake] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('displayKeepAwake');
    if (stored === 'false') return false;
    return true;
  });

  const intervalVisible = Boolean(
    state && state.intervalVisible && state.intervalConfiguredMs > 0 && state.intervalMs > 0
  );

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        closeMenu();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('displayKeepAwake', keepAwake ? 'true' : 'false');
  }, [keepAwake]);


  const wakeActive = useWakeLock(keepAwake);

  useEffect(() => {
    if (!router.isReady) return;
    const targetLocale = state?.locale;
    if (!targetLocale) return;
    if (router.locale === targetLocale) return;
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000`;
    void router.replace({ pathname: router.pathname, query: router.query }, undefined, { locale: targetLocale });
  }, [router, state?.locale]);

  if (!roomId || !adminPin) {
    return <MissingDisplayCredentials messages={displayMessages} />;
  }

  const adminLink = `/admin?roomId=${encodeURIComponent(roomId)}&pin=${encodeURIComponent(adminPin)}`;

  return (
    <>
      <Seo
        title="Referee Lights · Display"
        description={
          displayMessages.metaDescription ??
          'Tela de display IPF sincronizada com timers, luzes e alertas de intervalo controlados pelo painel Referee Lights.'
        }
        canonicalPath="/display"
        noIndex
      />
      <div className="h-screen w-screen overflow-hidden bg-black">
      <main
        className="relative flex h-screen flex-col bg-black px-6 pt-12 pb-16 text-white overflow-hidden"
        style={viewportScale < 1 ? {
          transformOrigin: 'top left',
          transform: `scale(${viewportScale})`,
          width: `${100 / viewportScale}%`,
          height: `${100 / viewportScale}vh`,
        } as CSSProperties : undefined}
      >
        <div className="fixed bottom-6 left-6 z-30 flex flex-col items-start gap-3" ref={menuRef}>
          {menuOpen && (
            <div
              className="w-full max-w-[20rem] rounded-3xl border border-white/10 bg-[#141820]/95 p-5 shadow-2xl backdrop-blur"
              style={{ width: 'min(20rem, calc(100vw - 2.5rem))' }}
            >
              <h2 className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-200">
                {displayMessages.menu.optionsTitle}
              </h2>
              <div className="mt-4 flex flex-col gap-5">
                <section className="flex flex-col gap-3">
                  <span className={`text-[10px] uppercase ${sectionLabelTrackingClass} text-slate-400`}>
                    {displayMessages.menu.quickActionsTitle}
                  </span>
                  <FullscreenButton
                    className={`w-full !rounded-xl bg-white/15 px-4 py-3 text-[10px] font-semibold uppercase ${buttonTrackingClass} text-white transition hover:bg-white/25`}
                    enterLabel={displayMessages.menu.fullscreenEnter}
                    exitLabel={displayMessages.menu.fullscreenExit}
                  />
                  <Link
                    href={adminLink}
                    className={`inline-flex w-full items-center justify-center rounded-xl bg-white/15 px-4 py-3 text-[10px] font-semibold uppercase ${buttonTrackingClass} text-white transition hover:bg-white/25`}
                  >
                    {displayMessages.menu.goToAdmin}
                  </Link>
                </section>

                <section className="flex flex-col gap-3 border-t border-white/10 pt-4">
                  <span className={`text-[10px] uppercase ${sectionLabelTrackingClass} text-slate-400`}>
                    {displayMessages.wake.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => setKeepAwake((prev) => !prev)}
                    className={`flex items-center justify-between rounded-xl bg-white/15 px-4 py-3 text-[10px] font-semibold uppercase ${buttonTrackingClass} text-white transition hover:bg-white/25`}
                  >
                    <span>{displayMessages.wake.keepAwake}</span>
                    <span className="text-xs">
                      {keepAwake ? displayMessages.wake.on : displayMessages.wake.off}
                    </span>
                  </button>
                  {!wakeActive && keepAwake && (
                    <span className="text-[10px] text-amber-300">
                      {displayMessages.wake.warning}
                    </span>
                  )}
                </section>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white shadow-lg hover:bg-white/20"
          >
            <span className="sr-only">{displayMessages.menu.toggleButton}</span>
            <div className="flex flex-col gap-[5px]">
              <span className="block h-[3px] w-6 rounded bg-white"></span>
              <span className="block h-[3px] w-6 rounded bg-white"></span>
              <span className="block h-[3px] w-6 rounded bg-white"></span>
            </div>
          </button>
        </div>

        {intervalVisible && state ? (
          <div className="flex flex-1 items-center justify-center">
            <div>
              <IntervalFull
                intervalMs={state.intervalMs}
                configuredMs={state.intervalConfiguredMs}
                running={state.intervalRunning}
                labels={displayMessages.interval}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-[8vh]">
            <div className="flex w-full justify-center">
              {state ? (
                <div>
                  <DecisionLights
                    state={state}
                    showLightPlaceholders={false}
                    forceConnectedPlaceholders
                  />
                </div>
              ) : (
                <p className="text-sm uppercase tracking-[0.4em] text-slate-400">
                  {displayMessages.status.waiting}
                </p>
              )}
            </div>
            <div className="flex flex-col items-center gap-10">
              {state && (state.intervalConfiguredMs > 0 || state.intervalMs > 0) && state.intervalVisible && (
                <IntervalCountdown
                  intervalMs={state.intervalMs}
                  configuredMs={state.intervalConfiguredMs}
                  running={state.intervalRunning}
                  labels={displayMessages.countdown}
                />
              )}
              <TimerDisplay
                variant="display"
                remainingMs={state?.timerMs ?? 60_000}
                running={state?.running ?? false}
                phase={state?.phase ?? 'idle'}
              />
            </div>
          </div>
        )}
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 opacity-60 hover:opacity-100 transition">
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

function MissingDisplayCredentials({ messages }: { messages: Messages['display'] }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black px-6 py-12 text-center text-white">
      <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">{messages.missing.title}</h1>
      <p className="max-w-xl text-sm text-white/70">{messages.missing.description}</p>
      <Link
        href="/admin"
        className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
      >
        {messages.missing.goToAdmin}
      </Link>
    </main>
  );
}
