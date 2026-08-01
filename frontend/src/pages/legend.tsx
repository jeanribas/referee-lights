import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { DecisionLights } from '@/components/DecisionLights';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useWakeLock } from '@/hooks/useWakeLock';
import { getMessages } from '@/lib/i18n/messages';
import { Seo } from '@/components/Seo';
import { FooterBadges } from '@/components/FooterBadges';

const DEFAULT_LEGEND_BG = 'transparent';

function readQueryValue(raw: string | string[] | undefined): string | undefined {
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim();
  return undefined;
}

export default function LegendPage() {
  const router = useRouter();
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId.toUpperCase() : undefined;
  const adminPin = typeof router.query.pin === 'string' ? router.query.pin : undefined;
  const viewMode = readQueryValue(router.query.view);
  const legendBgQuery = readQueryValue(router.query.legendBg);
  const legendTimerQuery = readQueryValue(router.query.legendTimer);
  const legendDigitsQuery = readQueryValue(router.query.legendDigits);
  const legendPlaceholdersQuery = readQueryValue(router.query.legendPlaceholders);
  const legendFrameQuery = readQueryValue(router.query.legendFrame);
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const legendMessages = messages.legend;
  const commonMessages = messages.common;
  const isShareView = viewMode === 'share';

  const socketOptions = useMemo(
    () => (roomId && adminPin ? { roomId, adminPin } : {}),
    [roomId, adminPin]
  );

  const {
    state,
    status,
    error: socketError,
    setLegendConfig
  } = useRoomSocket('display', socketOptions);

  const socketErrorText = socketError ? commonMessages.errors[socketError] ?? socketError : null;
  const [menuOpen, setMenuOpen] = useState(false);
  const [bgColor, setBgColor] = useState(DEFAULT_LEGEND_BG);
  const [showPlaceholders, setShowPlaceholders] = useState(true);
  const [showDashedFrame, setShowDashedFrame] = useState(true);
  const [digitMode, setDigitMode] = useState<'mmss' | 'hhmmss'>('hhmmss');
  const [timerColor, setTimerColor] = useState('#FFFFFF');
  const [hydrated, setHydrated] = useState(false);
  const [savedConfig, setSavedConfig] = useState(false);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const appliedRemoteConfigKeyRef = useRef<string | null>(null);
  const [keepAwake, setKeepAwake] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('legendKeepAwake');
    if (stored === 'false') return false;
    return true;
  });

  const intervalPrimary = useMemo(
    () => formatHms(state?.intervalMs ?? 0, digitMode === 'hhmmss'),
    [state?.intervalMs, digitMode]
  );

  const remoteLegendConfig = state?.legendConfig;
  const remoteLegendConfigKey = useMemo(() => {
    if (!remoteLegendConfig) return null;
    return [
      remoteLegendConfig.bgColor,
      remoteLegendConfig.timerColor,
      remoteLegendConfig.digitMode,
      remoteLegendConfig.showPlaceholders ? '1' : '0',
      remoteLegendConfig.showDashedFrame ? '1' : '0',
      remoteLegendConfig.keepAwake ? '1' : '0'
    ].join('|');
  }, [remoteLegendConfig]);

  useEffect(() => {
    if (!router.isReady || typeof window === 'undefined') return;

    const storedBg = window.localStorage.getItem('legendBg');
    const storedPlaceholders = window.localStorage.getItem('legendPlaceholders');
    const storedFrame = window.localStorage.getItem('legendFrame');
    const storedDigits = window.localStorage.getItem('legendDigits');
    const storedColor = window.localStorage.getItem('legendTimerColor');
    const storedWake = window.localStorage.getItem('legendKeepAwake');

    let nextBgColor = DEFAULT_LEGEND_BG;
    let nextShowPlaceholders = true;
    let nextShowDashedFrame = true;
    let nextDigitMode: 'mmss' | 'hhmmss' = 'hhmmss';
    let nextTimerColor = '#FFFFFF';
    const nextKeepAwake = storedWake !== 'false';

    if (storedBg && isLegendBgColor(storedBg)) {
      nextBgColor = storedBg;
    }
    if (storedPlaceholders === 'true' || storedPlaceholders === 'false') {
      nextShowPlaceholders = storedPlaceholders === 'true';
    }
    if (storedFrame === 'true' || storedFrame === 'false') {
      nextShowDashedFrame = storedFrame === 'true';
    }
    if (storedDigits === 'mmss' || storedDigits === 'hhmmss') {
      nextDigitMode = storedDigits;
    }
    if (storedColor && isHexColor(storedColor)) {
      nextTimerColor = storedColor;
    }

    if (legendBgQuery && isLegendBgColor(legendBgQuery)) {
      nextBgColor = legendBgQuery;
    }
    if (legendTimerQuery && isHexColor(legendTimerQuery)) {
      nextTimerColor = legendTimerQuery;
    }
    if (legendDigitsQuery === 'mmss' || legendDigitsQuery === 'hhmmss') {
      nextDigitMode = legendDigitsQuery;
    }
    if (legendPlaceholdersQuery === '1' || legendPlaceholdersQuery === 'true') {
      nextShowPlaceholders = true;
    } else if (legendPlaceholdersQuery === '0' || legendPlaceholdersQuery === 'false') {
      nextShowPlaceholders = false;
    }
    nextShowDashedFrame = parseBooleanQuery(legendFrameQuery, nextShowDashedFrame);

    setBgColor(nextBgColor);
    setShowPlaceholders(nextShowPlaceholders);
    setShowDashedFrame(nextShowDashedFrame);
    setDigitMode(nextDigitMode);
    setTimerColor(nextTimerColor);
    setKeepAwake(nextKeepAwake);
    setHydrated(true);
  }, [router.isReady, legendBgQuery, legendTimerQuery, legendDigitsQuery, legendPlaceholdersQuery, legendFrameQuery]);

  useEffect(() => {
    if (!remoteLegendConfig || !remoteLegendConfigKey) return;
    if (appliedRemoteConfigKeyRef.current === remoteLegendConfigKey) return;

    appliedRemoteConfigKeyRef.current = remoteLegendConfigKey;
    setBgColor(remoteLegendConfig.bgColor);
    setTimerColor(remoteLegendConfig.timerColor);
    setDigitMode(remoteLegendConfig.digitMode);
    setShowPlaceholders(remoteLegendConfig.showPlaceholders);
    setShowDashedFrame(remoteLegendConfig.showDashedFrame);
    setKeepAwake(remoteLegendConfig.keepAwake);
  }, [remoteLegendConfig, remoteLegendConfigKey]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined' || isShareView) return;
    window.localStorage.setItem('legendBg', bgColor);
  }, [bgColor, hydrated, isShareView]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined' || isShareView) return;
    window.localStorage.setItem('legendPlaceholders', showPlaceholders ? 'true' : 'false');
  }, [showPlaceholders, hydrated, isShareView]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined' || isShareView) return;
    window.localStorage.setItem('legendFrame', showDashedFrame ? 'true' : 'false');
  }, [showDashedFrame, hydrated, isShareView]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined' || isShareView) return;
    window.localStorage.setItem('legendDigits', digitMode);
  }, [digitMode, hydrated, isShareView]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined' || isShareView) return;
    window.localStorage.setItem('legendTimerColor', timerColor);
  }, [timerColor, hydrated, isShareView]);

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined' || isShareView) return;
    window.localStorage.setItem('legendKeepAwake', keepAwake ? 'true' : 'false');
  }, [keepAwake, hydrated, isShareView]);

  const wakeActive = useWakeLock(keepAwake);

  useEffect(() => {
    if (!router.isReady) return;
    const targetLocale = state?.locale;
    if (!targetLocale) return;
    if (router.locale === targetLocale) return;
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000`;
    void router.replace({ pathname: router.pathname, query: router.query }, undefined, { locale: targetLocale });
  }, [router, state?.locale]);
  const statusSuffix = roomId ? legendMessages.statusRoomSuffix.replace('{roomId}', roomId) : '';
  const digitsModeLabel = digitMode === 'hhmmss' ? legendMessages.digitsModes.hhmmss : legendMessages.digitsModes.mmss;
  const digitsButtonLabel = legendMessages.buttons.digits.replace('{mode}', digitsModeLabel);
  const frameButtonLabel = showDashedFrame
    ? legendMessages.buttons.frameHide
    : legendMessages.buttons.frameShow;
  const bgPickerValue = isHexColor(bgColor) ? bgColor : '#000B1E';
  const lightsFrameClassName = getLegendLightsFrameClassName(showDashedFrame);
  const shareLink = useMemo(() => {
    const params = new URLSearchParams();
    if (roomId) params.set('roomId', roomId);
    if (adminPin) params.set('pin', adminPin);
    params.set('view', 'share');
    params.set('legendBg', bgColor);
    params.set('legendTimer', timerColor);
    params.set('legendDigits', digitMode);
    params.set('legendPlaceholders', showPlaceholders ? '1' : '0');
    params.set('legendFrame', showDashedFrame ? '1' : '0');
    return `/legend?${params.toString()}`;
  }, [
    roomId,
    adminPin,
    bgColor,
    timerColor,
    digitMode,
    showPlaceholders,
    showDashedFrame
  ]);

  const handleCopyShareLink = useCallback(async () => {
    if (typeof window === 'undefined' || !shareLink) return;
    const absoluteShareLink = `${window.location.origin}${shareLink}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(absoluteShareLink);
      } else {
        const helperInput = document.createElement('input');
        helperInput.value = absoluteShareLink;
        document.body.appendChild(helperInput);
        helperInput.select();
        document.execCommand('copy');
        document.body.removeChild(helperInput);
      }
      setCopiedShareLink(true);
      window.setTimeout(() => setCopiedShareLink(false), 1500);
    } catch {
      setCopiedShareLink(false);
    }
  }, [shareLink]);

  const handleSaveLegendConfig = useCallback(() => {
    if (typeof window === 'undefined' || isShareView) return;
    const nextLegendConfig = {
      bgColor,
      timerColor,
      digitMode,
      showPlaceholders,
      showDashedFrame,
      keepAwake
    };

    window.localStorage.setItem('legendBg', bgColor);
    window.localStorage.setItem('legendPlaceholders', showPlaceholders ? 'true' : 'false');
    window.localStorage.setItem('legendFrame', showDashedFrame ? 'true' : 'false');
    window.localStorage.setItem('legendDigits', digitMode);
    window.localStorage.setItem('legendTimerColor', timerColor);
    window.localStorage.setItem('legendKeepAwake', keepAwake ? 'true' : 'false');
    setLegendConfig(nextLegendConfig);
    setSavedConfig(true);
    window.setTimeout(() => setSavedConfig(false), 1500);
  }, [isShareView, bgColor, showPlaceholders, showDashedFrame, digitMode, timerColor, keepAwake, setLegendConfig]);

  return (
    <>
      <Seo
        title={`Referee Lights · ${legendMessages.title}`}
        description={
          legendMessages.metaDescription ??
          'Tela auxiliar com timer customizável, modo chroma e status sincronizado para transmissões de eventos IPF.'
        }
        canonicalPath="/legend"
        noIndex
      />

      <main
        className="flex min-h-screen flex-col gap-8 px-[clamp(12px,3vw,30px)] py-[clamp(10px,2.6vh,30px)] text-slate-100"
        style={{ backgroundColor: bgColor }}
      >
        {!isShareView && (
          <div className="rounded-3xl border border-white/10 bg-black/40 px-6 py-5 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
            <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold uppercase tracking-[0.45em] text-white">
                  {legendMessages.title}
                </h1>
                <span className="text-xs uppercase tracking-[0.35em] text-slate-300">
                  {commonMessages.labels.status}: {status}
                  {statusSuffix}
                </span>
                {(!roomId || !adminPin) ? (
                  <span className="text-[10px] uppercase tracking-[0.3em] text-amber-200">
                    {legendMessages.missingCredentials}
                  </span>
                ) : null}
                {socketErrorText ? (
                  <span className="text-[10px] uppercase tracking-[0.3em] text-red-300">
                    {legendMessages.errorPrefix} {socketErrorText}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
                >
                  {menuOpen ? legendMessages.buttons.paletteClose : legendMessages.buttons.paletteOpen}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlaceholders((prev) => !prev)}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
                >
                  {showPlaceholders
                    ? legendMessages.buttons.placeholdersHide
                    : legendMessages.buttons.placeholdersShow}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDashedFrame((prev) => !prev)}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
                >
                  {frameButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setDigitMode((prev) => (prev === 'hhmmss' ? 'mmss' : 'hhmmss'))}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
                >
                  {digitsButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={handleSaveLegendConfig}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
                >
                  {savedConfig ? legendMessages.share.saved : legendMessages.share.save}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyShareLink()}
                  className="rounded-full border border-white/15 bg-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/20"
                >
                  {copiedShareLink ? legendMessages.share.copied : legendMessages.share.copy}
                </button>
              </div>
            </header>
          </div>
        )}

        {!isShareView && menuOpen && (
          <section className="flex flex-wrap gap-4 rounded-3xl border border-white/10 bg-black/40 p-6">
            <h2 className="w-full text-xs font-semibold uppercase tracking-[0.35em] text-slate-300">
              {legendMessages.palette.title}
            </h2>
            <div className="flex flex-wrap gap-3">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setBgColor(color)}
                  className={`h-10 w-10 rounded-full border-2 transition ${
                    bgColor === color ? 'border-white' : 'border-white/30'
                  }`}
                  style={{ backgroundColor: color }}
                >
                  <span className="sr-only">
                    {legendMessages.palette.selectColor.replace('{color}', color.toUpperCase())}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBgColor('transparent')}
                className={`h-10 rounded-full border px-4 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-200 transition ${
                  bgColor === 'transparent'
                    ? 'border-white bg-white/20'
                    : 'border-white/30 bg-white/10 hover:bg-white/20'
                }`}
              >
                {legendMessages.palette.transparentBackground}
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 text-xs uppercase tracking-[0.3em] text-slate-300">
              <label className="flex items-center gap-3">
                <span>{legendMessages.palette.customColor}</span>
                <input
                  type="color"
                  value={bgPickerValue}
                  onChange={(event) => setBgColor(event.target.value)}
                  className="h-9 w-20 cursor-pointer rounded border border-white/30 bg-transparent"
                />
                <span className="text-[10px] text-slate-400">{bgColor.toUpperCase()}</span>
              </label>
              <label className="flex items-center gap-3">
                <span>{legendMessages.palette.timerColor}</span>
                <input
                  type="color"
                  value={timerColor}
                  onChange={(event) => setTimerColor(event.target.value)}
                  className="h-9 w-20 cursor-pointer rounded border border-white/30 bg-transparent"
                />
                <span className="text-[10px] text-slate-400">{timerColor.toUpperCase()}</span>
              </label>
              {!wakeActive && keepAwake && (
                <span className="text-[10px] text-amber-300">
                  {legendMessages.wakeWarning}
                </span>
              )}
            </div>
          </section>
        )}

        <section className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-[1700px] flex-col items-center justify-center gap-[clamp(20px,8vh,100px)]">
            <div className="flex w-full justify-center">
              {state ? (
                <div className={lightsFrameClassName}>
                  <div className="origin-top">
                    <DecisionLights
                      state={state}
                      showCardPlaceholders={showPlaceholders}
                      showLightPlaceholders={showPlaceholders}
                      showPendingRing={false}
                      sizeMode="legend"
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6 text-center text-sm text-slate-400">
                  {legendMessages.waiting}
                </div>
              )}
            </div>

            <div className="flex w-full justify-center">
              <LegendIntervalCard intervalLabel={intervalPrimary} color={timerColor} />
            </div>
          </div>
        </section>
        <div className="fixed bottom-2 left-1/2 -translate-x-1/2 opacity-60 hover:opacity-100 transition">
          <FooterBadges />
        </div>
      </main>
    </>
  );
}

function LegendIntervalCard({ intervalLabel, color }: { intervalLabel: string; color: string }) {
  return (
    <div
      className="font-display text-[clamp(3rem,14vw,9rem)] font-black leading-none tracking-tight"
      style={{ color }}
    >
      {intervalLabel}
    </div>
  );
}

const COLOR_PRESETS = ['#000B1E', '#000000', '#0B0B0B', '#012A4A', '#111723', '#1A1A20'];

function formatHms(ms: number, includeHours: boolean) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600).toString();
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  if (!includeHours) {
    const totalMinutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    return `${totalMinutes}:${seconds}`;
  }
  return `${hours}:${minutes}:${seconds}`;
}

function isLegendBgColor(value: string): boolean {
  return value === 'transparent' || isHexColor(value);
}

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function parseBooleanQuery(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return defaultValue;
}

function getLegendLightsFrameClassName(showDashedFrame: boolean): string {
  const baseClassName = 'rounded-[clamp(14px,4.2vh,2.2rem)] p-[clamp(18px,4.5vw,50px)]';
  if (!showDashedFrame) return baseClassName;
  return `${baseClassName} border-4 border-dashed border-black`;
}
