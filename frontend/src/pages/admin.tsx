import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent } from 'react';

import { DecisionLights } from '@/components/DecisionLights';
import TimerDisplay from '@/components/TimerDisplay';
import { IntervalCard, TimerCard, cardTitle, controlButton } from '@/components/TimerControls';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useRouterReady } from '@/hooks/useRouterReady';
import { createRoom, accessRoom, refreshRefereeTokens, getKeyRelayStatus, startKeyRelay, stopKeyRelay, type JoinQrCodesResponse, type KeyRelayStatus } from '@/lib/api';
import { FooterBadges } from '@/components/FooterBadges';
import { getMessages, type Messages } from '@/lib/i18n/messages';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/config';
import { BrandLogo } from '@/components/BrandLogo';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { RefereeQrModal } from '@/components/RefereeQrModal';
import { buildRefHref, buildRoomViewHref, openSideWindow, resolveAppOrigin, type QrTarget } from '@/lib/ref-links';
import { Seo } from '@/components/Seo';

interface AdminPageProps {
  networkIps: string[];
}

const previewLayout = {
  gapClass: 'gap-0',
  lights: { scale: 0.7, maxWidth: 'min(88vw, 1200px)' },
  timer: {
    scale: 0.78,
    maxWidth: 'min(88vw, 960px)',
    translateX: 'calc(-1 * min(5vw, 80px))'
  }
} as const;


function useViewportScale(designWidth = 1920, designHeight = 1280) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const sx = window.innerWidth / designWidth;
      const sy = window.innerHeight / designHeight;
      setScale(Math.min(sx, sy, 1)); // never zoom above 1
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [designWidth, designHeight]);
  return scale;
}

