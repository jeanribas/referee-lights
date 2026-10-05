import { useEffect, useState } from 'react';

import TimerDisplay from '@/components/TimerDisplay';
import type { Messages } from '@/lib/i18n/messages';

/**
 * Cartões de Timer e Intervalo, os mesmos na tela do cronometrista e na coluna
 * do admin. Uma escala só: títulos e botões 15 px, unidades 13 px e relógios
 * dimensionados pela largura do cartão (servem na tela cheia e na coluna
 * estreita do admin) e pela altura da janela (a tela do celular nunca rola).
 */

// Exportados para os outros cartões da coluna do admin (Key Relay) seguirem a mesma escala
export const controlButton = 'flex h-12 min-w-0 items-center justify-center rounded-xl px-2 text-[15px] font-semibold leading-tight text-center transition active:scale-[0.98]';
const button = controlButton;
export const cardTitle = 'text-[15px] font-bold uppercase tracking-[0.12em] text-slate-200';
const defaultCard = 'rounded-2xl border border-slate-800 bg-slate-900 p-4';

type AdminMessages = Messages['admin'];
type ShortLabels = Messages['referee']['center'];

/**
 * Campo numérico com a unidade dentro da caixa ("10 min"): sem rótulo solto
 * em cima, mesma altura dos botões. O nome completo vai para leitor de tela.
 */
function UnitField(props: { label: string; unit: string; value: number; step?: number; onChange: (value: number) => void }) {
  const { label, unit, value, step, onChange } = props;
  return (
    <label className="flex h-12 min-w-0 cursor-text items-center justify-center gap-1 rounded-xl border border-slate-700 bg-slate-950 px-2 transition focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-400/30">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-0 bg-transparent text-right text-xl font-semibold tabular-nums text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span className="shrink-0 text-[13px] font-medium text-slate-400">{unit}</span>
    </label>
  );
}

