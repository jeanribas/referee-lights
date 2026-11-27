import { config as loadEnv } from 'dotenv';

import { parseTrustProxyHops } from './client-ip.js';

// dotenv 17 loga uma dica de runtime a cada boot; quiet mantém o stdout limpo.
loadEnv({ quiet: true });

export const ROOM_IDLE_POLICIES = ['activity', 'votes'] as const;
export type RoomIdlePolicy = (typeof ROOM_IDLE_POLICIES)[number];

/**
 * `activity` (padrão): qualquer mudança de estado segura a sala (comportamento
 * antigo). `votes`: só voto/cartão ou os 3 árbitros conectados ao mesmo tempo
 * seguram a sala — reconexão de um árbitro não a mantém viva para sempre.
 * Valor inválido cai em `activity`; `invalid` guarda o valor recebido para o aviso.
 */
export function parseRoomIdlePolicy(raw: string | undefined): { policy: RoomIdlePolicy; invalid: string | null } {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === '') return { policy: 'activity', invalid: null };
  const found = ROOM_IDLE_POLICIES.find((policy) => policy === value);
  if (found) return { policy: found, invalid: null };
  return { policy: 'activity', invalid: raw ?? null };
}

const roomIdle = parseRoomIdlePolicy(process.env.ROOM_IDLE_POLICY);

export const config = {
  PORT: Number(process.env.PORT ?? 3333),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  MASTER_USER: process.env.MASTER_USER ?? '',
  MASTER_PASSWORD: process.env.MASTER_PASSWORD ?? '',
  // Chave de assinatura dos tokens administrativos, separada da senha: um token
  // capturado não pode mais ser usado para brute-forçar a senha offline.
  MASTER_TOKEN_SECRET: process.env.MASTER_TOKEN_SECRET ?? '',
  ANALYTICS_DB_PATH: process.env.ANALYTICS_DB_PATH ?? 'data/analytics.db',
  TELEMETRY_URL: process.env.TELEMETRY_URL ?? 'https://api.refereelights.app',
  TELEMETRY_ENABLED: (process.env.TELEMETRY_ENABLED ?? 'true') === 'true',
  // GeoLite2 baixa ~70MB no primeiro boot; desligado no bundle Windows (LAN)
  GEO_ENABLED: (process.env.GEO_ENABLED ?? 'true') === 'true',
  KEY_RELAY_AVAILABLE: (process.env.KEY_RELAY_AVAILABLE ?? 'false') === 'true',
  // Sala sem atividade por este tempo é arquivada (código volta ao pool)
  ROOM_TTL_HOURS: Number(process.env.ROOM_TTL_HOURS ?? 24),
  // activity = comportamento antigo; votes = só voto ou 3 árbitros conectados renovam a sala
  ROOM_IDLE_POLICY: roomIdle.policy,
  ROOM_IDLE_POLICY_INVALID: roomIdle.invalid,
  // Quantos proxies NOSSOS ficam na frente da API (Traefik/Dokploy = 1).
  // 0 = sem proxy (bundle na LAN): X-Forwarded-For é ignorado.
  TRUST_PROXY_HOPS: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS)
};
