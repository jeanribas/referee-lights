// Pacote Windows: API, socket e páginas no mesmo processo e na mesma porta —
// tudo na origem da própria página. Fora dele (dev local), API na :3333.
const SAME_ORIGIN = process.env.NEXT_PUBLIC_BUNDLE_TARGET === 'windows';

const DEFAULT_WS = typeof window === 'undefined'
  ? 'http://localhost:3333'
  : SAME_ORIGIN
    ? window.location.origin
    : `${window.location.protocol === 'https:' ? 'https' : 'http'}://${window.location.hostname}:3333`;

const DEFAULT_API = typeof window === 'undefined'
  ? 'http://localhost:3333'
  : SAME_ORIGIN
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:3333`;

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

export function getWsUrl() {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;

  if (!envUrl) {
    return DEFAULT_WS;
  }

  if (typeof window === 'undefined') {
    return envUrl;
  }

  try {
    const parsed = new URL(envUrl);
    const currentHost = window.location.hostname;

    if (LOCAL_HOSTNAMES.has(parsed.hostname) && !LOCAL_HOSTNAMES.has(currentHost)) {
      parsed.hostname = currentHost;

      if (window.location.protocol === 'https:' && parsed.protocol !== 'https:') {
        parsed.protocol = 'https:';
      }

      return parsed.toString();
    }

    return envUrl;
  } catch {
    return envUrl;
  }
}

export function getApiBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!envUrl) {
    return DEFAULT_API;
  }

  if (typeof window === 'undefined') {
    return envUrl;
  }

  try {
    const parsed = new URL(envUrl);
    const currentHost = window.location.hostname;

    if (LOCAL_HOSTNAMES.has(parsed.hostname) && !LOCAL_HOSTNAMES.has(currentHost)) {
      parsed.hostname = currentHost;

      if (window.location.protocol === 'https:' && parsed.protocol !== 'https:') {
        parsed.protocol = 'https:';
      }

      return parsed.toString();
    }

    return envUrl;
  } catch {
    return envUrl;
  }
}