export default function AdminPage({ networkIps }: AdminPageProps) {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const viewportScale = useViewportScale();
  const messages = useMemo(() => getMessages(locale), [locale]);
  const adminMessages = messages.admin;
  const commonMessages = messages.common;
  const currentLocale = useMemo<AppLocale>(() => {
    if (locale && APP_LOCALES.includes(locale as AppLocale)) {
      return locale as AppLocale;
    }
    return APP_LOCALES[0];
  }, [locale]);
  const localeOptions = useMemo(
    () => APP_LOCALES.map((code) => ({ code, label: commonMessages.languages[code] ?? code })),
    [commonMessages.languages]
  );
  const routerReady = useRouterReady();
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : undefined;
  const adminPin = typeof router.query.pin === 'string' ? router.query.pin : undefined;

  const [roomAccess, setRoomAccess] = useState<JoinQrCodesResponse | null>(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomErrorCode, setRoomErrorCode] = useState<string | null>(null);
  const [mutationLoading, setMutationLoading] = useState(false);
  const [tokenRefreshing, setTokenRefreshing] = useState(false);
  const lastAttemptRef = useRef<string | null>(null);

  const [keyRelayStatus, setKeyRelayStatus] = useState<KeyRelayStatus | null>(null);
  const [krValidKey, setKrValidKey] = useState('F1');
  const [krInvalidKey, setKrInvalidKey] = useState('F10');
  const [krConfigOpen, setKrConfigOpen] = useState(false);
  const [krCapturing, setKrCapturing] = useState<'valid' | 'invalid' | null>(null);

  const [customMinutes, setCustomMinutes] = useState(1);
  const [intervalHours, setIntervalHours] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(0);

  const [qrMenuOpen, setQrMenuOpen] = useState(false);
  const [legendModalOpen, setLegendModalOpen] = useState(false);
  const [appOrigin, setAppOrigin] = useState('');

  const credentialsReady = Boolean(router.isReady && roomId && adminPin);
  const roomReady = Boolean(roomAccess && roomAccess.roomId === roomId);

  // Poll key-relay status
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const s = await getKeyRelayStatus();
        if (!cancelled) setKeyRelayStatus(s);
      } catch {
        if (!cancelled) setKeyRelayStatus(null);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const handleKeyRelayToggle = useCallback(async () => {
    if (!roomId || !adminPin) return;
    try {
      if (keyRelayStatus?.active) {
        await stopKeyRelay(roomId, adminPin);
      } else {
        await startKeyRelay(roomId, adminPin, krValidKey, krInvalidKey);
      }
      const s = await getKeyRelayStatus();
      setKeyRelayStatus(s);
    } catch (err) {
      console.error('Key relay toggle error:', err);
    }
  }, [keyRelayStatus, roomId, adminPin, krValidKey, krInvalidKey]);

  useEffect(() => {
    if (!credentialsReady) {
      return;
    }
    if (roomAccess && roomAccess.roomId === roomId) {
      return;
    }

    const attemptKey = `${roomId}:${adminPin}`;
    if (lastAttemptRef.current === attemptKey && roomErrorCode) {
      return;
    }

    lastAttemptRef.current = attemptKey;
    setRoomLoading(true);
    accessRoom(roomId!, adminPin!)
      .then((data) => {
        setRoomAccess(data);
        setRoomErrorCode(null);
      })
      .catch((error) => {
        setRoomAccess(null);
        setRoomErrorCode(getErrorCode(error));
      })
      .finally(() => {
        setRoomLoading(false);
      });
  }, [credentialsReady, roomId, adminPin, roomAccess, roomErrorCode]);

  useEffect(() => {
    setAppOrigin(resolveAppOrigin(networkIps));
  }, [networkIps]);

  const socketOptions = useMemo(() => {
    if (roomReady && roomId && adminPin) {
      return { roomId, adminPin } as const;
    }
    return {} as const;
  }, [roomReady, roomId, adminPin]);

  const {
    state,
    status,
    ready,
    release,
    clear,
    timerStart,
    timerStop,
    timerReset,
    timerSet,
    intervalSet,
    intervalStart,
    intervalStop,
    intervalReset,
    changeLocale,
    error: socketError
  } = useRoomSocket('admin', socketOptions);

  const setMinutes = () => {
    const seconds = Math.max(0, Math.round(customMinutes * 60));
    timerSet(seconds);
  };

  const totalIntervalSeconds = useMemo(() => {
    const hours = Math.max(0, intervalHours);
    const minutes = Math.max(0, intervalMinutes);
    const seconds = Math.max(0, intervalSeconds);
    return hours * 3600 + minutes * 60 + seconds;
  }, [intervalHours, intervalMinutes, intervalSeconds]);

  const handleIntervalSet = () => {
    intervalSet(totalIntervalSeconds);
  };

  const intervalDisplay = useMemo(() => formatHMS(state?.intervalMs ?? 0), [state?.intervalMs]);

  const lightsPreviewStyle = useMemo(
    () => ({
      transform: `scale(${previewLayout.lights.scale})`,
      transformOrigin: 'top center',
      maxWidth: previewLayout.lights.maxWidth,
      margin: '0 auto',
      display: 'inline-block'
    }),
    []
  );

  const timerPreviewStyle = useMemo(
    () => ({
      transform: `translateX(${previewLayout.timer.translateX}) scale(${previewLayout.timer.scale})`,
      transformOrigin: 'top center',
      maxWidth: previewLayout.timer.maxWidth,
      display: 'inline-block'
    }),
    []
  );

  const handleLocaleChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextLocale = event.target.value as AppLocale;
      if (!nextLocale || nextLocale === currentLocale) return;
      changeLocale(nextLocale);
      document.cookie = `NEXT_LOCALE=${nextLocale}; path=/; max-age=31536000`;
      void router.push({ pathname: router.pathname, query: router.query }, undefined, { locale: nextLocale });
    },
    [changeLocale, currentLocale, router]
  );

  const qrTargets = useMemo<QrTarget[]>(() => {
    if (!appOrigin || !roomId || !roomAccess) return [];
    return [
      {
        judge: 'left',
        label: adminMessages.qrMenu.targets.left,
        shortLabel: adminMessages.qrMenu.shortTargets.left,
        href: buildRefHref(appOrigin, roomId, roomAccess.joinQRCodes.left.token, 'left')
      },
      {
        judge: 'center',
        label: adminMessages.qrMenu.targets.center,
        shortLabel: adminMessages.qrMenu.shortTargets.center,
        href: buildRefHref(appOrigin, roomId, roomAccess.joinQRCodes.center.token, 'center')
      },
      {
        judge: 'right',
        label: adminMessages.qrMenu.targets.right,
        shortLabel: adminMessages.qrMenu.shortTargets.right,
        href: buildRefHref(appOrigin, roomId, roomAccess.joinQRCodes.right.token, 'right')
      }
    ];
  }, [adminMessages.qrMenu.targets, adminMessages.qrMenu.shortTargets, appOrigin, roomAccess, roomId]);

  // Display e timer costumam abrir em OUTRO computador: mesmo endereço de
  // rede dos QR dos árbitros (com o painel em localhost, um link relativo
  // levaria "localhost" para a outra máquina). A legenda abre aqui (prévia),
  // mas o "copiar link" dela usa esse endereço (shareOrigin).
  const displayLink = `${appOrigin}${buildRoomViewHref('/display', roomId, adminPin)}`;
  const timerLink = `${appOrigin}${buildRoomViewHref('/timer', roomId, adminPin)}`;
  const legendLink = useMemo(() => {
    const href = buildRoomViewHref('/legend', roomId, adminPin);
    if (!appOrigin) return href;
    return `${href}${href.includes('?') ? '&' : '?'}shareOrigin=${encodeURIComponent(appOrigin)}`;
  }, [appOrigin, roomId, adminPin]);
  const roomErrorMessage = formatApiError(roomErrorCode, commonMessages.errors);
  const socketErrorMessage = formatApiError(socketError, commonMessages.errors);

  useEffect(() => {
    if (!router.isReady) return;
    const targetLocale = state?.locale;
    if (!targetLocale) return;
    if (router.locale === targetLocale) return;
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000`;
    void router.replace({ pathname: router.pathname, query: router.query }, undefined, { locale: targetLocale });
  }, [router, state?.locale]);

  const handleCreateSession = useCallback(async () => {
    setMutationLoading(true);
    try {
      const data = await createRoom();
      setRoomAccess(data);
      setRoomErrorCode(null);
      await router.replace({ pathname: '/admin', query: { roomId: data.roomId, pin: data.adminPin } });
    } catch (error) {
      setRoomErrorCode(getErrorCode(error));
    } finally {
      setMutationLoading(false);
    }
  }, [router]);

  const handleJoinSession = useCallback(
    async (id: string, pin: string) => {
      setMutationLoading(true);
      try {
        const targetId = id.trim().toUpperCase();
        const targetPin = pin.trim();
        const data = await accessRoom(targetId, targetPin);
        setRoomAccess(data);
        setRoomErrorCode(null);
        await router.replace({ pathname: '/admin', query: { roomId: data.roomId, pin: data.adminPin } });
      } catch (error) {
        setRoomAccess(null);
        setRoomErrorCode(getErrorCode(error));
      } finally {
        setMutationLoading(false);
      }
    },
    [router]
  );

  const handleRefreshTokens = useCallback(async () => {
    if (!roomId || !adminPin) return;
    setTokenRefreshing(true);
    try {
      const data = await refreshRefereeTokens(roomId, adminPin);
      setRoomAccess(data);
      setRoomErrorCode(null);
    } catch (error) {
      setRoomErrorCode(getErrorCode(error));
    } finally {
      setTokenRefreshing(false);
    }
  }, [roomId, adminPin]);

  const pageHead = (
    <Seo
      title={`Referee Lights · ${adminMessages.header.title}`}
      description={adminMessages.metaDescription ?? 'Gerencie sessões IPF com PIN, timers, QR Codes e controle completo do painel Referee Lights.'}
      canonicalPath="/admin"
      noIndex
    />
  );

  const hasCredentials = Boolean(roomId && adminPin);
  const hasAccess = Boolean(roomAccess && roomAccess.roomId === roomId);

  const shouldShowSetup =
    !hasCredentials ||
    (!hasAccess && !roomLoading && (roomErrorMessage || !credentialsReady));

  // Com sala e PIN na URL, "conectando" cobre também o instante antes da
  // primeira consulta começar (antes caía na tela de login por um render)
  const shouldShowConnecting = hasCredentials && !hasAccess && !roomErrorMessage;

  // Até ler a URL, só o fundo: sem piscar a tela de login ao recarregar
  if (!routerReady) {
    return (
      <>
        {pageHead}
        <div className="min-h-screen bg-slate-950" />
      </>
    );
  }

  if (shouldShowSetup) {
    return (
      <>
        {pageHead}
        <RoomSetup
          onCreate={handleCreateSession}
          onJoin={handleJoinSession}
          loading={mutationLoading}
          error={roomErrorMessage}
          initialRoomId={roomId}
          initialPin={adminPin}
          messages={adminMessages}
          common={commonMessages}
          locale={currentLocale}
          localeOptions={localeOptions}
          onLocaleChange={handleLocaleChange}
        />
      </>
    );
  }

  if (shouldShowConnecting) {
    return (
      <>
        {pageHead}
        <FullPageMessage
          title={adminMessages.fullPage.connectingTitle}
          description={adminMessages.fullPage.connectingDescription}
          delayed
        />
      </>
    );
  }

  if (!hasAccess || !roomAccess) {
    return (
      <>
        {pageHead}
        <RoomSetup
          onCreate={handleCreateSession}
          onJoin={handleJoinSession}
          loading={mutationLoading}
          error={roomErrorMessage ?? socketErrorMessage}
          initialRoomId={roomId}
          initialPin={adminPin}
          messages={adminMessages}
          common={commonMessages}
          locale={currentLocale}
          localeOptions={localeOptions}
          onLocaleChange={handleLocaleChange}
        />
      </>
    );
  }

  return (
    <>
      {pageHead}
      <div className="h-screen w-screen overflow-hidden bg-slate-950">
      <main
        className="flex h-screen flex-col gap-4 bg-slate-950 px-10 py-5 text-slate-100 overflow-hidden"
        style={viewportScale < 1 ? {
          transformOrigin: 'top left',
          transform: `scale(${viewportScale})`,
          width: `${100 / viewportScale}%`,
          height: `${100 / viewportScale}vh`,
        } : undefined}
      >
        {/* Mesmas colunas da tela: logo centrada sobre o menu da esquerda;
            título, sala e PIN numa linha só alinhados com o painel */}
        <header className="grid items-center gap-6 md:grid-cols-[360px_1fr]">
          <div className="flex justify-center">
            <BrandLogo size={45} />
          </div>
          <div className="flex items-center justify-between gap-6">
            <div className="flex flex-wrap items-center gap-3 uppercase">
              <h1 className="text-lg font-semibold tracking-[0.3em] text-slate-300">
                {adminMessages.header.title}
              </h1>
              {roomId && adminPin && (
                <>
                  <span className="h-6 w-px bg-white/15" aria-hidden="true" />
                  <span className="rounded-lg bg-white/10 px-3 py-1 text-lg font-bold tracking-[0.2em] text-white">
                    {commonMessages.labels.room}: {roomId}
                  </span>
                  <span className="rounded-lg bg-white/5 px-3 py-1 text-lg font-semibold tracking-[0.2em] text-slate-200">
                    {commonMessages.labels.adminPinShort}: {adminPin}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2">
                <ConnectionStatus status={status} messages={commonMessages} />
                {tokenRefreshing && <span className="text-[13px] text-slate-400">· {adminMessages.header.generatingLinks}</span>}
              </span>
              <label htmlFor="locale-select" className="sr-only">
                {commonMessages.languageLabel}
              </label>
              <select
                id="locale-select"
                value={currentLocale}
                onChange={handleLocaleChange}
                className="min-w-[8rem] rounded-xl border border-white/10 bg-[#1A2231] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white [color-scheme:dark] shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
              >
                {localeOptions.map((option) => (
                  <option key={option.code} value={option.code} className="bg-[#1A2231] text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <section className="grid min-h-0 w-full flex-1 gap-6 md:grid-cols-[360px_1fr]">
          <aside className="flex flex-col gap-4 overflow-y-auto rounded-3xl border border-slate-800 bg-[#0B1019] p-5 shadow-2xl [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700">
            {/* Mesmos cartões da tela do cronometrista */}
            <TimerCard
              messages={adminMessages.timer}
              remainingMs={state?.timerMs ?? 60_000}
              running={state?.running ?? false}
              minutes={customMinutes}
              onMinutesChange={setCustomMinutes}
              onStart={timerStart}
              onStop={timerStop}
              onReset={timerReset}
              onSet={setMinutes}
            />
            <IntervalCard
              messages={adminMessages.interval}
              shortLabels={messages.referee.center}
              display={intervalDisplay}
              hours={intervalHours}
              minutes={intervalMinutes}
              seconds={intervalSeconds}
              onHoursChange={setIntervalHours}
              onMinutesChange={setIntervalMinutes}
              onSecondsChange={setIntervalSeconds}
              onSet={handleIntervalSet}
              onStart={intervalStart}
              onPause={intervalStop}
              onReset={intervalReset}
            />

            {status === 'connected' && roomId && keyRelayStatus?.available && (
              <section className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4" aria-label={adminMessages.automation.title}>
                <div className="flex h-8 items-center justify-between gap-2">
                  <h2 className={`${cardTitle} whitespace-nowrap`}>{adminMessages.automation.title}</h2>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                    keyRelayStatus?.active ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/15 text-slate-400'
                  }`}>
                    <span className={`h-2 w-2 rounded-full ${keyRelayStatus?.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                    {keyRelayStatus?.active ? adminMessages.automation.active : adminMessages.automation.inactive}
                  </span>
                </div>
                <p className="text-[13px] leading-snug text-slate-400">
                  {adminMessages.automation.description}
                </p>
                {/* Teclas configuradas: abre a configuração (antes era um link pequeno no título) */}
                <button
                  type="button"
                  onClick={() => setKrConfigOpen(true)}
                  className="flex h-10 items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-400 transition hover:border-slate-500"
                >
                  {adminMessages.automation.keys}
                  <span className="text-[15px] font-semibold tabular-nums text-white">{krValidKey} / {krInvalidKey}</span>
                </button>
                <button
                  className={`${controlButton} ${keyRelayStatus?.active ? 'bg-red-500 text-white hover:bg-red-400' : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'}`}
                  onClick={handleKeyRelayToggle}
                >
                  {keyRelayStatus?.active ? adminMessages.automation.disable : adminMessages.automation.enable}
                </button>
              </section>
            )}

          </aside>

          <section className="relative flex min-h-0 flex-col items-center justify-center rounded-3xl border border-slate-800 bg-[#0B1019] p-6 shadow-2xl">
            {state ? (
              <div className={`flex w-full flex-1 flex-col items-center justify-center ${previewLayout.gapClass}`}>
                <div className="flex w-full justify-center">
                  <div style={lightsPreviewStyle}>
                    <DecisionLights state={state} showLightPlaceholders={false} forceConnectedPlaceholders />
                  </div>
                </div>
                <div className="flex w-full justify-center">
                  <div style={timerPreviewStyle} className="mx-auto flex flex-col items-center gap-6">
                    <TimerDisplay
                      variant="display"
                      remainingMs={state.timerMs}
                      running={state.running}
                      phase={state.phase}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-400">{adminMessages.preview.waiting}</p>
            )}
            <div className="pointer-events-none absolute bottom-6 right-6 flex flex-row items-center gap-3">
              <button
                type="button"
                onClick={() => setQrMenuOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
              >
                {adminMessages.preview.showQr}
              </button>
              <Link
                href={displayLink}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
              >
                {adminMessages.preview.goToDisplay}
              </Link>
              <button
                type="button"
                onClick={() => setLegendModalOpen(true)}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
              >
                {adminMessages.preview.goToLegend}
              </button>
              <Link
                href={timerLink}
                onClick={(event) => {
                  // Clique simples: timer numa janela própria, estreita e na
                  // altura da tela, e o admin continua aberto. Com Ctrl/⌘/Shift
                  // (ou janela bloqueada) segue o link normal.
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  if (openSideWindow(timerLink, 'referee-lights-timer')) event.preventDefault();
                }}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
              >
                {adminMessages.preview.goToTimer}
              </Link>
            </div>
          </section>
        </section>
        <FooterBadges />
      </main>
      </div>
      {(roomErrorMessage || socketErrorMessage) && (
        <StatusBanner message={roomErrorMessage ?? socketErrorMessage ?? ''} />
      )}
      {krConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setKrConfigOpen(false); setKrCapturing(null); }}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-white">{adminMessages.automation.configTitle}</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.2em] text-emerald-400">{adminMessages.automation.validDecision}</span>
                <button
                  type="button"
                  onClick={() => setKrCapturing('valid')}
                  onKeyDown={(e) => {
                    if (krCapturing !== 'valid') return;
                    e.preventDefault();
                    const parts: string[] = [];
                    if (e.ctrlKey) parts.push('Ctrl');
                    if (e.altKey) parts.push('Alt');
                    if (e.shiftKey) parts.push('Shift');
                    if (e.metaKey) parts.push('Meta');
                    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
                    if (!['Control','Alt','Shift','Meta'].includes(e.key)) {
                      parts.push(k);
                      setKrValidKey(parts.join('+'));
                      setKrCapturing(null);
                    }
                  }}
                  className={`rounded-lg border px-4 py-3 text-center text-lg font-bold transition ${
                    krCapturing === 'valid'
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 animate-pulse'
                      : 'border-slate-700 bg-slate-950 text-white hover:border-slate-500'
                  }`}
                >
                  {krCapturing === 'valid' ? adminMessages.automation.pressKey : krValidKey}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-[0.2em] text-red-400">{adminMessages.automation.invalidDecision}</span>
                <button
                  type="button"
                  onClick={() => setKrCapturing('invalid')}
                  onKeyDown={(e) => {
                    if (krCapturing !== 'invalid') return;
                    e.preventDefault();
                    const parts: string[] = [];
                    if (e.ctrlKey) parts.push('Ctrl');
                    if (e.altKey) parts.push('Alt');
                    if (e.shiftKey) parts.push('Shift');
                    if (e.metaKey) parts.push('Meta');
                    const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
                    if (!['Control','Alt','Shift','Meta'].includes(e.key)) {
                      parts.push(k);
                      setKrInvalidKey(parts.join('+'));
                      setKrCapturing(null);
                    }
                  }}
                  className={`rounded-lg border px-4 py-3 text-center text-lg font-bold transition ${
                    krCapturing === 'invalid'
                      ? 'border-red-400 bg-red-500/20 text-red-300 animate-pulse'
                      : 'border-slate-700 bg-slate-950 text-white hover:border-slate-500'
                  }`}
                >
                  {krCapturing === 'invalid' ? adminMessages.automation.pressKey : krInvalidKey}
                </button>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setKrConfigOpen(false); setKrCapturing(null); }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-900 hover:bg-white transition"
              >
                {commonMessages.srOnly.close}
              </button>
            </div>
          </div>
        </div>
      )}
      {qrMenuOpen && (
        <RefereeQrModal
          targets={qrTargets}
          onClose={() => setQrMenuOpen(false)}
          loading={!appOrigin}
          onRefreshTokens={handleRefreshTokens}
          refreshing={tokenRefreshing}
          messages={adminMessages.qrMenu}
          confirmRegenerateText={commonMessages.confirmations.regenerateTokens}
          closeLabel={commonMessages.srOnly.close}
        />
      )}
      {legendModalOpen && (
        <LegendPreviewModal
          src={legendLink}
          onClose={() => setLegendModalOpen(false)}
          title={adminMessages.preview.goToLegend}
          closeLabel={commonMessages.srOnly.close}
        />
      )}
    </>
  );
}

