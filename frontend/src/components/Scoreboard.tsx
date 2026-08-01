import { ReactNode, useMemo } from 'react';

interface CooldownBadgeData {
  id: number | string;
  value: number;
  gradient: string;
}

interface ScoreboardProps {
  mainMs: number;
  running: boolean;
  attemptNo?: number;
  leftBadges: CooldownBadgeData[];
  rightBadges: CooldownBadgeData[];
}

function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString();
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function Scoreboard({ mainMs, attemptNo, leftBadges, rightBadges }: ScoreboardProps) {
  const timerText = useMemo(() => formatTime(mainMs), [mainMs]);
  const urgency = mainMs <= 10_000;
  const isZero = mainMs <= 0;
  const urgencyColor = isZero ? 'text-[#ff1f1f]' : urgency ? 'text-[#ff4d4f]' : 'text-white';

  return (
    <div className="mx-auto grid w-full max-w-[min(88vw,1300px)] grid-cols-[minmax(0,auto)_1fr_minmax(0,auto)] items-end gap-6">
      <CooldownColumn badges={leftBadges} ghost={!leftBadges.length} ariaHidden={leftBadges.length === 0} />

      <div className="flex flex-col items-center gap-6">
        <div
          className={`font-display font-black leading-none tracking-tight [font-variant-numeric:tabular-nums] ${urgencyColor}`}
          style={{ fontSize: 'clamp(6rem, 24vw, 20rem)' }}
        >
          {timerText}
        </div>
        <div className="self-end">
          <SkewPill>Lifter</SkewPill>
        </div>
      </div>

      <CooldownColumn badges={rightBadges} attemptNo={attemptNo} />
    </div>
  );
}

function CooldownColumn({
  badges,
  ghost,
  attemptNo,
  ariaHidden
}: {
  badges: CooldownBadgeData[];
  ghost?: boolean;
  attemptNo?: number;
  ariaHidden?: boolean;
}) {
  const ghostClass = ghost ? 'opacity-0 pointer-events-none select-none' : '';
  const hasBadges = badges.length > 0;
  const hasAttemptNumber = !ghost && typeof attemptNo === 'number';
  const attemptActive = hasBadges || hasAttemptNumber;

  return (
    <div className={`flex min-w-0 flex-col items-start gap-2 ${ghostClass}`} aria-hidden={ariaHidden ? 'true' : undefined}>
      <div className="flex min-w-0 flex-col items-start gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {hasAttemptNumber && <AttemptMarker value={attemptNo!} className="ml-4 shrink-0" />}
          <CooldownStack badges={badges} />
        </div>
        <AttemptPill dimmed={!attemptActive} />
      </div>
    </div>
  );
}

function SkewPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex -skew-x-12 rounded-md bg-white px-10 py-3 shadow-[0_8px_0_rgba(0,0,0,0.35)]">
      <span className="skew-x-12 text-sm font-black uppercase tracking-[0.5em] text-slate-900">{children}</span>
    </span>
  );
}

function AttemptPill({ dimmed }: { dimmed: boolean }) {
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

function CooldownBadge({ value, gradient }: { value: number; gradient: string }) {
  return (
    <span
      className="inline-flex -skew-x-12 items-center justify-center rounded-md px-4 py-2 text-lg font-black text-slate-900 shadow-[0_6px_0_rgba(0,0,0,0.3)]"
      style={{ backgroundImage: gradient }}
    >
      <span className="skew-x-12 leading-none">{value}</span>
    </span>
  );
}

function CooldownStack({ badges }: { badges: CooldownBadgeData[] }) {
  if (!badges.length) {
    return <div className="min-h-12 min-w-0" />;
  }

  return (
    <div className="flex min-h-12 min-w-0 items-center gap-2 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none]">
      {badges.map((badge) => (
        <CooldownBadge key={badge.id} value={badge.value} gradient={badge.gradient} />
      ))}
    </div>
  );
}

export default Scoreboard;
