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

/* ─── Master Admin types ─── */

export interface MasterStats {
  totalSessions: number;
  totalConnections: number;
  uniqueIps: number;
  activeRooms: number;
}

export interface MasterSession {
  id: number;
  room_id: string;
  created_at: string;
  closed_at: string | null;
  connection_count: number;
  top_country: string | null;
}

export interface MasterSessionsResponse {
  sessions: MasterSession[];
}

export interface MasterGeoResponse {
  countries: Array<{ country: string; count: number }>;
  cities: Array<{ city: string; country: string; count: number }>;
}

export interface MasterActiveResponse {
  rooms: Array<{ id: string; createdAt: number; connectedJudges: number }>;
}

export interface MasterTimelineResponse {
  timeline: Array<{ date: string; sessions: number; connections: number }>;
}

export interface MasterHourlyResponse {
  hourly: Array<{ hour: number; count: number }>;
}

export interface MasterRolesResponse {
  roles: Array<{ role: string; count: number }>;
}

export interface MasterDurationResponse {
  avgMinutes: number;
  maxMinutes: number;
  totalHours: number;
}

export interface MasterActivityResponse {
  activity: Array<{ minute: string; connections: number }>;
}

/* ─── Master Admin helpers ─── */

async function getJsonAuth<T>(path: string): Promise<T> {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('master_token') : null;
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return requestJson<T>(path, { headers });
}

export function masterAuth(user: string, password: string) {
  return postJson<{ ok: true; token: string }>('/master/auth', { user, password });
}

export function getMasterStats(period = '30d') {
  return getJsonAuth<MasterStats>(`/master/stats?period=${period}`);
}

export function getMasterSessions(limit = 20, offset = 0) {
  return getJsonAuth<MasterSessionsResponse>(`/master/sessions?limit=${limit}&offset=${offset}`);
}

export function getMasterGeo(period = '30d') {
  return getJsonAuth<MasterGeoResponse>(`/master/geo?period=${period}`);
}

export function getMasterActive() {
  return getJsonAuth<MasterActiveResponse>('/master/active');
}

export function getMasterTimeline(period = '30d') {
  return getJsonAuth<MasterTimelineResponse>(`/master/timeline?period=${period}`);
}

export function getMasterHourly() {
  return getJsonAuth<MasterHourlyResponse>('/master/hourly');
}

export function getMasterRoles() {
  return getJsonAuth<MasterRolesResponse>('/master/roles');
}

export function getMasterDuration(period = '30d') {
  return getJsonAuth<MasterDurationResponse>(`/master/duration?period=${period}`);
}

export function getMasterActivity() {
  return getJsonAuth<MasterActivityResponse>('/master/activity');
}

export interface MasterClicksResponse {
  clicks: Array<{ url: string; count: number; last_click: string }>;
}

export function getMasterClicks() {
  return getJsonAuth<MasterClicksResponse>('/master/clicks');
}

export interface MasterOnlineVisitor {
  role: string;
  roomId: string;
  page: string;
  host: string;
  country: string;
  city: string;
  connectedAt: string;
}

export interface MasterOnlineResponse {
  visitors: MasterOnlineVisitor[];
  count: number;
}

export interface MasterPagesResponse {
  pages: Array<{ page: string; count: number }>;
}

export interface MasterHostsResponse {
  hosts: Array<{ host: string; count: number }>;
}

export function getMasterOnline() {
  return getJsonAuth<MasterOnlineResponse>('/master/online');
}

export function getMasterPages(period = '30d') {
  return getJsonAuth<MasterPagesResponse>(`/master/pages?period=${period}`);
}

export function getMasterHosts(period = '30d') {
  return getJsonAuth<MasterHostsResponse>(`/master/hosts?period=${period}`);
}

export interface GeoMarker {
  city: string;
  country: string;
  lat: number;
  lng: number;
  count: number;
}

export interface MasterGeoMarkersResponse {
  markers: GeoMarker[];
}

export function getMasterGeoMarkers(period = '30d') {
  return getJsonAuth<MasterGeoMarkersResponse>(`/master/geo-markers?period=${period}`);
}

export function trackLinkClick(url: string) {
  return postJson<{ ok: true }>('/track/click', { url });
}

export function trackPageView(path: string): void {
  // Só o pathname — query string carrega PINs e tokens de sala e nunca
  // pode sair do navegador em telemetria.
  const clean = path.split('?')[0].split('#')[0];
  if (!clean.startsWith('/')) return;
  try {
    void fetch(`${getApiBaseUrl()}/track/page`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: clean }),
      keepalive: true
    }).catch(() => {});
  } catch {
    // telemetria nunca pode quebrar navegação
  }
}

export interface MasterInstance {
  instance_id: string;
  platform: string;
  arch: string;
  node_version: string;
  uptime_seconds: number;
  active_rooms: number;
  total_sessions: number;
  total_connections: number;
  unique_ips: number;
  first_seen: string;
  last_seen: string;
}

export interface MasterInstancesResponse {
  instances: MasterInstance[];
}

export function getMasterInstances() {
  return getJsonAuth<MasterInstancesResponse>('/master/instances');
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
