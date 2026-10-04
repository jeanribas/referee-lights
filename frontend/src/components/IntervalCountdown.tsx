import clsx from 'clsx';

const WARNING_OFFSET_MS = 3 * 60 * 1000;

interface IntervalCountdownProps {
  intervalMs: number;
  configuredMs: number;
  running: boolean;
  labels: {
    primaryLabel: string;
    warningLabel: string;
  };
}

function IntervalCountdown({ intervalMs, configuredMs, running, labels }: IntervalCountdownProps) {
  if (configuredMs <= 0 && intervalMs <= 0) {
    return null;
  }

  const primaryDisplay = formatHms(Math.max(0, intervalMs));
  const secondaryMs = Math.max(0, intervalMs - WARNING_OFFSET_MS);
  const secondaryDisplay = formatHms(secondaryMs);

  return (
    <div className="w-full max-w-[min(90vw,1100px)] overflow-hidden rounded-[32px] border border-white/10 bg-[#0B0D11]/85 backdrop-blur-md text-white shadow-[0_18px_60px_rgba(0,0,0,0.5)]">
      <Section
        label={labels.primaryLabel}
        value={primaryDisplay}
        intent="primary"
        running={running}
      />
      <div className="h-px bg-white/5" />
      <Section
        label={labels.warningLabel}
        value={secondaryDisplay}
        intent="warning"
        running={running && secondaryMs > 0}
      />
    </div>
  );
}

function Section({
  label,
  value,
  intent,
  running
}: {
  label: string;
  value: string;
  intent: 'primary' | 'warning';
  running: boolean;
}) {
  const textClass =
    intent === 'warning'
      ? clsx('text-[#ff1f1f]', value === '00:00:00' && 'opacity-60')
      : 'text-white';

  return (
    <section className="flex flex-col items-center gap-3 px-12 py-10 text-center">
      <span className="rounded-full bg-white/15 px-6 py-1.5 text-xs font-semibold uppercase tracking-[0.45em] text-white/80">
        {label}
      </span>
      <span
        className={clsx(
          'font-display text-[clamp(3.5rem,14vw,12rem)] font-black leading-none tracking-tight transition-opacity duration-500',
          textClass,
          running ? 'opacity-100' : 'opacity-75'
        )}
      >
        {value}
      </span>
    </section>
  );
}

function formatHms(ms: number) {
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

export default IntervalCountdown;
