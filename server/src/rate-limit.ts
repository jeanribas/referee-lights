/**
 * Rate limiter em memória por chave (IP, instanceId...).
 * Janela fixa: `limit` requisições a cada `windowMs`. Sem dependências —
 * suficiente para endpoints públicos de baixo volume (login e similares).
 * O Map é podado a cada varredura para não crescer sem limite.
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

/**
 * Contador de FALHAS de credencial (PIN/token errado) por chave. Diferente do
 * rateLimitOk, só falhas contam — admin e juízes legítimos reconectando com
 * credencial certa nunca gastam o orçamento. Passou do limite, a chave fica
 * bloqueada (inclusive para a credencial certa) até a janela vencer: sem
 * isso o PIN de 4 dígitos sai por força bruta em minutos.
 */
const failures = new Map<string, { count: number; resetAt: number }>();

export function failureBlocked(key: string, limit: number): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= limit;
}

export function recordFailure(key: string, windowMs: number): void {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    if (failures.size >= MAX_KEYS) {
      for (const [k, e] of failures) if (e.resetAt <= now) failures.delete(k);
      // Ainda cheio: descarta a mais antiga para nunca crescer sem limite.
      if (failures.size >= MAX_KEYS) failures.delete(failures.keys().next().value as string);
    }
    failures.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  entry.count += 1;
}
