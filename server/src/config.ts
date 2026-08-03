import 'dotenv/config';

export const config = {
  PORT: Number(process.env.PORT ?? 3333),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  MASTER_USER: process.env.MASTER_USER ?? '',
  MASTER_PASSWORD: process.env.MASTER_PASSWORD ?? '',
  ANALYTICS_DB_PATH: process.env.ANALYTICS_DB_PATH ?? 'data/analytics.db',
  TELEMETRY_URL: process.env.TELEMETRY_URL ?? 'https://api-luzes-ipf.assist.com.br',
  TELEMETRY_ENABLED: (process.env.TELEMETRY_ENABLED ?? 'true') === 'true',
  KEY_RELAY_AVAILABLE: (process.env.KEY_RELAY_AVAILABLE ?? 'false') === 'true',
  // Sala sem atividade por este tempo é arquivada (código volta ao pool)
  ROOM_TTL_HOURS: Number(process.env.ROOM_TTL_HOURS ?? 24)
};
