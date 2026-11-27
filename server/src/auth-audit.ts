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
 * Janela fixa por chave. Dentro da janela a falha é contada, não gravada; a
 * próxima gravação carrega quantas foram engolidas. Mapa limitado: sem isso um
 * ataque com IPs variados faria a memória crescer sem fim.
 */
export class AuthFailThrottle {
  private readonly last = new Map<string, { at: number; suppressed: number }>();

  constructor(
    private readonly windowMs = AUTH_AUDIT_WINDOW_MS,
    private readonly maxKeys = 5_000
  ) {}

  take(key: string, now = Date.now()): { allowed: boolean; suppressed: number } {
    const entry = this.last.get(key);
    if (entry && now - entry.at < this.windowMs) {
      entry.suppressed += 1;
      return { allowed: false, suppressed: 0 };
    }
    if (!entry && this.last.size >= this.maxKeys) this.prune(now);
    const suppressed = entry?.suppressed ?? 0;
    this.last.set(key, { at: now, suppressed: 0 });
    return { allowed: true, suppressed };
  }

  private prune(now: number): void {
    for (const [key, entry] of this.last) {
      if (now - entry.at >= this.windowMs) this.last.delete(key);
    }
    if (this.last.size >= this.maxKeys) {
      const oldest = this.last.keys().next();
      if (!oldest.done) this.last.delete(oldest.value);
    }
  }
}
