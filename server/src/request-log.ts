/**
 * Log compacto de requisições (modo `REQUEST_LOG=compact`, nuvem).
 *
 * Uma linha `info` por requisição com o mínimo útil para diagnóstico: método,
 * caminho SEM query string, status, tempo, IP em hash, user-agent e host.
 * Nunca entram corpo, headers de auth nem query (PINs e tokens de sala viajam
 * em query). Rotas de ruído conhecido com sucesso não geram linha.
 */

const PATH_MAX = 120;
const UA_MAX = 160;
const HOST_MAX = 253;
const HOST_RE = /^[a-z0-9.-]+$/i;

/** Caminho da URL sem query string nem fragmento, cortado em 120 chars. */
export function requestPath(url: string): string {
  return url.split('?')[0].split('#')[0].slice(0, PATH_MAX);
}

/** Rotas que lotam o log com status < 400. Erro (>= 400) sempre é logado. */
export function isNoiseRequest(method: string, path: string, status: number): boolean {
  if (status >= 400) return false;
  if (method === 'OPTIONS') return true;
  if (method === 'POST' && path === '/telemetry/heartbeat') return true;
  if (method === 'GET' && (path === '/key-relay/status' || path === '/health' || path.startsWith('/master/'))) {
    return true;
  }
  return false;
}

/**
 * Caractere que não pode ir para o log: controles C0/DEL/C1, separadores de
 * linha e parágrafo (U+2028/2029) e controles bidi (U+202A–202E, U+2066–2069),
 * que embaralham a leitura da linha.
 */
function isUnsafeCodePoint(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** User-agent sem caracteres inseguros para o log, cortado em 160 chars. */
export function sanitizeUserAgent(raw: string | undefined): string {
  if (!raw) return '';
  let out = '';
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0;
    if (isUnsafeCodePoint(code)) continue;
    out += ch;
    if (out.length >= UA_MAX) break;
  }
  return out;
}

/** Host do header sem porta; vazio se não for um nome de domínio simples. */
export function sanitizeHost(raw: string | undefined): string {
  const name = (raw ?? '').trim().slice(0, HOST_MAX + 6).replace(/:\d{1,5}$/, '');
  if (!name || name.length > HOST_MAX || !HOST_RE.test(name)) return '';
  return name;
}

export interface RequestLogLine {
  event: 'req';
  m: string;
  p: string;
  s: number;
  ms: number;
  ip: string;
  ua: string;
  h: string;
  dc: boolean;
}

export function buildRequestLine(input: {
  method: string;
  url: string;
  status: number;
  elapsedMs: number;
  ipHash: string;
  userAgent: string | undefined;
  host: string | undefined;
  datacenter: boolean;
}): RequestLogLine {
  return {
    event: 'req',
    m: input.method.slice(0, 10),
    p: requestPath(input.url),
    s: input.status,
    ms: Math.round(input.elapsedMs),
    ip: input.ipHash,
    ua: sanitizeUserAgent(input.userAgent),
    h: sanitizeHost(input.host),
    dc: input.datacenter
  };
}
