import { MutableRefObject, ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { Phase } from '@/types/state';

const LIFTER_COOLDOWN_SECONDS = 60;
const COOLDOWN_TICK_MS = 250;
const LIGHTS_REVEAL_DELAY_MS = 1500;

interface TimerDisplayProps {
  remainingMs: number;
  running: boolean;
  variant?: 'display' | 'panel';
  hidden?: boolean;
  phase?: Phase;
  attemptNo?: number;
}

interface CooldownEntry {
  id: number;
  startedAt: number;
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function getCooldownGradient(seconds: number) {
  const clamped = Math.max(0, Math.min(LIFTER_COOLDOWN_SECONDS, seconds));
  const hue = Math.round((clamped / LIFTER_COOLDOWN_SECONDS) * 120);
  const start = `hsl(${hue}, 80%, 60%)`;
  const end = `hsl(${hue}, 80%, 45%)`;
  return `linear-gradient(135deg, ${start}, ${end})`;
}

export function useCooldownBadges(phase?: Phase) {
  const [cooldownEntries, setCooldownEntries] = useState<CooldownEntry[]>([]);
  const cooldownEntriesRef = useRef<CooldownEntry[]>([]);
  const pendingRevealTimeoutsRef = useRef<number[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const cooldownIdRef = useRef(0);
  const previousPhaseRef = useRef<Phase | undefined>(phase);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (cooldownEntriesRef.current.length === 0) return;
      const current = Date.now();
      setNow(current);
      setCooldownEntries((entries) => {
        const filtered = entries.filter((e) => current - e.startedAt < LIFTER_COOLDOWN_SECONDS * 1000);
        if (filtered.length === entries.length) {
          cooldownEntriesRef.current = entries;
          return entries;
        }
        cooldownEntriesRef.current = filtered;
        return filtered;
      });
    }, COOLDOWN_TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const prev = previousPhaseRef.current;
    previousPhaseRef.current = phase;
    if (phase === 'revealed' && prev !== 'revealed') {
      const timeoutId = window.setTimeout(() => {
        const startedAt = Date.now();
        setCooldownEntries((entries) => {
          const updated = [...entries, { id: cooldownIdRef.current++, startedAt }];
          cooldownEntriesRef.current = updated;
          return updated;
        });
        pendingRevealTimeoutsRef.current = pendingRevealTimeoutsRef.current.filter((id) => id !== timeoutId);
      }, LIGHTS_REVEAL_DELAY_MS);
      pendingRevealTimeoutsRef.current.push(timeoutId);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      pendingRevealTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      pendingRevealTimeoutsRef.current = [];
    };
  }, []);

  return useMemo(() => {
    const current = now;
    return cooldownEntries
      .map((entry) => {
        const elapsedSeconds = (current - entry.startedAt) / 1000;
        const remaining = Math.max(0, LIFTER_COOLDOWN_SECONDS - elapsedSeconds);
        return { id: entry.id, value: Math.ceil(remaining), gradient: getCooldownGradient(remaining) };
      })
      .filter((e) => e.value > 0);
  }, [cooldownEntries, now]);
}

