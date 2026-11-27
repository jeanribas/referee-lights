/**
 * Origem aceita nas rotas públicas de rastreio (`/track/page`, `/track/click`).
 * Lista vazia (padrão) aceita tudo, como antes.
 */

const ORIGIN_RE = /^https?:\/\/([a-z0-9.-]{1,253})(?::\d{1,5})?$/;
const HOST_RE = /^[a-z0-9.-]{1,253}$/;
const LOG_ORIGIN_MAX = 100;
const REJECT_LOG_INTERVAL_MS = 60_000;

/** Lista separada por vírgula; item inválido nunca casa (falha fechada). */
export function parseTrackAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter((item) => item !== '');
}

/** Origin no formato exato esquema + host + porta; null se não for isso. */
export function exactOrigin(header: string | undefined): string | null {
  if (typeof header !== 'string') return null;
  return ORIGIN_RE.test(header) ? header : null;
}

export function isTrackOriginAllowed(header: string | undefined, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  const origin = exactOrigin(header);
  return origin !== null && allowed.includes(origin);
}

/** Só o hostname da origem, validado; vazio se o header não for uma origem. */
export function originHostOf(header: string | undefined): string {
  const origin = exactOrigin(header);
  if (!origin) return '';
  const host = origin.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
  return HOST_RE.test(host) ? host : '';
}

/** Origem para o log: cortada em 100 chars, minúscula, vírgula vira espaço, só [a-z0-9.:/ -]. */
export function sanitizeLogOrigin(raw: string | undefined): string {
  return (raw ?? '')
    .slice(0, LOG_ORIGIN_MAX)
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/[^a-z0-9.:/ -]/g, '');
}

export interface TrackRejectLine {
  event: 'track_rejected';
  n: number;
  amostraOrigin: string;
}

/** Conta descartes em memória; emite no máximo uma linha por minuto. */
export class TrackRejectCounter {
  private count = 0;
  private lastEmitAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly emit: (line: TrackRejectLine) => void) {}

  record(rawOrigin: string | undefined, now = Date.now()): void {
    this.count += 1;
    if (now - this.lastEmitAt < REJECT_LOG_INTERVAL_MS) return;
    this.lastEmitAt = now;
    this.emit({ event: 'track_rejected', n: this.count, amostraOrigin: sanitizeLogOrigin(rawOrigin) });
    this.count = 0;
  }
}
