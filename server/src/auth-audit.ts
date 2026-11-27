// Registro de falhas de autenticação (PIN/token errado, bloqueio por excesso).
// Entrada do atacante: o que chega aqui é cortado e validado antes de virar log
// ou linha no banco. Nunca PIN/token tentado e nunca IP cru.

export type AuthFailKind = 'invalid_pin' | 'invalid_token' | 'blocked';
export type AuthFailVia = 'socket' | 'http' | 'key_relay';

/** Mesma janela para log e para o banco: enxurrada vira 1 linha a cada 10 s por (IP, tipo). */
export const AUTH_AUDIT_WINDOW_MS = 10_000;

const ROOM_CODE = /^[A-Z0-9]{4}$/;
const KNOWN_ROLES = ['admin', 'display', 'left', 'center', 'right'] as const;

/** Código de sala no formato do servidor (4 chars A-Z0-9); qualquer outra coisa vira 'invalid'. */
export function sanitizeRoomId(raw: unknown): string {
  return typeof raw === 'string' && ROOM_CODE.test(raw) ? raw : 'invalid';
}

/** Papel só se for um dos papéis conhecidos; o resto vira 'invalid'. */
export function sanitizeRole(raw: unknown): string {
  return KNOWN_ROLES.find((role) => role === raw) ?? 'invalid';
}

/**
 * Controle de gravação das falhas (log e banco). Duas regras:
 * - por chave (tipo + IP): no máximo 1 registro a cada `windowMs`; as demais
 *   entram só no contador de suprimidas da própria chave;
 * - global: no máximo `budgetPerMinute` registros por minuto no total, para que
 *   um ataque com IPs variados não encha o disco. O que passa disso é contado
 *   e sai como `suppressed` na próxima linha gravada.
 * O mapa tem teto e despeja a chave mais antiga em O(1) quando lota.
 */
export class AuthFailThrottle {
  private readonly last = new Map<string, { at: number; suppressed: number }>();
  private budgetStart = Number.NEGATIVE_INFINITY;
  private budgetUsed = 0;
  private overflow = 0;

  constructor(
    private readonly windowMs = AUTH_AUDIT_WINDOW_MS,
    private readonly maxKeys = 5_000,
    private readonly budgetPerMinute = 120
  ) {}

  take(key: string, now = Date.now()): { allowed: boolean; suppressed: number } {
    if (now - this.budgetStart >= 60_000) {
      this.budgetStart = now;
      this.budgetUsed = 0;
    }
    const entry = this.last.get(key);
    if (entry && now - entry.at < this.windowMs) {
      entry.suppressed += 1;
      return { allowed: false, suppressed: 0 };
    }
    if (this.budgetUsed >= this.budgetPerMinute) {
      this.overflow += 1;
      return { allowed: false, suppressed: 0 };
    }
    this.budgetUsed += 1;
    if (!entry && this.last.size >= this.maxKeys) {
      // Mapa mantém ordem de inserção: a primeira chave é a mais antiga.
      const oldest = this.last.keys().next();
      if (!oldest.done) this.last.delete(oldest.value);
    }
    const suppressed = (entry?.suppressed ?? 0) + this.overflow;
    this.overflow = 0;
    // delete + set move a chave para o fim (a mais recente).
    this.last.delete(key);
    this.last.set(key, { at: now, suppressed: 0 });
    return { allowed: true, suppressed };
  }
}