export function TimerDisplay(props: TimerDisplayProps) {
  const { remainingMs, running, variant = 'panel', hidden = false, phase, attemptNo } = props;

  const [cooldownEntries, setCooldownEntries] = useState<CooldownEntry[]>([]);
  const cooldownEntriesRef = useRef<CooldownEntry[]>([]);
  const pendingRevealTimeoutsRef = useRef<number[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const cooldownIdRef = useRef(0);
  const previousPhaseRef = useRef<Phase | undefined>(phase);
  const beepedSecondsRef = useRef<Set<number>>(new Set());
  const finalBeepPlayedRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (variant !== 'display') return undefined;

    const interval = window.setInterval(() => {
      if (cooldownEntriesRef.current.length === 0) {
        return;
      }

      const current = Date.now();
      setNow(current);
      setCooldownEntries((entries) => {
        const filtered = entries.filter((entry) => current - entry.startedAt < LIFTER_COOLDOWN_SECONDS * 1000);
        if (filtered.length === entries.length) {
          cooldownEntriesRef.current = entries;
          return entries;
        }
        cooldownEntriesRef.current = filtered;
        return filtered;
      });
    }, COOLDOWN_TICK_MS);

    return () => window.clearInterval(interval);
  }, [variant]);

  useEffect(() => {
    if (variant !== 'display') return;

    const prev = previousPhaseRef.current;
    previousPhaseRef.current = phase;

    if (phase === 'revealed' && prev !== 'revealed') {
      const timeoutId = window.setTimeout(() => {
        const startedAt = Date.now();
        setCooldownEntries((entries) => {
          const updated = [...entries, { id: cooldownIdRef.current++, startedAt }];
          cooldownEntriesRef.current = updated;
          return updated;
        });
        pendingRevealTimeoutsRef.current = pendingRevealTimeoutsRef.current.filter((id) => id !== timeoutId);
      }, LIGHTS_REVEAL_DELAY_MS);

      pendingRevealTimeoutsRef.current.push(timeoutId);
    }
  }, [phase, variant]);

  useEffect(() => {
    return () => {
      pendingRevealTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      pendingRevealTimeoutsRef.current = [];
    };
  }, []);

  const cooldownBadges = useMemo(() => {
    if (variant !== 'display') return [];

    const current = now;
    return cooldownEntries
      .map((entry) => {
        const elapsedSeconds = (current - entry.startedAt) / 1000;
        const remaining = Math.max(0, LIFTER_COOLDOWN_SECONDS - elapsedSeconds);
        return {
          id: entry.id,
          value: Math.ceil(remaining),
          gradient: getCooldownGradient(remaining)
        };
      })
      .filter((entry) => entry.value > 0);
  }, [cooldownEntries, now, variant]);

  const timerText = formatTime(remainingMs);
  const urgency = remainingMs <= 10_000;
  const isZero = remainingMs <= 0;
  const urgencyColor = isZero ? 'text-[#ff1f1f]' : urgency ? 'text-[#ff4d4f]' : 'text-white';

  useEffect(() => {
    const beepedSeconds = beepedSecondsRef.current;

    if (variant !== 'display' || hidden) {
      beepedSeconds.clear();
      finalBeepPlayedRef.current = false;
      return;
    }

    if (remainingMs > 10_000) {
      beepedSeconds.clear();
      finalBeepPlayedRef.current = false;
      return;
    }

    if (remainingMs <= 0) {
      if (!finalBeepPlayedRef.current) {
        finalBeepPlayedRef.current = true;
        beepedSeconds.clear();
        playLongBeep(audioCtxRef);
      }
      return;
    }

    finalBeepPlayedRef.current = false;

    const currentSecond = Math.ceil(remainingMs / 1000);
    if (beepedSeconds.has(currentSecond)) return;

    beepedSeconds.add(currentSecond);
    playShortBeep(audioCtxRef);
  }, [remainingMs, variant, hidden]);

  useEffect(() => {
    const beepedSeconds = beepedSecondsRef.current;
    return () => {
      beepedSeconds.clear();
      finalBeepPlayedRef.current = false;
      const audioCtx = audioCtxRef.current;
      if (audioCtx) {
        audioCtx.close().catch(() => undefined);
        audioCtxRef.current = null;
      }
    };
  }, []);

  if (hidden) return null;

  if (variant === 'display') {
    const displayScaleStyle = {
      transform: 'scale(1.15)',
      transformOrigin: 'center'
    } as const;

    return (
      <div
        className="mx-auto grid w-full max-w-[min(88vw,1300px)] grid-cols-[max-content_auto_max-content] items-end gap-14"
        style={displayScaleStyle}
      >
        <AttemptColumn badges={cooldownBadges} ghost attemptNo={attemptNo} />
        <div className="flex flex-col items-center gap-6">
          <div
            className={`font-display font-black leading-none tracking-tight [font-variant-numeric:tabular-nums] ${urgencyColor}`}
            style={{ fontSize: 'clamp(6rem, 24vw, 20rem)' }}
          >
            {timerText}
          </div>
          <div className="self-end">
            <LifterPlate />
          </div>
        </div>
        <AttemptColumn badges={cooldownBadges} attemptNo={attemptNo} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <span className="text-xs uppercase tracking-[0.4em] text-slate-400">Timer</span>
      <div
        className={`rounded-3xl border border-slate-700 bg-slate-900/80 px-12 py-6 text-6xl font-bold font-display tracking-widest shadow-inner transition-colors ${
          isZero ? 'text-[#ff1f1f]' : urgency ? 'text-[#ff4d4f]' : 'text-slate-50'
        } ${running ? 'animate-pulse' : ''}`}
      >
        {timerText}
      </div>
    </div>
  );
}

