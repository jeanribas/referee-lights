// Log compacto de requisições (REQUEST_LOG=compact, nuvem): uma linha por
// requisição, sem query, UA sanitizado, rotas de ruído com sucesso fora do log e
// IP só em hash. Modo default segue sem a linha compacta.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { isNoiseRequest, requestPath, sanitizeHost, sanitizeUserAgent } from '../src/request-log.js';
import { hashIpAddress } from '../src/analytics.js';
import { parseRequestLog } from '../src/config.js';

describe('helpers puros do log compacto', () => {
  it('caminho sem query nem fragmento, cortado em 120 chars', () => {
    expect(requestPath('/rooms/ABCD/access?pin=1234#x')).toBe('/rooms/ABCD/access');
    expect(requestPath(`/${'a'.repeat(300)}?q=1`)).toHaveLength(120);
  });

  it('user-agent sem controle e cortado em 160 chars', () => {
    const ua = sanitizeUserAgent(`Mozilla\u0000\u0007\n\r\u007f\u0085/5.0 ${'x'.repeat(400)}`);
    expect(ua.startsWith('Mozilla/5.0 ')).toBe(true);
    expect(ua).toHaveLength(160);
    expect(/[\u0000-\u001f\u007f-\u009f]/.test(ua)).toBe(false);
    expect(sanitizeUserAgent(undefined)).toBe('');
  });

  it('user-agent sem U+2028/2029 e controles bidi (U+202A–202E, U+2066–2069)', () => {
    const raw = 'Agente\u2028quebra\u2029par\u202Ereverso\u202Aem\u2066isolado\u2069fim';
    expect(sanitizeUserAgent(raw)).toBe('Agentequebraparreversoemisoladofim');
  });

  it('host com caractere de controle ou bidi é descartado', () => {
    expect(sanitizeHost('app\u202Eexample.test')).toBe('');
    expect(sanitizeHost('app\u2028example.test')).toBe('');
  });

  it('host sem porta e só nome de domínio válido', () => {
    expect(sanitizeHost('app.refereelights.app:443')).toBe('app.refereelights.app');
    expect(sanitizeHost('evil"><script>')).toBe('');
    expect(sanitizeHost('[::1]:3333')).toBe('');
    expect(sanitizeHost('a'.repeat(300))).toBe('');
    expect(sanitizeHost(undefined)).toBe('');
  });

  it('rotas de ruído só são descartadas com status < 400', () => {
    expect(isNoiseRequest('POST', '/telemetry/heartbeat', 200)).toBe(true);
    expect(isNoiseRequest('GET', '/key-relay/status', 200)).toBe(true);
    expect(isNoiseRequest('GET', '/health', 200)).toBe(true);
    expect(isNoiseRequest('GET', '/master/stats', 200)).toBe(true);
    expect(isNoiseRequest('OPTIONS', '/rooms', 204)).toBe(true);
    expect(isNoiseRequest('GET', '/master/stats', 401)).toBe(false);
    expect(isNoiseRequest('GET', '/health', 404)).toBe(false);
    expect(isNoiseRequest('POST', '/master/auth', 200)).toBe(false);
    expect(isNoiseRequest('GET', '/rooms/ABCD', 200)).toBe(false);
  });

  it('REQUEST_LOG inválido cai em default', () => {
    expect(parseRequestLog('compact')).toBe('compact');
    expect(parseRequestLog(' COMPACT ')).toBe('compact');
    expect(parseRequestLog('verbose')).toBe('default');
    expect(parseRequestLog(undefined)).toBe('default');
  });
});

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-reqlog-'));
let dbSeq = 0;

async function bootServer(requestLog: 'default' | 'compact'): Promise<App> {
  vi.resetModules();
  process.env.TELEMETRY_ENABLED = 'false';
  process.env.GEO_ENABLED = 'false';
  process.env.LOG_LEVEL = 'silent';
  process.env.MASTER_USER = 'test-user';
  process.env.MASTER_PASSWORD = 'test-password';
  process.env.MASTER_TOKEN_SECRET = 'test-secret';
  process.env.TRUST_PROXY_HOPS = '1';
  process.env.REQUEST_LOG = requestLog;
  dbSeq += 1;
  process.env.ANALYTICS_DB_PATH = path.join(dataDir, `reqlog-${dbSeq}.db`);
  const { createServer } = await import('../src/server.js');
  return createServer();
}

/** Linhas `req` capturadas pelo logger do app. */
function reqLines(spy: { mock: { calls: unknown[][] } }): Array<Record<string, unknown>> {
  return spy.mock.calls
    .map((call) => call[0])
    .filter((arg): arg is Record<string, unknown> => typeof arg === 'object' && arg !== null && (arg as { event?: unknown }).event === 'req');
}

let app: App | null = null;

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

describe('REQUEST_LOG=compact', () => {
  it('uma linha por requisição, sem query, sem segredo e com IP em hash', async () => {
    app = await bootServer('compact');
    const spy = vi.spyOn(app.log, 'info');
    const res = await app.inject({
      method: 'GET',
      url: '/rooms/ABCD/access?pin=SEGREDO-9999&token=TOKEN-XYZ',
      headers: {
        'x-forwarded-for': '10.1.2.3',
        'user-agent': 'Agente/1.0\u0007 teste',
        host: 'app.example.test:3333'
      }
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);

    const lines = reqLines(spy);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toMatchObject({
      event: 'req',
      m: 'GET',
      p: '/rooms/ABCD/access',
      s: res.statusCode,
      ua: 'Agente/1.0 teste',
      h: 'app.example.test',
      dc: false,
      ip: hashIpAddress('10.1.2.3')
    });
    expect(typeof line.ms).toBe('number');
    const dump = JSON.stringify(line);
    expect(dump).not.toContain('SEGREDO');
    expect(dump).not.toContain('TOKEN-XYZ');
    expect(dump).not.toContain('10.1.2.3');
  });

  it('rota de ruído com sucesso não gera linha, mas 404 gera', async () => {
    app = await bootServer('compact');
    const spy = vi.spyOn(app.log, 'info');

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const status = await app.inject({ method: 'GET', url: '/key-relay/status' });
    expect(status.statusCode).toBe(200);
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/rooms',
      headers: { origin: 'https://site.example.test', 'access-control-request-method': 'POST' }
    });
    expect(preflight.statusCode).toBeLessThan(400);
    expect(reqLines(spy)).toHaveLength(0);

    const missing = await app.inject({ method: 'GET', url: '/nao-existe' });
    expect(missing.statusCode).toBe(404);
    const lines = reqLines(spy);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ m: 'GET', p: '/nao-existe', s: 404 });
  });

  it('master sem token (401) é logado; master com sucesso não é', async () => {
    app = await bootServer('compact');
    const spy = vi.spyOn(app.log, 'info');
    const denied = await app.inject({ method: 'GET', url: '/master/stats' });
    expect(denied.statusCode).toBe(401);
    expect(reqLines(spy).map((line) => line.s)).toEqual([401]);
  });
});

describe('REQUEST_LOG=default (bundle/LAN)', () => {
  it('não escreve a linha compacta', async () => {
    app = await bootServer('default');
    const spy = vi.spyOn(app.log, 'info');
    const res = await app.inject({ method: 'GET', url: '/nao-existe?x=1' });
    expect(res.statusCode).toBe(404);
    expect(reqLines(spy)).toHaveLength(0);
  });
});
