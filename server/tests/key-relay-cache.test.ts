// GET /key-relay/status: na nuvem (indisponível) o status pode ser cacheado pelo
// navegador, no bundle (relay disponível) não. CORS com origem explícita não
// pode impedir o cache de uma resposta GET simples.
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-keyrelay-'));
let seq = 0;

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
let app: App | null = null;

async function bootServer(keyRelayAvailable: boolean): Promise<App> {
  vi.resetModules();
  seq += 1;
  process.env.TELEMETRY_ENABLED = 'false';
  process.env.GEO_ENABLED = 'false';
  process.env.LOG_LEVEL = 'silent';
  process.env.KEY_RELAY_AVAILABLE = keyRelayAvailable ? 'true' : 'false';
  process.env.CORS_ORIGIN = 'https://site.example.test';
  process.env.ANALYTICS_DB_PATH = path.join(dataDir, `kr-${seq}.db`);
  const { createServer } = await import('../src/server.js');
  return createServer();
}

afterEach(async () => {
  if (app) await app.close();
  app = null;
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe('GET /key-relay/status cache', () => {
  it('relay indisponível (nuvem): cacheável por 10 min', async () => {
    app = await bootServer(false);
    const res = await app.inject({ method: 'GET', url: '/key-relay/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: false, active: false, roomId: null });
    expect(res.headers['cache-control']).toBe('public, max-age=600');
  });

  it('relay disponível (bundle): nunca cacheia', async () => {
    app = await bootServer(true);
    const res = await app.inject({ method: 'GET', url: '/key-relay/status' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ available: true });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('CORS com origem explícita não remove o cache de um GET simples', async () => {
    app = await bootServer(false);
    const res = await app.inject({
      method: 'GET',
      url: '/key-relay/status',
      headers: { origin: 'https://site.example.test' }
    });
    expect(res.headers['access-control-allow-origin']).toBe('https://site.example.test');
    expect(res.headers['cache-control']).toBe('public, max-age=600');
  });
});
