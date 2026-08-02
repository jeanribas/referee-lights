/**
 * Rate limiter em memória por chave (IP, instanceId...).
 * Janela fixa: `limit` requisições a cada `windowMs`. Sem dependências —
 * suficiente para endpoints públicos de baixo volume (/track, /telemetry,
 * /master/auth). O Map é podado a cada varredura para não crescer sem limite.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

export function rateLimitOk(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      if (buckets.size >= MAX_KEYS) return false;
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= limit;
}