export default TimerDisplay;

function CooldownBadge({ value, gradient, size = 'md' }: { value: number; gradient: string; size?: 'sm' | 'md' }) {
  const height = size === 'sm' ? 'h-[2.6rem]' : 'h-16';
  const width = size === 'sm' ? 'w-12' : 'w-18';
  const text = size === 'sm' ? 'text-base' : 'text-4xl';

  return (
    <span
      className={`inline-flex -skew-x-12 items-center justify-center rounded-md ${height} ${width} ${text} font-black text-slate-900 shadow-[0_6px_0_rgba(0,0,0,0.3)]`}
      style={{ backgroundImage: gradient }}
    >
      <span className="skew-x-12 leading-none tabular-nums">{value}</span>
    </span>
  );
}

function SkewPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex -skew-x-12 rounded-md bg-white px-10 py-3 shadow-[0_8px_0_rgba(0,0,0,0.35)]">
      <span className="skew-x-12 text-sm font-black uppercase tracking-[0.5em] text-slate-900">{children}</span>
    </span>
  );
}

function LifterPlate() {
  return <SkewPill>Lifter</SkewPill>;
}

function AttemptPlate({ dimmed }: { dimmed: boolean }) {
  return (
    <div className={`inline-flex -ml-3 ${dimmed ? 'opacity-50' : ''}`}>
      <SkewPill>Attempt</SkewPill>
    </div>
  );
}

function AttemptMarker({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md bg-lime-400 px-3 py-1 text-sm font-black leading-none text-slate-900 shadow-[0_6px_0_rgba(0,0,0,0.3)] whitespace-nowrap ${
        className ?? ''
      }`}
    >
      {value.toString().padStart(2, '0')}
    </span>
  );
}

function CooldownStack({ badges }: { badges: Array<{ id: number; value: number; gradient: string }> }) {
  if (!badges.length) {
    return <div className="min-h-12 min-w-0" />;
  }

  return (
    <div className="flex min-h-12 items-center gap-3 whitespace-nowrap">
      {badges.map((badge) => (
        <CooldownBadge key={badge.id} value={badge.value} gradient={badge.gradient} />
      ))}
    </div>
  );
}

function AttemptColumn({
  badges,
  ghost,
  attemptNo
}: {
  badges: Array<{ id: number; value: number; gradient: string }>;
  ghost?: boolean;
  attemptNo?: number;
}) {
  const className = ghost ? 'invisible pointer-events-none' : '';
  const hasBadges = badges.length > 0;
  const hasAttemptNumber = !ghost && typeof attemptNo === 'number';
  const attemptActive = hasBadges || hasAttemptNumber;

  return (
    <div className={`relative flex flex-col items-start gap-2 ${className}`} aria-hidden={ghost ? 'true' : undefined}>
      <div className="absolute bottom-full left-0 mb-2 flex items-center gap-2 whitespace-nowrap">
        {hasAttemptNumber && <AttemptMarker value={attemptNo!} />}
        <CooldownStack badges={badges} />
      </div>
      <AttemptPlate dimmed={!attemptActive} />
    </div>
  );
}

function playShortBeep(audioCtxRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  oscillator.type = 'sine';
  oscillator.frequency.value = 880;

  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.35, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  oscillator.start(now);
  oscillator.stop(now + 0.3);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}

function playLongBeep(audioCtxRef: MutableRefObject<AudioContext | null>) {
  if (typeof window === 'undefined') return;

  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  oscillator.type = 'triangle';
  oscillator.frequency.value = 660;

  const gain = ctx.createGain();
  oscillator.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.4, now + 0.02);
  gain.gain.setValueAtTime(0.4, now + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

  oscillator.start(now);
  oscillator.stop(now + 1.3);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
