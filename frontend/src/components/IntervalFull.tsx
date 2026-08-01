import clsx from 'clsx';
import { MutableRefObject, useEffect, useRef } from 'react';

const WARNING_OFFSET_MS = 3 * 60 * 1000;
const FINAL_BEEP_SECONDS = 10;
const PRIMARY_FINAL_BEEP_SECONDS = 10;

interface IntervalFullProps {
  intervalMs: number;
  configuredMs: number;
  running: boolean;
  labels: {
    primaryLabel: string;
    secondaryLabel: string;
    endMessage: string;
  };
}

export function IntervalFull({ intervalMs, configuredMs, running, labels }: IntervalFullProps) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const finishedRef = useRef(false);
  const primaryFinishedRef = useRef(false);
  const countdownBeepedSeconds = useRef<Set<number>>(new Set());
  const primaryBeepedSeconds = useRef<Set<number>>(new Set());
  const previousSwapOffsetRef = useRef<number | null>(null);
  const timeToSwap = intervalMs - WARNING_OFFSET_MS;

  useEffect(() => {
    const previousOffset = previousSwapOffsetRef.current ?? Number.POSITIVE_INFINITY;
    previousSwapOffsetRef.current = timeToSwap;

    if (running && configuredMs > 0 && previousOffset > 0 && timeToSwap <= 0) {
      if (!finishedRef.current) {
        playIntervalEndTone(audioCtxRef);
        finishedRef.current = true;
      }
    } else if (timeToSwap > 0) {
      finishedRef.current = false;
    }
  }, [intervalMs, running, configuredMs, timeToSwap]);

  useEffect(() => {
    if (!running) {
      countdownBeepedSeconds.current.clear();
      return;
    }

    if (timeToSwap <= 0) {
      countdownBeepedSeconds.current.clear();
      return;
    }

    if (timeToSwap > FINAL_BEEP_SECONDS * 1000) {
      countdownBeepedSeconds.current.clear();
      return;
    }

    const currentSecond = Math.ceil(timeToSwap / 1000);
    if (currentSecond <= 0) {
      countdownBeepedSeconds.current.clear();
      return;
    }

    if (countdownBeepedSeconds.current.has(currentSecond)) return;
    countdownBeepedSeconds.current.add(currentSecond);
    playCountdownBeep(audioCtxRef);
  }, [intervalMs, running, timeToSwap]);

  useEffect(() => {
    if (!running) {
      primaryBeepedSeconds.current.clear();
      primaryFinishedRef.current = false;
      return;
    }

    if (intervalMs > PRIMARY_FINAL_BEEP_SECONDS * 1000) {
      primaryBeepedSeconds.current.clear();
      primaryFinishedRef.current = false;
      return;
    }

    const currentSecond = Math.ceil(intervalMs / 1000);
    if (currentSecond <= 0) {
      primaryBeepedSeconds.current.clear();
      return;
    }

    if (currentSecond === 1) {
      primaryBeepedSeconds.current.clear();
      if (!primaryFinishedRef.current) {
        playPrimaryFinalSignal(audioCtxRef);
        primaryFinishedRef.current = true;
      }
      return;
    }

    primaryFinishedRef.current = false;

    if (primaryBeepedSeconds.current.has(currentSecond)) return;
    primaryBeepedSeconds.current.add(currentSecond);
    playCountdownBeep(audioCtxRef);
  }, [intervalMs, running]);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
    };
  }, []);

  if (configuredMs <= 0) return null;

  const primary = formatHms(Math.max(0, intervalMs));
  const secondaryMs = Math.max(0, intervalMs - WARNING_OFFSET_MS);
  const showEndMessage = timeToSwap <= -1000;
  const secondary = showEndMessage ? labels.endMessage : formatHms(secondaryMs);
  const secondaryActive = secondaryMs > 0 && running && !showEndMessage;

  return (
    <div className="mx-auto flex w-full max-w-[min(92vw,1200px)] flex-col items-center gap-[5vh] text-white py-[3vh]">
      <div className="relative flex flex-col items-center gap-8 rounded-[48px] border border-white/10 bg-black/70 px-12 py-10 shadow-[0_22px_70px_rgba(0,0,0,0.6)]">
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 -skew-x-12 rounded-md bg-white px-7 py-2 text-[clamp(0.6rem,0.9vw,2rem)] font-black uppercase tracking-[0.45em] text-slate-900">
          <span className="block skew-x-12 whitespace-nowrap">{labels.primaryLabel}</span>
        </span>
        <span
          className={clsx(
            'font-display text-[clamp(4rem,16vw,23rem)] font-black leading-none tracking-tight [font-variant-numeric:tabular-nums] transition-opacity duration-500',
            running && intervalMs > 0 ? 'opacity-100' : 'opacity-70'
          )}
        >
          {primary}
        </span>
      </div>

      <div className="relative flex flex-col items-center gap-8 rounded-[48px] border border-white/10 bg-black/70 px-12 py-10 shadow-[0_22px_70px_rgba(0,0,0,0.6)]">
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 -skew-x-12 rounded-md bg-white px-7 py-2 text-[clamp(0.6rem,0.9vw,2rem)] font-black uppercase tracking-[.45em] text-slate-900">
          <span className="block skew-x-12 whitespace-nowrap">{labels.secondaryLabel}</span>
        </span>
        <span
          className={clsx(
            showEndMessage
              ? 'font-display text-[clamp(2.4rem,7vw,4.2rem)] font-black uppercase tracking-[.28em] text-[#ff1f1f] text-center whitespace-nowrap'
              : 'font-display text-[clamp(3.2rem,14vw,15rem)] font-black leading-none tracking-tight [font-variant-numeric:tabular-nums] text-[#ff1f1f]',
            'transition-opacity duration-500',
            showEndMessage ? 'opacity-100' : secondaryActive ? 'opacity-100' : 'opacity-70'
          )}
        >
          {secondary}
        </span>
      </div>
    </div>
  );
}

function formatHms(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600).toString();
  const minutes = Math.floor((totalSeconds % 3600) / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function playIntervalEndTone(audioCtxRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') return;

  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContextClass();
  }

  const ctx = audioCtxRef.current;
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }

  const oscillator = ctx.createOscillator();
  oscillator.type = 'sawtooth';
  oscillator.frequency.value = 640;

  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.55, now + 0.03);
  gain.gain.setValueAtTime(0.55, now + 1);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);

  oscillator.start(now);
  oscillator.stop(now + 1.7);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playCountdownBeep(audioCtxRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') return;

  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContextClass();
  }

  const ctx = audioCtxRef.current;
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }

  const oscillator = ctx.createOscillator();
  oscillator.type = 'square';
  oscillator.frequency.value = 900;

  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

  oscillator.start(now);
  oscillator.stop(now + 0.23);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playPrimaryFinalSignal(audioCtxRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') return;

  const AudioContextClass =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioCtxRef.current) {
    audioCtxRef.current = new AudioContextClass();
  }

  const ctx = audioCtxRef.current;
  if (!ctx) return;

  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }

  const start = ctx.currentTime;

  for (let i = 0; i < 3; i += 1) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 950;

    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const tStart = start + i * 0.3;
    gain.gain.setValueAtTime(0, tStart);
    gain.gain.linearRampToValueAtTime(0.45, tStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, tStart + 0.22);

    osc.start(tStart);
    osc.stop(tStart + 0.24);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}

export default IntervalFull;
