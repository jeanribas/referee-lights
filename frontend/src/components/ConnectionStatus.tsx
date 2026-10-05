import type { Messages } from '@/lib/i18n/messages';

type Status = 'connected' | 'connecting' | 'disconnected';

const TONE: Record<Status, { dot: string; text: string }> = {
  connected: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
  connecting: { dot: 'bg-amber-400 animate-pulse', text: 'text-amber-200' },
  disconnected: { dot: 'bg-red-500', text: 'text-red-300' }
};

/**
 * Estado da conexão da tela: ponto + texto, SEM caixa nem borda — é
 * informação, não pode parecer botão no meio dos controles. O mesmo em todas
 * as telas (admin, timer, legenda, árbitros).
 */
export function ConnectionStatus({
  status,
  messages,
  size = 'md',
  showPrefix = false,
  className = ''
}: {
  status: Status;
  messages: Messages['common'];
  size?: 'sm' | 'md';
  /** "Status: Conectado" em vez de só "Conectado". */
  showPrefix?: boolean;
  className?: string;
}) {
  const tone = TONE[status];
  return (
    <span
      role="status"
      aria-live="polite"
      data-connection={status}
      className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${size === 'sm' ? 'text-[13px]' : 'text-[15px]'} ${tone.text} ${className}`}
    >
      <span aria-hidden="true" className={`shrink-0 rounded-full ${size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5'} ${tone.dot}`} />
      {showPrefix && <span className="text-slate-400">{messages.labels.status}:</span>}
      {messages.connection[status]}
    </span>
  );
}
