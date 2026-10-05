import type { Judge } from '@/types/state';

export interface QrTarget {
  judge: Judge;
  label: string;
  /** Rótulo curto do seletor em tela estreita ("Esquerdo"). */
  shortLabel?: string;
  href: string;
}

export function buildRefHref(origin: string, roomId: string, token: string, judge: Judge) {
  const encodedRoom = encodeURIComponent(roomId);
  const encodedToken = encodeURIComponent(token);
  return `${origin}/ref/${judge}?roomId=${encodedRoom}&token=${encodedToken}`;
}

export function buildRoomViewHref(
  path: '/display' | '/legend' | '/timer',
  roomId: string | undefined,
  adminPin: string | undefined
) {
  if (roomId && adminPin) {
    return `${path}?roomId=${encodeURIComponent(roomId)}&pin=${encodeURIComponent(adminPin)}`;
  }
  return path;
}

export function normalizeConfiguredOrigin(value: string | undefined, defaultProtocol: string) {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';

  const hasProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed);
  const input = hasProtocol ? trimmed : `${defaultProtocol}${trimmed.replace(/^\/+/, '')}`;

  try {
    const url = new URL(input);
    return url.origin;
  } catch (error) {
    console.warn('Invalid NEXT_PUBLIC_QR_ORIGIN provided:', error);
    return '';
  }
}

export function selectUsefulIp(candidates: string[]) {
  return candidates.find((candidate) => {
    if (!candidate) return false;
    if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(candidate)) return false;

    const [a, b] = candidate.split('.').map(Number);
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;

    return false;
  });
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export function isLoopbackHost(hostname: string) {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

/**
 * Origem dos links que vão para OUTROS aparelhos (QR dos árbitros, display,
 * timer): NEXT_PUBLIC_QR_ORIGIN > IP da rede local (quando conhecido) > o
 * próprio endereço da página. Só no navegador.
 */
export function resolveAppOrigin(networkIps: string[] = []) {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol || 'https:';
  const protocolWithSlashes = protocol.endsWith(':') ? `${protocol}//` : 'https://';
  const port = window.location.port ? `:${window.location.port}` : '';
  const configured = normalizeConfiguredOrigin(process.env.NEXT_PUBLIC_QR_ORIGIN?.trim(), protocolWithSlashes);
  if (configured) return configured;
  const host = selectUsefulIp(networkIps) ?? window.location.hostname;
  return `${protocolWithSlashes}${host}${port}`;
}

/** Largura recomendada do timer em janela própria (o navegador pode impor um mínimo maior). */
export const TIMER_WINDOW_WIDTH = 480;

/**
 * Abre uma tela de apoio (timer) numa janela própria, na altura total da tela
 * e encostada à direita. Só quem ABRE a janela pode definir o tamanho — a
 * página não consegue se redimensionar sozinha. Mesmo `name` reaproveita a
 * janela já aberta. Devolve false se o navegador bloqueou (aí o chamador
 * segue com a navegação normal).
 */
export function openSideWindow(url: string, name: string, width = TIMER_WINDOW_WIDTH): boolean {
  if (typeof window === 'undefined') return false;
  const scr = window.screen as Screen & { availLeft?: number; availTop?: number };
  const left = (scr.availLeft ?? 0) + Math.max(0, scr.availWidth - width);
  const top = scr.availTop ?? 0;
  const features = `popup=yes,width=${width},height=${scr.availHeight},left=${left},top=${top}`;
  const win = window.open(url, name, features);
  if (!win) return false;
  win.focus();
  return true;
}
