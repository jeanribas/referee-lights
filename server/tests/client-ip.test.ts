// IP do cliente para rate limit: X-Forwarded-For forjado não pode escapar do
// limite de tentativas de login, nem sem proxy (bundle) nem atrás do Traefik.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io as ioClient } from 'socket.io-client';

import { parseTrustProxyHops, resolveClientIp } from '../src/client-ip.js';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';
const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-ip-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
let app: App;
let cfg: typeof import('../src/config.js')['config'];

beforeAll(async () => {
  cfg = (await import('../src/config.js')).config;
  const { createServer } = await import('../src/server.js');
  app = await createServer();
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('resolveClientIp', () => {
  it('hops=0 ignora o header', () => {
    expect(resolveClientIp('10.0.0.5', '1.2.3.4', 0)).toBe('10.0.0.5');
  });
  it('hops=1 pega o valor mais à direita (o que o nosso proxy escreveu)', () => {
    expect(resolveClientIp('172.18.0.2', 'forjado, 200.1.1.1', 1)).toBe('200.1.1.1');
    expect(resolveClientIp('172.18.0.2', ['forjado', '200.1.1.1'], 1)).toBe('200.1.1.1');
  });
  it('hops=2 pega o penúltimo', () => {
    expect(resolveClientIp('x', 'forjado, 200.1.1.1, 10.0.0.1', 2)).toBe('200.1.1.1');
  });
  it('sem header ou header vazio cai no endereço do socket', () => {
    expect(resolveClientIp('10.0.0.5', undefined, 1)).toBe('10.0.0.5');
    expect(resolveClientIp('10.0.0.5', ' , ', 1)).toBe('10.0.0.5');
  });
  it('parseTrustProxyHops aceita só inteiros >= 0', () => {
    expect(parseTrustProxyHops(undefined)).toBe(0);
    expect(parseTrustProxyHops('abc')).toBe(0);
    expect(parseTrustProxyHops('-3')).toBe(0);
    expect(parseTrustProxyHops('1')).toBe(1);
  });
});

async function authAttempt(remoteAddress: string, xff: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/master/auth',
    remoteAddress,
    headers: { 'x-forwarded-for': xff },
    payload: { user: 'x', password: 'errada' }
  });
  return res.statusCode;
}

describe('rate limit do login com X-Forwarded-For forjado', () => {
  it('sem proxy (hops=0): trocar o header a cada tentativa não escapa do limite', async () => {
    cfg.TRUST_PROXY_HOPS = 0;
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push(await authAttempt('10.50.0.1', `1.1.1.${i}`));
    expect(codes.slice(0, 10).every((c) => c === 403)).toBe(true);
    expect(codes[10]).toBe(429);
    expect(codes[11]).toBe(429);
  });

  it('atrás de 1 proxy (hops=1): valor forjado à esquerda é ignorado', async () => {
    cfg.TRUST_PROXY_HOPS = 1;
    const codes: number[] = [];
    // O proxy (remoteAddress fixo) acrescenta o IP real à direita.
    for (let i = 0; i < 12; i++) codes.push(await authAttempt('172.18.0.2', `9.9.9.${i}, 200.10.10.10`));
    expect(codes[10]).toBe(429);
    // Outro cliente real atrás do mesmo proxy tem balde próprio.
    expect(await authAttempt('172.18.0.2', '200.10.10.11')).toBe(403);
    cfg.TRUST_PROXY_HOPS = 0;
  });
});

describe('socket.io usa a mesma regra', () => {
  it('handshake com X-Forwarded-For forjado grava o IP do socket (hops=0)', async () => {
    cfg.TRUST_PROXY_HOPS = 0;
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    if (!addr || typeof addr === 'string') throw new Error('sem endereço');
    const socket = ioClient(`http://127.0.0.1:${addr.port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      extraHeaders: { 'x-forwarded-for': '6.6.6.6' }
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    const [server] = await app.io.fetchSockets();
    const { resolveClientIp: resolve } = await import('../src/client-ip.js');
    expect(server.handshake.headers['x-forwarded-for']).toBe('6.6.6.6');
    expect(resolve(server.handshake.address, server.handshake.headers['x-forwarded-for'], cfg.TRUST_PROXY_HOPS)).not.toBe(
      '6.6.6.6'
    );
    socket.disconnect();
  });
});
