import crypto from 'node:crypto';

import { config } from './config.js';

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// Chave dedicada para assinar tokens; cai para a senha só se o env
// MASTER_TOKEN_SECRET não estiver configurado (compat com deploys antigos).
function signingKey(): string {
  return config.MASTER_TOKEN_SECRET || config.MASTER_PASSWORD;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export function validateCredentials(user: string, password: string): boolean {
  if (!config.MASTER_USER || !config.MASTER_PASSWORD) return false;
  // Comparação em tempo constante (hash-then-compare) nas duas credenciais
  const userOk = safeEqual(user, config.MASTER_USER);
  const passOk = safeEqual(password, config.MASTER_PASSWORD);
  return userOk && passOk;
}

export function generateMasterToken(user: string): string {
  const payload = Buffer.from(
    JSON.stringify({ user, ts: Date.now() })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', signingKey())
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyMasterToken(token: string): boolean {
  if (!signingKey()) return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex < 0) return false;

  const payload = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expected = crypto
    .createHmac('sha256', signingKey())
    .update(payload)
    .digest('base64url');

  if (!safeEqual(signature, expected)) {
    return false;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      user?: string;
      ts?: number;
    };
    if (typeof data.ts !== 'number') return false;
    if (Date.now() - data.ts > TOKEN_MAX_AGE_MS) return false;
    return true;
  } catch {
    return false;
  }
}
