import { getApiBaseUrl } from './config';

export interface JoinQrCodesResponse {
  roomId: string;
  adminPin: string;
  joinQRCodes: {
    left: { token: string };
    center: { token: string };
    right: { token: string };
  };
}

interface ApiError extends Error {
  code?: string;
  status?: number;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${path}`, init);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const errorCode =
      typeof payload === 'object' && payload && 'error' in payload && typeof (payload as any).error === 'string'
        ? (payload as any).error
        : 'request_failed';

    const error: ApiError = new Error(errorCode);
    error.code = errorCode;
    error.status = response.status;
    throw error;
  }

  return payload as T;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const hasBody = body !== undefined;
  const headers: Record<string, string> = {};

  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  return requestJson<T>(path, {
    method: 'POST',
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: hasBody ? JSON.stringify(body) : undefined
  });
}

async function getJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

export function createRoom() {
  return postJson<JoinQrCodesResponse>('/rooms');
}

export function accessRoom(roomId: string, adminPin: string) {
  return postJson<JoinQrCodesResponse>(`/rooms/${encodeURIComponent(roomId)}/access`, { adminPin });
}

export function refreshRefereeTokens(roomId: string, adminPin: string) {
  return postJson<JoinQrCodesResponse>(`/rooms/${encodeURIComponent(roomId)}/refresh-ref-tokens`, { adminPin });
}

export function trackLinkClick(url: string) {
  return postJson<{ ok: true }>('/track/click', { url });
}

export function trackPageView(path: string, opts?: { locale?: string; includeReferrer?: boolean }): void {
  // Só o pathname — query string carrega PINs e tokens de sala e nunca
  // pode sair do navegador em telemetria.
  const clean = path.split('?')[0].split('#')[0];
  if (!clean.startsWith('/')) return;
  try {
    const width = window.innerWidth;
    const device = width < 768 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop';
    // Referrer: só o hostname externo, só na primeira carga (não em navegação interna)
    let referrer = '';
    if (opts?.includeReferrer && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.hostname !== window.location.hostname) referrer = ref.hostname;
      } catch {
        /* referrer inválido: ignora */
      }
    }
    void fetch(`${getApiBaseUrl()}/track/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: clean, device, locale: opts?.locale ?? '', referrer }),
      keepalive: true
    }).catch(() => {});
  } catch {
    // telemetria nunca pode quebrar navegação
  }
}

/* ─── Key Relay ─── */

export interface KeyRelayStatus {
  available: boolean;
  active: boolean;
  roomId: string | null;
  keys: { valid: string; invalid: string };
}

export function getKeyRelayStatus() {
  return getJson<KeyRelayStatus>('/key-relay/status');
}

export function startKeyRelay(roomId: string, validKey = 'F1', invalidKey = 'F10') {
  return postJson<{ ok: true; roomId: string; keys: { valid: string; invalid: string } }>(
    '/key-relay/start',
    { roomId, validKey, invalidKey }
  );
}

export function stopKeyRelay() {
  return postJson<{ ok: true }>('/key-relay/stop');
}
