import 'dotenv/config';
import path from 'node:path';

import { parseTrustProxyHops } from './client-ip.js';

// Pasta de dados (banco, instance.id, fila local). Padrão `data` relativo ao
// cwd, como sempre foi na web/Docker; o executável aponta para fora da pasta
// da versão para os dados sobreviverem às atualizações.
const DATA_DIR = path.resolve(process.env.DATA_DIR || 'data');

export const config = {
  PORT: Number(process.env.PORT ?? 3333),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  MASTER_USER: process.env.MASTER_USER ?? '',
  MASTER_PASSWORD: process.env.MASTER_PASSWORD ?? '',
  DATA_DIR,
  ANALYTICS_DB_PATH: process.env.ANALYTICS_DB_PATH || path.join(DATA_DIR, 'analytics.db'),
  // Standalone do Next servido pelo próprio server (pacote Windows: uma
  // porta, um processo). Vazio = só API, como na web.
  FRONTEND_DIR: process.env.FRONTEND_DIR ?? '',
  TELEMETRY_URL: process.env.TELEMETRY_URL ?? 'https://api-luzes-ipf.assist.com.br',
  TELEMETRY_ENABLED: (process.env.TELEMETRY_ENABLED ?? 'true') === 'true',
  KEY_RELAY_AVAILABLE: (process.env.KEY_RELAY_AVAILABLE ?? 'false') === 'true',
  // Sala sem atividade por este tempo é arquivada (código volta ao pool)
  ROOM_TTL_HOURS: Number(process.env.ROOM_TTL_HOURS ?? 24),
  // Quantos proxies NOSSOS ficam na frente da API. 0 = sem proxy (bundle na
  // LAN): X-Forwarded-For é ignorado e vale o endereço TCP.
  TRUST_PROXY_HOPS: parseTrustProxyHops(process.env.TRUST_PROXY_HOPS)
};
