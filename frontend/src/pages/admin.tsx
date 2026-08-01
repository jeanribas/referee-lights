import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import QRCode from 'react-qr-code';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, MouseEvent } from 'react';

import { DecisionLights } from '@/components/DecisionLights';
import TimerDisplay from '@/components/TimerDisplay';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { createRoom, accessRoom, refreshRefereeTokens, getKeyRelayStatus, startKeyRelay, stopKeyRelay, type JoinQrCodesResponse, type KeyRelayStatus } from '@/lib/api';
import { FooterBadges } from '@/components/FooterBadges';
import type { Judge } from '@/types/state';
import { getMessages, type Messages } from '@/lib/i18n/messages';
import { APP_LOCALES, type AppLocale } from '@/lib/i18n/config';
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

interface QrTarget {
  judge: Judge;
  label: string;
  href: string;
}

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
  const isSpanishLocale = Boolean(locale?.startsWith('es'));
  const cardHeadingTracking = isSpanishLocale ? 'tracking-[0.25em]' : 'tracking-[0.3em]';
  const labelTracking = isSpanishLocale ? 'tracking-[0.12em]' : 'tracking-[0.16em]';
  const smallLabelTracking = isSpanishLocale ? 'tracking-[0.18em]' : 'tracking-[0.26em]';
  const buttonTracking = isSpanishLocale ? 'tracking-[0.08em]' : 'tracking-[0.14em]';
  const buttonTextSize = isSpanishLocale ? 'text-[9px]' : 'text-[10px]';
  const controlButtonBase = `min-h-[48px] rounded-lg px-3 py-2.5 ${buttonTextSize} font-semibold uppercase ${buttonTracking} leading-tight text-center whitespace-normal transition`;
  const controlButtonFull = `${controlButtonBase} w-full sm:w-auto`;
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
  const configuredQrOrigin = process.env.NEXT_PUBLIC_QR_ORIGIN?.trim();

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
    if (!roomId) return;
    try {
      if (keyRelayStatus?.active) {
        await stopKeyRelay();
      } else {
        await startKeyRelay(roomId, krValidKey, krInvalidKey);
      }
      const s = await getKeyRelayStatus();
      setKeyRelayStatus(s);
    } catch (err) {
      console.error('Key relay toggle error:', err);
    }
  }, [keyRelayStatus, roomId, krValidKey, krInvalidKey]);

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
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol || 'https:';
      const protocolWithSlashes = protocol.endsWith(':') ? `${protocol}//` : 'https://';
      const port = window.location.port ? `:${window.location.port}` : '';
      const fallbackHost = window.location.hostname;
      const normalizedConfiguredOrigin = normalizeConfiguredOrigin(
        configuredQrOrigin,
        protocolWithSlashes
      );

      if (normalizedConfiguredOrigin) {
        setAppOrigin(normalizedConfiguredOrigin);
        return;
      }

      const ipHost = selectUsefulIp(networkIps);
      const host = ipHost ?? fallbackHost;
      setAppOrigin(`${protocolWithSlashes}${host}${port}`);
    }
  }, [networkIps, configuredQrOrigin]);

  const socketOptions = useMemo(() => {
    if (roomReady && roomId && adminPin) {
      return { roomId, adminPin } as const;
    }
    return {} as const;
  }, [roomReady, roomId, adminPin]);

  const {
    state,
    status,
    timerStart,
    timerStop,
    timerReset,
    timerSet,
    intervalSet,
    intervalStart,
    intervalStop,
    intervalReset,
    intervalShow,
    intervalHide,
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

  const intervalConfiguredDisplay = useMemo(
    () => formatHMS(state?.intervalConfiguredMs ?? 0),
    [state?.intervalConfiguredMs]
  );

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
        href: buildRefHref(appOrigin, roomId, roomAccess.joinQRCodes.left.token, 'left')
      },
      {
        judge: 'center',
        label: adminMessages.qrMenu.targets.center,
        href: buildRefHref(appOrigin, roomId, roomAccess.joinQRCodes.center.token, 'center')
      },
      {
        judge: 'right',
        label: adminMessages.qrMenu.targets.right,
        href: buildRefHref(appOrigin, roomId, roomAccess.joinQRCodes.right.token, 'right')
      }
    ];
  }, [adminMessages.qrMenu.targets.center, adminMessages.qrMenu.targets.left, adminMessages.qrMenu.targets.right, appOrigin, roomAccess, roomId]);

  const displayLink = buildRoomViewHref('/display', roomId, adminPin);
  const legendLink = buildRoomViewHref('/legend', roomId, adminPin);
  const timerLink = buildRoomViewHref('/timer', roomId, adminPin);
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

  const shouldShowConnecting = hasCredentials && roomLoading && !hasAccess;

  if (!router.isReady) {
    return (
      <>
        {pageHead}
        <FullPageMessage
          title={adminMessages.fullPage.loadingTitle}
          description={adminMessages.fullPage.loadingDescription}
        />
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
        />
      </>
    );
  }

  return (
    <>
      {pageHead}
      <div className="h-screen w-screen overflow-hidden bg-slate-950">
      <main
        className="flex h-screen flex-col gap-6 bg-slate-950 px-10 py-6 text-slate-100 overflow-hidden"
        style={viewportScale < 1 ? {
          transformOrigin: 'top left',
          transform: `scale(${viewportScale})`,
          width: `${100 / viewportScale}%`,
          height: `${100 / viewportScale}vh`,
        } : undefined}
      >
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">
              {adminMessages.header.title}
            </h1>
            {roomId && adminPin && (
              <div className="flex flex-wrap gap-6 text-xs uppercase tracking-[0.35em] text-slate-400">
                <span>
                  {commonMessages.labels.room}: {roomId}
                </span>
                <span>
                  {commonMessages.labels.adminPinShort}: {adminPin}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-start gap-1 text-sm uppercase tracking-[0.35em] text-slate-400">
            <span>
              {commonMessages.labels.status}: {status}
            </span>
            {tokenRefreshing && <span>{adminMessages.header.generatingLinks}</span>}
          </div>
          <div className="flex flex-col items-start gap-1 text-xs uppercase tracking-[0.3em] text-slate-400">
            <label htmlFor="locale-select" className="block">
              {commonMessages.languageLabel}
            </label>
            <select
              id="locale-select"
              value={currentLocale}
              onChange={handleLocaleChange}
              className="min-w-[8rem] rounded-xl border border-white/10 bg-[#1A2231] px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
            >
              {localeOptions.map((option) => (
                <option key={option.code} value={option.code} className="text-slate-900">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </header>

        <section className="grid min-h-0 w-full flex-1 gap-6 md:grid-cols-[320px_1fr]">
          <aside className="flex flex-col gap-6 overflow-y-auto rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-700">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0F141F] p-5">
              <h3 className={`text-xs font-semibold uppercase ${cardHeadingTracking} text-slate-300`}>
                {adminMessages.timer.title}
              </h3>
              <TimerDisplay remainingMs={state?.timerMs ?? 60_000} running={state?.running ?? false} variant="panel" />
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
                    onChange={(event) => setCustomMinutes(Number(event.target.value))}
                    className="w-full min-h-[44px] rounded border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
                  />
                </label>
                <button
                  className={`${controlButtonFull} bg-slate-200 text-slate-900 hover:bg-slate-100`}
                  onClick={setMinutes}
                >
                  {adminMessages.timer.set}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-[#0F141F] p-5">
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
                    onChange={(event) => setIntervalHours(Number(event.target.value))}
                    className="min-h-[44px] rounded border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-white/90 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
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
                    onChange={(event) => setIntervalMinutes(Number(event.target.value))}
                    className="min-h-[44px] rounded border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-white/90 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
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
                    onChange={(event) => setIntervalSeconds(Number(event.target.value))}
                    className="min-h-[44px] rounded border border-slate-700 bg-slate-950 px-3 text-center text-sm font-medium text-white/90 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/40"
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

            {status === 'connected' && roomId && keyRelayStatus?.available && (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-[#0F141F] p-5">
                <div className="flex items-center justify-between">
                  <h3 className={`text-xs font-semibold uppercase ${cardHeadingTracking} text-slate-300`}>
                    Key Relay
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setKrConfigOpen(true)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 transition"
                    >
                      {krValidKey}/{krInvalidKey}
                    </button>
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      keyRelayStatus?.active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-500'
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${keyRelayStatus?.active ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      {keyRelayStatus?.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>
                <button
                  className={`${controlButtonBase} ${keyRelayStatus?.active ? 'bg-red-500/80 text-white hover:bg-red-500' : 'bg-emerald-500 text-slate-900 hover:bg-emerald-400/90'}`}
                  onClick={handleKeyRelayToggle}
                >
                  {keyRelayStatus?.active ? 'Desativar' : 'Ativar Key Relay'}
                </button>
              </div>
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
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.3em] text-white">Configurar teclas</h2>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-400">Decisão válida (Good Lift)</span>
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
                  {krCapturing === 'valid' ? 'Pressione uma tecla...' : krValidKey}
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[10px] uppercase tracking-[0.2em] text-red-400">Decisão inválida (No Lift)</span>
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
                  {krCapturing === 'invalid' ? 'Pressione uma tecla...' : krInvalidKey}
                </button>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => { setKrConfigOpen(false); setKrCapturing(null); }}
                className="rounded-lg bg-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-slate-900 hover:bg-white transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
      {qrMenuOpen && (
        <QrMenu
          targets={qrTargets}
          onClose={() => setQrMenuOpen(false)}
          originReady={Boolean(appOrigin)}
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
      <div className="relative h-[85vh] w-full max-w-[1600px] overflow-hidden rounded-3xl border border-white/10 bg-[#0F141F] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <span className="sr-only">{closeLabel}</span>
          ×
        </button>
        <iframe
          src={src}
          title={title}
          className="h-full w-full"
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
}) {
  const { onCreate, onJoin, loading, error, initialRoomId, initialPin, messages } = props;
  const [roomId, setRoomId] = useState(initialRoomId ?? '');
  const [pin, setPin] = useState(initialPin ?? '');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!roomId || !pin) return;
    await onJoin(roomId, pin);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 py-16 text-white">
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-[#0B1220] via-[#0C1526] to-[#020617]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-80 bg-gradient-to-b from-indigo-500/30 via-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-700/20 blur-3xl" />

      <div className="w-full max-w-6xl space-y-14">
        <header className="max-w-3xl space-y-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/90">
            {messages.roomSetup.badge}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
            {messages.roomSetup.title}
          </h1>
          <p className="text-lg leading-relaxed text-slate-200">{messages.roomSetup.description}</p>
        </header>

        <section className="grid gap-10 md:grid-cols-[1.1fr_1fr]">
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
                <span className="text-sm text-slate-200">{messages.roomSetup.create.note}</span>
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


function QrMenu({
  targets,
  onClose,
  originReady,
  onRefreshTokens,
  refreshing,
  messages,
  confirmRegenerateText,
  closeLabel
}: {
  targets: QrTarget[];
  onClose: () => void;
  originReady: boolean;
  onRefreshTokens: () => Promise<void>;
  refreshing: boolean;
  messages: Messages['admin']['qrMenu'];
  confirmRegenerateText: string;
  closeLabel: string;
}) {
  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) {
      onClose();
    }
  };

  const handleRefreshClick = () => {
    if (refreshing) return;

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(confirmRegenerateText);

    if (!confirmed) return;

    void onRefreshTokens();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-6 py-10"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label={messages.ariaLabel}
    >
      <div className="relative w-full max-w-5xl rounded-3xl border border-white/10 bg-[#0F141F] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-6 top-6 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <span className="sr-only">{closeLabel}</span>
          ×
        </button>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold uppercase tracking-[0.4em] text-white">{messages.title}</h2>
          <p className="text-xs text-slate-400">{messages.description}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={refreshing}
              className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? messages.regenerating : messages.regenerate}
            </button>
          </div>
        </div>

        {!originReady || targets.length === 0 ? (
          <div className="mt-10 text-center text-sm text-slate-400">{messages.loading}</div>
        ) : (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {targets.map((target) => (
              <div
                key={target.judge}
                className="flex flex-col items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-5 text-center"
              >
                <div className="rounded-2xl bg-white/5 p-4">
                  <QRCode value={target.href} size={196} bgColor="transparent" fgColor="#ffffff" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-200">{target.label}</span>
                  <span className="text-[10px] text-slate-500 break-all">{target.href}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FullPageMessage({ title, description }: { title: string; description: string }) {
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

function buildRefHref(origin: string, roomId: string, token: string, judge: Judge) {
  const encodedRoom = encodeURIComponent(roomId);
  const encodedToken = encodeURIComponent(token);
  return `${origin}/ref/${judge}?roomId=${encodedRoom}&token=${encodedToken}`;
}

function buildRoomViewHref(
  path: '/display' | '/legend' | '/timer',
  roomId: string | undefined,
  adminPin: string | undefined
) {
  if (roomId && adminPin) {
    return `${path}?roomId=${encodeURIComponent(roomId)}&pin=${encodeURIComponent(adminPin)}`;
  }
  return path;
}

function normalizeConfiguredOrigin(value: string | undefined, defaultProtocol: string) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);
  const input = hasProtocol ? trimmed : `${defaultProtocol}${trimmed.replace(/^\/+/, '')}`;

  try {
    const url = new URL(input);
    return url.origin;
  } catch (error) {
    console.warn('Invalid NEXT_PUBLIC_QR_ORIGIN provided:', error);
    return '';
  }
}

function selectUsefulIp(candidates: string[]) {
  return candidates.find((candidate) => {
    if (!candidate) return false;
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return false;

    const [a, b] = candidate.split('.').map(Number);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;

    return false;
  });
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
