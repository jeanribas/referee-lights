import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { Seo } from '@/components/Seo';
import { FooterBadges } from '@/components/FooterBadges';
import TimerDisplay, { useCooldownBadges } from '@/components/TimerDisplay';
import { BrandLogo } from '@/components/BrandLogo';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { getMessages, type Messages } from '@/lib/i18n/messages';

// Cabe na janela sem rolagem medindo o conteúdo de verdade, mas encolhe no
// máximo até 85%: abaixo disso o texto fica ilegível a um braço de distância,
// então a tela rola em vez de encolher mais.
const MIN_FIT_SCALE = 0.85;
function useFitScale(el: HTMLElement | null) {
  const [fit, setFit] = useState({ scale: 1, height: 0 });
  useEffect(() => {
    if (!el) return;
    const update = () => {
      const height = el.offsetHeight; // offsetHeight ignora o transform
      const s = Math.min(1, (window.innerHeight - 32) / height);
      setFit({ scale: Number.isFinite(s) && s > 0 ? Math.max(MIN_FIT_SCALE, s) : 1, height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [el]);
  return fit;
}

/**
 * Campo numérico com o nome DENTRO da caixa, centralizado sobre o número:
 * sem linha de rótulo solta (que desalinhava em cartões estreitos) e na
 * mesma altura dos botões ao lado.
 */
function NumberField(props: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  className?: string;
}) {
  const { label, value, onChange, step, className = '' } = props;
  return (
    <label
      className={`flex min-h-[60px] min-w-0 cursor-text flex-col items-center justify-center gap-0.5 rounded-lg border border-slate-700 bg-slate-950 px-1 transition focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/40 ${className}`}
    >
      <span className="text-[13px] font-semibold uppercase leading-none tracking-[0.04em] text-slate-400">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-0 bg-transparent text-center text-2xl font-semibold leading-tight tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
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
  // Lido a um braço de distância (e sem óculos): botões 15 px, rótulos 13 px
  const buttonText = isSpanishLocale ? 'text-[14px] tracking-[0.02em]' : 'text-[15px] tracking-[0.04em]';
  const button = `flex min-h-[56px] items-center justify-center rounded-xl px-3 py-2 ${buttonText} font-bold uppercase leading-tight text-center transition active:scale-[0.98]`;
  // Botão do estado atual (rodando/parado) fica marcado, como no árbitro central
  const activeRing = 'ring-4 ring-white/40 ring-offset-2 ring-offset-slate-900';
  const secondaryButton = `${button} border border-slate-600 bg-slate-800 text-white hover:bg-slate-700`;

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

  const [fitEl, setFitEl] = useState<HTMLDivElement | null>(null);
  const fit = useFitScale(fitEl);
  const fitStyle: CSSProperties | undefined = fit.scale < 1 ? {
    transform: `scale(${fit.scale})`,
    transformOrigin: 'top center',
    // o transform não muda o layout: devolve a altura que sobra embaixo
    marginBottom: -fit.height * (1 - fit.scale),
  } : undefined;

  if (!roomId || !adminPin) {
    return <MissingTimerCredentials messages={displayMessages} />;
  }

  const timerRunning = state?.running ?? false;
  const intervalRunning = state?.intervalRunning ?? false;
  const intervalVisible = state?.intervalVisible ?? false;
  const refereeShort = messages.referee.center;

  return (
    <>
      <Seo
        title="Referee Lights · Timer"
        description="Controle do cronômetro da plataforma Referee Lights."
        canonicalPath="/timer"
        noIndex
      />
      <div className="h-screen w-screen overflow-y-auto overflow-x-hidden bg-slate-950">
      {/* "safe center": se o conteúdo for mais alto que a tela, alinha pelo topo em vez de cortar */}
      <main className="flex min-h-screen flex-col items-center bg-slate-950 px-4 py-4 text-slate-100 [justify-content:safe_center]">
        <div ref={setFitEl} className="flex w-full max-w-4xl flex-col gap-3" style={fitStyle}>
          <header className="flex items-center justify-between gap-4">
            <BrandLogo size={40} />
            <span className="rounded-lg bg-white/10 px-3 py-1.5 text-base font-bold uppercase tracking-[0.18em] text-white">
              {commonMessages.labels.room}: {roomId}
            </span>
          </header>

          <div className="grid gap-3 md:grid-cols-2">
            {/* Cronômetro da tentativa */}
            <section className="flex min-w-0 flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl">
              {/* Título e contagens de 60 s na mesma linha: altura fixa, nada pula de lugar */}
              <div className="flex min-h-[40px] items-center justify-between gap-3">
                <h2 className="text-base font-bold uppercase tracking-[0.18em] text-white">{adminMessages.timer.title}</h2>
                <div className="flex items-center gap-1.5">
                  {cooldownBadges.map((b) => (
                    <span
                      key={b.id}
                      className="inline-flex h-9 w-11 -skew-x-12 items-center justify-center rounded-md text-lg font-black text-slate-900"
                      style={{ backgroundImage: b.gradient }}
                    >
                      <span className="skew-x-12 leading-none tabular-nums">{b.value}</span>
                    </span>
                  ))}
                </div>
              </div>

              <TimerDisplay remainingMs={state?.timerMs ?? 60_000} running={timerRunning} variant="panel" large />

              <div className="grid grid-cols-3 gap-2">
                <button
                  className={`${button} bg-emerald-500 text-slate-950 hover:bg-emerald-400 ${timerRunning ? activeRing : ''}`}
                  aria-pressed={timerRunning}
                  onClick={timerStart}
                >
                  {adminMessages.timer.start}
                </button>
                <button
                  className={`${button} bg-amber-400 text-slate-950 hover:bg-amber-300`}
                  onClick={timerStop}
                >
                  {adminMessages.timer.stop}
                </button>
                <button className={`${button} bg-slate-700 text-white hover:bg-slate-600`} onClick={timerReset}>
                  {adminMessages.timer.resetDefault}
                </button>
              </div>

              <div className="flex gap-2">
                <NumberField
                  label={adminMessages.timer.minutesLabel}
                  value={customMinutes}
                  onChange={setCustomMinutes}
                  step={0.5}
                  className="w-32 shrink-0"
                />
                <button className={`${secondaryButton} flex-1`} onClick={handleSetMinutes}>
                  {adminMessages.timer.set}
                </button>
              </div>
            </section>

            {/* Intervalo entre rodadas */}
            <section className="flex min-w-0 flex-col gap-3 rounded-3xl border border-slate-800 bg-slate-900/80 p-4 shadow-2xl">
              <div className="flex min-h-[40px] items-center">
                <h2 className="text-base font-bold uppercase tracking-[0.18em] text-white">{adminMessages.interval.title}</h2>
              </div>

              {/* Restante em destaque (é um segundo relógio); configurado como referência */}
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400">{adminMessages.interval.remaining}</span>
                  <span className="font-display text-[2.75rem] font-bold leading-none tabular-nums text-white">{intervalDisplay}</span>
                </div>
                <div className="flex shrink-0 flex-col items-start">
                  <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-400">{adminMessages.interval.configured}</span>
                  <span className="text-lg font-semibold tabular-nums text-slate-300">{intervalConfiguredDisplay}</span>
                </div>
              </div>

              {/* H/M/S + Definir: numa linha quando cabe; o Definir desce sozinho quando o cartão é estreito */}
              <div className="flex flex-wrap gap-2">
                <div className="grid min-w-0 flex-[3_1_15rem] grid-cols-3 gap-2">
                  <NumberField label={adminMessages.interval.hours} value={intervalHours} onChange={setIntervalHours} />
                  <NumberField label={adminMessages.interval.minutes} value={intervalMinutes} onChange={setIntervalMinutes} />
                  <NumberField label={adminMessages.interval.seconds} value={intervalSeconds} onChange={setIntervalSeconds} />
                </div>
                <button className={`${secondaryButton} flex-[1_1_6rem]`} onClick={handleIntervalSet}>
                  {adminMessages.interval.set}
                </button>
              </div>

              {/* Rótulos curtos (o cartão já diz "intervalo"); o nome completo fica para leitor de tela */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  className={`${button} bg-emerald-500 text-slate-950 hover:bg-emerald-400 ${intervalRunning ? activeRing : ''}`}
                  aria-label={adminMessages.interval.start}
                  aria-pressed={intervalRunning}
                  onClick={intervalStart}
                >
                  {refereeShort.start}
                </button>
                <button
                  className={`${button} bg-amber-400 text-slate-950 hover:bg-amber-300`}
                  aria-label={adminMessages.interval.pause}
                  onClick={intervalStop}
                >
                  {refereeShort.pause}
                </button>
                <button
                  className={`${button} bg-slate-700 text-white hover:bg-slate-600`}
                  aria-label={adminMessages.interval.reset}
                  onClick={intervalReset}
                >
                  {refereeShort.reset}
                </button>
              </div>

              {/* O que o display mostra: escolha entre duas opções, com a atual marcada */}
              <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-700 bg-slate-950 p-1" role="group">
                <button
                  className={`${button} min-h-[52px] ${intervalVisible ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                  aria-pressed={intervalVisible}
                  onClick={intervalShow}
                >
                  {adminMessages.interval.showInterval}
                </button>
                <button
                  className={`${button} min-h-[52px] ${!intervalVisible ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-slate-800'}`}
                  aria-pressed={!intervalVisible}
                  onClick={intervalHide}
                >
                  {adminMessages.interval.showLights}
                </button>
              </div>

              {/* Informativo: some em telas baixas para os controles caberem sem encolher */}
              <p className="text-[13px] leading-relaxed text-slate-400 [@media(max-height:900px)]:hidden">
                {adminMessages.interval.note}
              </p>
            </section>
          </div>

          <div className="opacity-60 [@media(max-height:900px)]:hidden">
            <FooterBadges />
          </div>
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
