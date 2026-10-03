/**
 * IP real do cliente (rate limit e uso interno).
 *
 * X-Forwarded-For é escrito pelo CLIENTE até chegar ao nosso proxy: só os
 * valores acrescentados pelos proxies que NÓS controlamos são confiáveis, e
 * eles ficam à DIREITA da lista. Antes o servidor pegava o primeiro valor
 * (o mais à esquerda), que qualquer um forja — bastava trocar o header a
 * cada tentativa para escapar do limite de tentativas de login.
 *
 * - hops = 0 (padrão; bundle na LAN, sem proxy): ignora o header e usa o
 *   endereço do socket TCP.
 * - hops = N (N proxies nossos na frente, ex.: Traefik = 1): pega o N-ésimo
 *   valor a partir da direita.
 */
export function resolveClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | string[] | undefined,
  trustedHops: number
): string {
  const remote = remoteAddress ?? '';
  if (!trustedHops || trustedHops < 1 || forwardedFor === undefined) return remote;
  const list = (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (list.length === 0) return remote;
  // Lista mais curta que o número de hops = requisição que não passou por
  // todos os proxies; o mais à esquerda é o melhor palpite disponível.
  return list[Math.max(0, list.length - trustedHops)];
}

export function parseTrustProxyHops(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 10) : 0;
}