function LegendPreviewModal({
  src,
  onClose,
  title,
  closeLabel
}: {
  src: string;
  onClose: () => void;
  title: string;
  closeLabel: string;
}) {
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-6 py-10"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Faixa própria para o título e o fechar: antes o X ficava por cima da barra da legenda */}
      <div className="flex h-[85vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#0F141F] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <span className="text-[15px] font-bold uppercase tracking-[0.12em] text-slate-200">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-xl leading-none text-white transition hover:bg-white/20"
          >
            <span className="sr-only">{closeLabel}</span>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <iframe
          src={src}
          title={title}
          className="min-h-0 w-full flex-1"
          loading="lazy"
        />
      </div>
    </div>
  );
}

function RoomSetup(props: {
  onCreate: () => Promise<void>;
  onJoin: (roomId: string, pin: string) => Promise<void>;
  loading: boolean;
  error: string | null;
  initialRoomId?: string;
  initialPin?: string;
  messages: Messages['admin'];
  common: Messages['common'];
  locale: AppLocale;
  localeOptions: { code: AppLocale; label: string }[];
  onLocaleChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}) {
  const { onCreate, onJoin, loading, error, initialRoomId, initialPin, messages, common, locale, localeOptions, onLocaleChange } = props;
  const [roomId, setRoomId] = useState(initialRoomId ?? '');
  const [pin, setPin] = useState(initialPin ?? '');
  // Cabe sempre na janela, sem rolagem: mede o conteúdo e reduz a escala
  const fitRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const update = () => {
      const pad = 32;
      const s = Math.min(1, (window.innerHeight - pad) / el.offsetHeight, (window.innerWidth - pad) / el.offsetWidth);
      setFitScale(Number.isFinite(s) && s > 0 ? s : 1);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomId || !pin) return;
    await onJoin(roomId, pin);
  };

  return (
    <main className="relative flex h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 text-white">
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-[#0B1220] via-[#0C1526] to-[#020617]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-indigo-500/30 via-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-700/20 blur-3xl" />


      <div
        ref={fitRef}
        data-fit-scale={fitScale.toFixed(3)}
        className="w-full max-w-6xl space-y-10"
        style={fitScale < 1 ? { transform: `scale(${fitScale})`, transformOrigin: 'center center' } : undefined}
      >
        <div className="space-y-6">
          {/* No fluxo (nunca sobre o texto), alinhado à borda direita dos
              cartões; mesmo estilo do seletor do painel da sala */}
          <div className="flex justify-end">
            <label htmlFor="setup-locale-select" className="sr-only">
              {common.languageLabel}
            </label>
            <select
              id="setup-locale-select"
              value={locale}
              onChange={onLocaleChange}
              className="min-w-[8rem] rounded-xl border border-white/10 bg-[#1A2231] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white [color-scheme:dark] shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            >
              {localeOptions.map((option) => (
                <option key={option.code} value={option.code} className="bg-[#1A2231] text-white">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {/* Mesma grade dos cartões: identidade sobre o cartão de criar,
              explicação alinhada à borda do cartão de entrar */}
          <header className="grid items-center gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
            <div className="flex items-center gap-6">
              <BrandLogo size={40} />
              <div className="h-14 w-px shrink-0 bg-white/15" aria-hidden="true" />
              <h1 className="min-w-0 text-4xl font-semibold leading-tight tracking-tight text-white md:text-[2.5rem]">
                {messages.roomSetup.title}
              </h1>
            </div>
            <p className="max-w-md text-[15px] leading-relaxed text-slate-400">{messages.roomSetup.description}</p>
          </header>
        </div>

        <section className="grid gap-10 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#101b2f] via-[#0d1728] to-[#091120] p-10 shadow-[0_26px_90px_rgba(6,11,24,0.6)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-transparent" />

            <div className="relative z-10 space-y-6">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight text-white">
                  {messages.roomSetup.create.title}
                </h2>
                <p className="text-base leading-relaxed text-slate-200">
                  {messages.roomSetup.create.description}
                </p>
              </div>

              <div className="grid gap-4 text-sm text-slate-200">
                <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/10 p-4 backdrop-blur">
                  <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-sky-500/20 text-sm font-semibold text-sky-100">
                    01
                  </span>
                  <p className="leading-relaxed">{messages.roomSetup.create.steps[0]}</p>
                </div>
                <div className="flex items-start gap-4 rounded-2xl border border-white/5 bg-white/10 p-4 backdrop-blur">
                  <span className="mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 text-sm font-semibold text-emerald-100">
                    02
                  </span>
                  <p className="leading-relaxed">{messages.roomSetup.create.steps[1]}</p>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-2">
                <button
                  type="button"
                  onClick={onCreate}
                  disabled={loading}
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-sky-500 via-indigo-500 to-blue-500 px-6 py-3 text-base font-semibold tracking-tight text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {messages.roomSetup.create.cta}
                </button>
                <span className="text-balance text-[13px] text-slate-200 xl:whitespace-nowrap">{messages.roomSetup.create.note}</span>
              </div>
            </div>
          </article>

          <form
            onSubmit={handleSubmit}
            className="flex h-full flex-col gap-7 rounded-3xl border border-white/10 bg-slate-900/80 p-10 shadow-[0_30px_90px_rgba(15,23,42,0.55)] backdrop-blur"
          >
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {messages.roomSetup.join.title}
              </h2>
              <p className="text-base leading-relaxed text-slate-300">
                {messages.roomSetup.join.description}
              </p>
            </div>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100">
              {messages.roomSetup.join.roomLabel}
              <input
                value={roomId}
                onChange={(event) => setRoomId(event.target.value.toUpperCase())}
                placeholder={messages.roomSetup.join.roomPlaceholder}
                className="rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-lg font-medium uppercase tracking-[0.22em] text-white placeholder:text-slate-500 shadow-inner transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              />
            </label>

            <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-100">
              {messages.roomSetup.join.pinLabel}
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder={messages.roomSetup.join.pinPlaceholder}
                className="rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-lg font-medium text-white placeholder:text-slate-500 shadow-inner transition focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading}
              />
            </label>

            <button
              type="submit"
              disabled={loading || !roomId || !pin}
              className="mt-2 inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-500 via-indigo-400 to-sky-400 px-6 py-3 text-base font-semibold tracking-tight text-white transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {messages.roomSetup.join.submit}
            </button>
          </form>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/15 px-6 py-4 text-center text-sm font-semibold tracking-tight text-red-100">
            {error}
          </div>
        )}
        <FooterBadges />
      </div>
    </main>
  );
}



function FullPageMessage({ title, description, delayed = false }: { title: string; description: string; delayed?: boolean }) {
  // delayed: o texto só aparece se demorar (conexão rápida não pisca mensagem)
  const [visible, setVisible] = useState(!delayed);
  useEffect(() => {
    if (!delayed) return;
    const id = window.setTimeout(() => setVisible(true), 500);
    return () => window.clearTimeout(id);
  }, [delayed]);
  if (!visible) return <main className="min-h-screen bg-slate-950" />;
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-white">
      <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">{title}</h1>
      <p className="max-w-md text-sm text-slate-300">{description}</p>
    </main>
  );
}

function StatusBanner({ message }: { message: string }) {
  return (
    <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-full border border-white/20 bg-white/15 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white">
      {message}
    </div>
  );
}

function formatHMS(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600)
    .toString()
    .padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function getErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as any).code === 'string') {
    return (error as any).code as string;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'request_failed';
}

function formatApiError(code: string | null | undefined, errors: Record<string, string>) {
  if (!code) return null;
  return errors[code] ?? code;
}

export const getServerSideProps: GetServerSideProps<AdminPageProps> = async () => {
  const os = await import('os');
  const nets = os.networkInterfaces();
  const ips = new Set<string>();

  Object.values(nets).forEach((entries) => {
    (entries ?? []).forEach((entry) => {
      if (entry && entry.family === 'IPv4' && !entry.internal) {
        ips.add(entry.address);
      }
    });
  });

  return {
    props: {
      networkIps: Array.from(ips)
    }
  };
};
