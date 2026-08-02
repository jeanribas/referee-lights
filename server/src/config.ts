import { config as loadEnv } from 'dotenv';

// dotenv 17 loga uma dica de runtime a cada boot; quiet mantém o stdout limpo.
loadEnv({ quiet: true });

export const config = {
  PORT: Number(process.env.PORT ?? 3333),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  MASTER_USER: process.env.MASTER_USER ?? '',
  MASTER_PASSWORD: process.env.MASTER_PASSWORD ?? '',
  // Chave de assinatura dos tokens do master, separada da senha: um token
  // capturado não pode mais ser usado para brute-forçar a senha offline.
  MASTER_TOKEN_SECRET: process.env.MASTER_TOKEN_SECRET ?? '',
  ANALYTICS_DB_PATH: process.env.ANALYTICS_DB_PATH ?? 'data/analytics.db',
  TELEMETRY_URL: process.env.TELEMETRY_URL ?? 'https://api-luzes-ipf.assist.com.br',
  TELEMETRY_ENABLED: (process.env.TELEMETRY_ENABLED ?? 'true') === 'true',
  // GeoLite2 baixa ~70MB no primeiro boot; desligado no bundle Windows (LAN)
  GEO_ENABLED: (process.env.GEO_ENABLED ?? 'true') === 'true',
  KEY_RELAY_AVAILABLE: (process.env.KEY_RELAY_AVAILABLE ?? 'false') === 'true'
};