export function TimerCard(props: {
  messages: AdminMessages['timer'];
  remainingMs: number;
  running: boolean;
  minutes: number;
  onMinutesChange: (value: number) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onSet: () => void;
  /** Contagens de 60 s após cada decisão (só a tela do cronometrista mostra) */
  badges?: Array<{ id: number; value: number; gradient: string }>;
  className?: string;
}) {
  const { messages: t, badges = [] } = props;
  return (
    <section className={`flex min-w-0 flex-col gap-3 [container-type:inline-size] ${props.className ?? defaultCard}`} aria-label={t.title}>
      <div className="flex h-8 shrink-0 items-center justify-between gap-3">
        <h2 className={cardTitle}>{t.title}</h2>
        <div className="flex items-center gap-1.5">
          {badges.map((b) => (
            <span
              key={b.id}
              className="inline-flex h-8 w-10 -skew-x-12 items-center justify-center rounded-md text-[15px] font-black text-slate-900"
              style={{ backgroundImage: b.gradient }}
            >
              <span className="skew-x-12 leading-none tabular-nums">{b.value}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tamanho pela largura do cartão e pela altura da janela: sempre cabe, sem sobra em volta */}
      <div className="flex justify-center py-1 leading-none">
        <div className="text-[clamp(3rem,min(30cqw,14dvh),9rem)] landscape:text-[clamp(3rem,min(30cqw,26dvh),9rem)]">
          <TimerDisplay remainingMs={props.remainingMs} running={props.running} variant="panel" large />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button className={`${button} bg-emerald-500 text-slate-950 hover:bg-emerald-400`} onClick={props.onStart}>
          {t.start}
        </button>
        <button className={`${button} bg-amber-400 text-slate-950 hover:bg-amber-300`} onClick={props.onStop}>
          {t.stop}
        </button>
        <button className={`${button} bg-slate-700 text-white hover:bg-slate-600`} onClick={props.onReset}>
          {t.resetDefault}
        </button>
      </div>

      {/* Mesmas colunas dos botões de cima */}
      <div className="grid grid-cols-3 gap-2">
        <UnitField label={t.minutesLabel} unit="min" step={0.5} value={props.minutes} onChange={props.onMinutesChange} />
        <button className={`${button} col-span-2 border border-slate-600 bg-slate-800 text-white hover:bg-slate-700`} onClick={props.onSet}>
          {t.set}
        </button>
      </div>
    </section>
  );
}

export function IntervalCard(props: {
  messages: AdminMessages['interval'];
  shortLabels: ShortLabels;
  /** Restante já formatado (hh:mm:ss) */
  display: string;
  hours: number;
  minutes: number;
  seconds: number;
  onHoursChange: (value: number) => void;
  onMinutesChange: (value: number) => void;
  onSecondsChange: (value: number) => void;
  onSet: () => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  className?: string;
}) {
  const { messages: t, shortLabels } = props;
  // Iniciar e Resetar pedem um segundo toque (mudam o display na hora); sem
  // confirmação em 5 s, a linha volta ao normal
  const [pending, setPending] = useState<'start' | 'reset' | null>(null);
  useEffect(() => {
    if (!pending) return;
    const id = window.setTimeout(() => setPending(null), 5000);
    return () => window.clearTimeout(id);
  }, [pending]);
  const confirm = () => {
    if (pending === 'start') props.onStart();
    if (pending === 'reset') props.onReset();
    setPending(null);
  };

  return (
    <section className={`flex min-w-0 flex-col gap-3 [container-type:inline-size] ${props.className ?? defaultCard}`} aria-label={t.title}>
      <div className="flex h-8 shrink-0 items-center">
        <h2 className={cardTitle}>{t.title}</h2>
      </div>

      {/* Um relógio só: "Definir" e "Resetar" já deixam o restante igual ao configurado */}
      <div className="flex justify-center py-1 leading-none">
        <span
          className="font-display text-[clamp(2rem,min(17cqw,8dvh),5rem)] landscape:text-[clamp(2rem,min(17cqw,18dvh),5rem)] font-bold leading-none tabular-nums tracking-tight text-slate-50"
          aria-label={t.remaining}
        >
          {props.display}
        </span>
      </div>

      {/* h/m/s + Definir numa linha; em cartão estreito (coluna do admin) o Definir desce */}
      <div className="flex flex-wrap gap-2">
        <div className="grid min-w-0 flex-[3_1_13rem] grid-cols-3 gap-2">
          <UnitField label={t.hours} unit="h" value={props.hours} onChange={props.onHoursChange} />
          <UnitField label={t.minutes} unit="m" value={props.minutes} onChange={props.onMinutesChange} />
          <UnitField label={t.seconds} unit="s" value={props.seconds} onChange={props.onSecondsChange} />
        </div>
        <button className={`${button} flex-[1_1_5rem] border border-slate-600 bg-slate-800 px-4 text-white hover:bg-slate-700`} onClick={props.onSet}>
          {t.set}
        </button>
      </div>

      {pending ? (
        // Mesma altura da linha normal: confirmar não faz a tela pular
        <div className="grid grid-cols-[1fr_2fr] gap-2" role="group">
          <button className={`${button} border border-slate-600 bg-slate-800 text-white hover:bg-slate-700`} onClick={() => setPending(null)}>
            {t.cancel}
          </button>
          <button
            className={`${button} ${pending === 'start' ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400' : 'bg-red-500 text-white hover:bg-red-400'}`}
            onClick={confirm}
            autoFocus
          >
            {pending === 'start' ? t.confirmStart : t.confirmReset}
          </button>
        </div>
      ) : (
        // Rótulos curtos (o cartão já diz "Intervalo"); o nome completo vai para leitor de tela
        <div className="grid grid-cols-3 gap-2">
          <button className={`${button} bg-emerald-500 text-slate-950 hover:bg-emerald-400`} aria-label={t.start} onClick={() => setPending('start')}>
            {shortLabels.start}
          </button>
          <button className={`${button} bg-amber-400 text-slate-950 hover:bg-amber-300`} aria-label={t.pause} onClick={props.onPause}>
            {shortLabels.pause}
          </button>
          <button className={`${button} bg-slate-700 text-white hover:bg-slate-600`} aria-label={t.reset} onClick={() => setPending('reset')}>
            {shortLabels.reset}
          </button>
        </div>
      )}

      <p className="text-[13px] leading-snug text-slate-400 [@media(max-height:760px)]:hidden">
        {t.note}
      </p>
    </section>
  );
}
