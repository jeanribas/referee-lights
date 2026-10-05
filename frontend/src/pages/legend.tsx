import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';

import { ConnectionStatus } from '@/components/ConnectionStatus';
import { DecisionLights } from '@/components/DecisionLights';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useRouterReady } from '@/hooks/useRouterReady';
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
  const routerReady = useRouterReady();
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
    setLegendConfig
  } = useRoomSocket('display', socketOptions);

  const [menuOpen, setMenuOpen] = useState(false);
  const toolButton = 'flex h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-white/15 bg-white/10 px-3 text-[13px] font-semibold text-white transition hover:bg-white/20';
  const [bgColor, setBgColor] = useState(DEFAULT_LEGEND_BG);
  const [showPlaceholders, setShowPlaceholders] = useState(true);
  const [showDashedFrame, setShowDashedFrame] = useState(true);
  const [digitMode, setDigitMode] = useState<'mmss' | 'hhmmss'>('hhmmss');
  const [timerColor, setTimerColor] = useState('#FFFFFF');
  const [hydrated, setHydrated] = useState(false);
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
    let nextKeepAwake = storedWake !== 'false';

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
    // No link de compartilhamento, o que veio explícito na URL manda: antes a
    // config da sala chegava pelo socket logo após conectar e sobrescrevia
    // legendBg/legendTimer/legendDigits/..., tornando os parâmetros inúteis.
    const fromUrl = (value: string | undefined) => isShareView && value !== undefined;
    if (!fromUrl(legendBgQuery)) setBgColor(remoteLegendConfig.bgColor);
    if (!fromUrl(legendTimerQuery)) setTimerColor(remoteLegendConfig.timerColor);
    if (!fromUrl(legendDigitsQuery)) setDigitMode(remoteLegendConfig.digitMode);
    if (!fromUrl(legendPlaceholdersQuery)) setShowPlaceholders(remoteLegendConfig.showPlaceholders);
    if (!fromUrl(legendFrameQuery)) setShowDashedFrame(remoteLegendConfig.showDashedFrame);
    setKeepAwake(remoteLegendConfig.keepAwake);
  }, [
    remoteLegendConfig,
    remoteLegendConfigKey,
    isShareView,
    legendBgQuery,
    legendTimerQuery,
    legendDigitsQuery,
    legendPlaceholdersQuery,
    legendFrameQuery
  ]);

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

  // Sempre acordada (sem botão); keepAwake segue na config só por compatibilidade
  const wakeActive = useWakeLock(true);

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

  // Endereço de rede vindo do painel (outro computador/OBS não alcança
  // "localhost"); só aceita uma origem http(s) simples.
  const absoluteShareLink = useMemo(() => {
    if (typeof window === 'undefined') return shareLink;
    const requested = typeof router.query.shareOrigin === 'string' ? router.query.shareOrigin : '';
    const origin = /^https?:\/\/[^/?#\s]+$/.test(requested) ? requested : window.location.origin;
    return `${origin}${shareLink}`;
  }, [shareLink, router.query.shareOrigin]);

  const handleCopyShareLink = useCallback(async () => {
    if (typeof window === 'undefined' || !shareLink) return;
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
  }, [shareLink, absoluteShareLink]);

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
  }, [isShareView, bgColor, showPlaceholders, showDashedFrame, digitMode, timerColor, keepAwake, setLegendConfig]);

  // Há algo na tela diferente do que está salvo na sala?
  const currentConfigKey = [bgColor, timerColor, digitMode, showPlaceholders ? '1' : '0', showDashedFrame ? '1' : '0', keepAwake ? '1' : '0'].join('|');
  const hasUnsaved = currentConfigKey !== remoteLegendConfigKey;

  // Concluir = salvar + mostrar como levar a legenda para o OBS
  const [doneOpen, setDoneOpen] = useState(false);
  const handleDone = () => {
    setMenuOpen(false);
    handleSaveLegendConfig();
    setDoneOpen(true);
  };
  const useThisWindow = () => {
    setDoneOpen(false);
    void router.replace(shareLink);
  };

  // A paleta fecha sozinha (10 s sem uso) ou ao clicar fora, inclusive em outro
  // botão da barra: esquecida aberta, ela apareceria na captura da janela
  const paletteRef = useRef<HTMLElement | null>(null);
  const [paletteTouch, setPaletteTouch] = useState(0);
  useEffect(() => {
    if (!menuOpen) return;
    const id = window.setTimeout(() => setMenuOpen(false), 10_000);
    const onDown = (event: PointerEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    // Como menu suspenso: fecha também com Esc e quando a janela perde o foco
    // (ex.: ao trocar para o OBS), para nunca ficar preso na captura
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    const onBlur = () => setMenuOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [menuOpen, paletteTouch]);
  useEffect(() => {
    if (!doneOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setDoneOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doneOpen]);

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

      {/* Barra de controles encaixada no topo, com altura fixa (nunca cresce):
          luzes e relógio ficam no espaço abaixo e não mudam de lugar ao usar os
          controles; a paleta abre por cima, como menu suspenso. Para capturar
          sem a barra, o OBS usa o link de compartilhamento. */}
      <div data-legend-root className="flex h-screen flex-col overflow-hidden" style={{ backgroundColor: bgColor }}>
        {!isShareView && (
          <div className="relative z-50 shrink-0 border-b border-white/10 bg-slate-950">
            <div className="flex h-14 items-center gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
              <div className="mr-auto flex min-w-0 shrink-0 flex-col leading-tight">
                <h1 className="text-[15px] font-bold uppercase tracking-[0.12em] text-white">{legendMessages.title}</h1>
                <span className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-300">
                  <ConnectionStatus status={status} messages={commonMessages} size="sm" />
                  {statusSuffix}
                  {routerReady && (!roomId || !adminPin) ? <span className="text-amber-200"> · {legendMessages.missingCredentials}</span> : null}
                </span>
              </div>
              <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => setMenuOpen((prev) => !prev)} className={`${toolButton} ${menuOpen ? 'bg-white text-slate-950 hover:bg-white' : ''}`} aria-expanded={menuOpen}>
                {legendMessages.buttons.paletteOpen}
              </button>
              <button type="button" onClick={() => setShowPlaceholders((prev) => !prev)} className={toolButton}>
                {showPlaceholders ? legendMessages.buttons.placeholdersHide : legendMessages.buttons.placeholdersShow}
              </button>
              <button type="button" onClick={() => setShowDashedFrame((prev) => !prev)} className={toolButton}>
                {frameButtonLabel}
              </button>
              <button type="button" onClick={() => setDigitMode((prev) => (prev === 'hhmmss' ? 'mmss' : 'hhmmss'))} className={toolButton}>
                {digitsButtonLabel}
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-emerald-500 px-4 text-[13px] font-bold text-slate-950 transition hover:bg-emerald-400"
                title={hasUnsaved ? legendMessages.done.unsaved : undefined}
              >
                {hasUnsaved && <span className="h-2 w-2 rounded-full bg-slate-950" aria-hidden="true" />}
                {legendMessages.done.button}
                {hasUnsaved && <span className="sr-only"> ({legendMessages.done.unsaved})</span>}
              </button>
            </div>

            {menuOpen && (
              // Paleta suspensa sob a barra, por cima do conteúdo (não empurra nada)
              <section
                ref={paletteRef}
                onPointerDown={() => setPaletteTouch((n) => n + 1)}
                onInput={() => setPaletteTouch((n) => n + 1)}
                className="absolute left-3 top-full mt-2 flex max-w-[calc(100%-1.5rem)] flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/95 p-4 shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-sm"
              >
                <h2 className="text-[13px] font-semibold text-slate-300">{legendMessages.palette.title}</h2>
                <div className="flex flex-wrap items-center gap-2">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBgColor(color)}
                      className={`h-9 w-9 rounded-full border-2 transition ${bgColor === color ? 'border-white' : 'border-white/30'}`}
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
                    className={`${toolButton} ${bgColor === 'transparent' ? 'border-white bg-white/20' : ''}`}
                  >
                    {legendMessages.palette.transparentBackground}
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-slate-300">
                  <label className="flex items-center gap-2">
                    <span>{legendMessages.palette.customColor}</span>
                    <input
                      type="color"
                      value={bgPickerValue}
                      onChange={(event) => setBgColor(event.target.value)}
                      className="h-8 w-14 cursor-pointer rounded border border-white/30 bg-transparent"
                    />
                    <span className="tabular-nums text-slate-400">{bgColor === 'transparent' ? legendMessages.palette.transparentBackground : bgColor.toUpperCase()}</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span>{legendMessages.palette.timerColor}</span>
                    <input
                      type="color"
                      value={timerColor}
                      onChange={(event) => setTimerColor(event.target.value)}
                      className="h-8 w-14 cursor-pointer rounded border border-white/30 bg-transparent"
                    />
                    <span className="tabular-nums text-slate-400">{timerColor.toUpperCase()}</span>
                  </label>
                </div>
                {!wakeActive && (
                  <span className="text-[13px] text-amber-300">{legendMessages.wakeWarning}</span>
                )}
              </section>
            )}
          </div>
        )}

        <main className="flex min-h-0 flex-1 flex-col gap-[clamp(12px,3vh,32px)] px-[clamp(12px,3vw,30px)] py-[clamp(10px,2.6vh,30px)] text-slate-100">
        <section className="flex flex-1 items-center justify-center">
          <div className="flex w-full max-w-[1700px] flex-col items-center justify-center gap-[clamp(12px,5vh,80px)]">
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
        {/* No fluxo (não fixo): em telas baixas o rodapé ficava por cima do timer */}
        <div data-legend-footer className="flex justify-center opacity-60 transition hover:opacity-100">
          <FooterBadges />
        </div>
        </main>
      </div>

      {doneOpen && (
        // Confirmação ao concluir: interrompe de propósito, para a pessoa sair
        // daqui sabendo como levar a legenda para o OBS sem sobrar controle
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="legend-done-title">
          <div className="flex w-full max-w-lg flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900 p-5 text-slate-100 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
            <div>
              <h2 id="legend-done-title" className="text-[15px] font-bold uppercase tracking-[0.12em] text-white">{legendMessages.done.title}</h2>
              <p className="mt-1 text-[13px] text-emerald-300">{legendMessages.done.saved}</p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-slate-300">{legendMessages.done.obsLabel}</span>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={absoluteShareLink}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 text-[13px] text-slate-200 outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyShareLink()}
                  className="h-11 shrink-0 rounded-lg bg-emerald-500 px-4 text-[15px] font-semibold text-slate-950 transition hover:bg-emerald-400"
                >
                  {copiedShareLink ? legendMessages.share.copied : legendMessages.share.copy}
                </button>
              </div>
              <span className="text-[13px] text-slate-400">{legendMessages.done.obsHint}</span>
            </div>

            <div className="flex flex-col gap-1 border-t border-white/10 pt-4">
              <button
                type="button"
                onClick={useThisWindow}
                className="h-11 rounded-lg border border-slate-600 bg-slate-800 px-4 text-[15px] font-semibold text-white transition hover:bg-slate-700"
              >
                {legendMessages.done.useWindow}
              </button>
              <span className="text-[13px] text-slate-400">{legendMessages.done.useWindowHint}</span>
            </div>

            <button
              type="button"
              onClick={() => setDoneOpen(false)}
              className="h-10 self-end rounded-lg px-3 text-[15px] font-semibold text-slate-300 transition hover:bg-white/10"
              autoFocus
            >
              {legendMessages.done.back}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function LegendIntervalCard({ intervalLabel, color }: { intervalLabel: string; color: string }) {
  return (
    <div
      data-legend-timer
      className="font-display text-[clamp(3rem,min(14vw,15vh),9rem)] font-black leading-none tracking-tight"
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
  // Borda sempre presente (transparente quando oculta): esconder a linha não
  // pode mudar o tamanho do quadro nem mover o relógio no recorte do OBS
  const baseClassName = 'rounded-[clamp(14px,4.2vh,2.2rem)] p-[clamp(18px,4.5vw,50px)] border-4 border-dashed';
  return `${baseClassName} ${showDashedFrame ? 'border-black' : 'border-transparent'}`;
}
