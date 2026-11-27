// Origem nas rotas públicas de rastreio: origem fora da lista, ausente ou
// parecida (sufixo, esquema, porta) responde 204 sem gravar; lista vazia aceita
// como antes; contador de descartes com no máximo 1 linha por minuto.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  exactOrigin,
  isTrackOriginAllowed,
  originHostOf,
  parseTrackAllowedOrigins,
  sanitizeLogOrigin,
  TrackRejectCounter,
  type TrackRejectLine
} from '../src/track-origin.js';
import { buildRequestLine } from '../src/request-log.js';

const SITE = 'https://refereelights.app';
const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

describe('lista e origem (puro)', () => {
  it('lista separada por vírgula, sem barra final e sem vazios', () => {
    expect(parseTrackAllowedOrigins(' https://refereelights.app/ , ,http://localhost:3000')).toEqual([
      'https://refereelights.app',
      'http://localhost:3000'
    ]);
    expect(parseTrackAllowedOrigins(undefined)).toEqual([]);
    expect(parseTrackAllowedOrigins('')).toEqual([]);
  });

  it('Origin só vale no formato esquema + host + porta', () => {
    expect(exactOrigin('https://refereelights.app')).toBe('https://refereelights.app');
    expect(exactOrigin('https://refereelights.app/caminho')).toBeNull();
    expect(exactOrigin('null')).toBeNull();
    expect(exactOrigin(undefined)).toBeNull();
  });

  it('lista vazia aceita qualquer origem, inclusive ausente', () => {
    expect(isTrackOriginAllowed(undefined, [])).toBe(true);
    expect(isTrackOriginAllowed('https://evil.example', [])).toBe(true);
  });

  it('lista definida: só casamento exato', () => {
    const allowed = [SITE];
    expect(isTrackOriginAllowed(SITE, allowed)).toBe(true);
    expect(isTrackOriginAllowed(undefined, allowed)).toBe(false);
    expect(isTrackOriginAllowed('https://evil.example', allowed)).toBe(false);
    expect(isTrackOriginAllowed('https://refereelights.app.evil.com', allowed)).toBe(false);
    expect(isTrackOriginAllowed('http://refereelights.app', allowed)).toBe(false);
    expect(isTrackOriginAllowed('https://refereelights.app:8443', allowed)).toBe(false);
  });

  it('item inválido na lista nunca casa (falha fechada)', () => {
    expect(isTrackOriginAllowed('https://refereelights.app', ['refereelights.app'])).toBe(false);
  });

  it('hostname gravado só quando a origem é válida', () => {
    expect(originHostOf('https://refereelights.app')).toBe('refereelights.app');
    expect(originHostOf('https://refereelights.app:443')).toBe('refereelights.app');
    expect(originHostOf('https://a.b/c')).toBe('');
    expect(originHostOf('null')).toBe('');
    expect(originHostOf(undefined)).toBe('');
  });

  it('origem para log: cortada em 100 chars e só [a-z0-9.:/-]', () => {
    expect(sanitizeLogOrigin('https://evil.example/<script>"')).toBe('https://evil.example/script');
    expect(sanitizeLogOrigin(`https://${'a'.repeat(200)}`)).toHaveLength(100);
    expect(sanitizeLogOrigin(undefined)).toBe('');
  });
});

describe('contador de descartes', () => {
  it('no máximo uma linha por minuto, com n acumulado', () => {
    const lines: TrackRejectLine[] = [];
    const counter = new TrackRejectCounter((line) => lines.push(line));
    const t0 = 1_000_000;

    counter.record('https://evil.example', t0);
    expect(lines).toEqual([{ event: 'track_rejected', n: 1, amostraOrigin: 'https://evil.example' }]);

    counter.record('https://evil.example', t0 + 1_000);
    counter.record(undefined, t0 + 30_000);
    counter.record('https://outro.example', t0 + 59_999);
    expect(lines).toHaveLength(1);

    counter.record('https://ultimo.example/x?y', t0 + 60_000);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toEqual({ event: 'track_rejected', n: 4, amostraOrigin: 'https://ultimo.example/xy' });
  });
});

describe('log compacto: campo o', () => {
  const base = {
    method: 'POST',
    status: 204,
    elapsedMs: 1,
    ipHash: 'h',
    userAgent: 'x',
    host: 'app.example.test',
    datacenter: false
  };

  it('aparece em /track/* com origin sanitizado', () => {
    const line = buildRequestLine({ ...base, url: '/track/page', origin: 'https://evil.example/<x>' });
    expect(line.o).toBe('https://evil.example/x');
  });

  it('fica de fora em outras rotas', () => {
    const line = buildRequestLine({ ...base, url: '/rooms/ABCD', origin: SITE });
    expect(line).not.toHaveProperty('o');
  });
});

// Rotas: a lista é lida a cada requisição, então cada bloco ajusta a config.
const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-track-origin-'));
const dbPath = path.join(dataDir, 'analytics.db');
process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';
process.env.TRUST_PROXY_HOPS = '1';
process.env.ANALYTICS_DB_PATH = dbPath;

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
let app: App;
let cfg: typeof import('../src/config.js')['config'];

let ipSeq = 0;
function freshIp() {
  ipSeq += 1;
  return `10.88.${Math.floor(ipSeq / 250)}.${ipSeq % 250}`;
}

interface LogRow {
  eventType: string;
  originHost: string;
  isBot: number;
}

function rows(eventType: string): LogRow[] {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .prepare('SELECT event_type AS eventType, origin_host AS originHost, is_bot AS isBot FROM access_logs WHERE event_type = ? ORDER BY id')
      .all(eventType) as LogRow[];
  } finally {
    db.close();
  }
}

function post(url: string, headers: Record<string, string>, payload: Record<string, unknown>) {
  return app.inject({
    method: 'POST',
    url,
    headers: { 'x-forwarded-for': freshIp(), 'user-agent': UA_BROWSER, ...headers },
    payload
  });
}

beforeAll(async () => {
  const { createServer } = await import('../src/server.js');
  ({ config: cfg } = await import('../src/config.js'));
  app = await createServer();
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('POST /track/page com TRACK_ALLOWED_ORIGINS definida', () => {
  beforeEach(() => {
    cfg.TRACK_ALLOWED_ORIGINS = [SITE];
  });

  it('Origin ausente → 204 sem linha', async () => {
    const before = rows('page_view').length;
    const res = await post('/track/page', {}, { path: '/timer/ABCD' });
    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    expect(rows('page_view')).toHaveLength(before);
  });

  it('Referer do site sem Origin não conta como origem → 204 sem linha', async () => {
    const before = rows('page_view').length;
    const res = await post('/track/page', { referer: `${SITE}/` }, { path: '/' });
    expect(res.statusCode).toBe(204);
    expect(rows('page_view')).toHaveLength(before);
  });

  it('https://evil.example → 204 sem linha', async () => {
    const before = rows('page_view').length;
    const res = await post('/track/page', { origin: 'https://evil.example' }, { path: '/' });
    expect(res.statusCode).toBe(204);
    expect(rows('page_view')).toHaveLength(before);
  });

  it('https://refereelights.app.evil.com → 204 sem linha', async () => {
    const before = rows('page_view').length;
    const res = await post('/track/page', { origin: 'https://refereelights.app.evil.com' }, { path: '/' });
    expect(res.statusCode).toBe(204);
    expect(rows('page_view')).toHaveLength(before);
  });

  it('esquema ou porta diferente → 204 sem linha', async () => {
    const before = rows('page_view').length;
    expect((await post('/track/page', { origin: 'http://refereelights.app' }, { path: '/' })).statusCode).toBe(204);
    expect((await post('/track/page', { origin: 'https://refereelights.app:8443' }, { path: '/' })).statusCode).toBe(204);
    expect(rows('page_view')).toHaveLength(before);
  });

  it('origem certa → 200 com origin_host gravado', async () => {
    const res = await post('/track/page', { origin: SITE }, { path: '/timer/WXYZ' });
    expect(res.statusCode).toBe(200);
    const last = rows('page_view').at(-1)!;
    expect(last).toMatchObject({ originHost: 'refereelights.app', isBot: 0 });
  });

  it('robô por User-Agent com origem certa → linha com is_bot = 1', async () => {
    const res = await post('/track/page', { origin: SITE, 'user-agent': 'curl/8.4.0' }, { path: '/' });
    expect(res.statusCode).toBe(200);
    expect(rows('page_view').at(-1)).toMatchObject({ originHost: 'refereelights.app', isBot: 1 });
  });

  it('UA vazio com origem certa → robô', async () => {
    const res = await post('/track/page', { origin: SITE, 'user-agent': '' }, { path: '/' });
    expect(res.statusCode).toBe(200);
    expect(rows('page_view').at(-1)).toMatchObject({ isBot: 1 });
  });
});

describe('POST /track/click com TRACK_ALLOWED_ORIGINS definida', () => {
  beforeEach(() => {
    cfg.TRACK_ALLOWED_ORIGINS = [SITE];
  });

  it('origem errada ou ausente → 204 sem linha', async () => {
    const before = rows('link_click').length;
    expect((await post('/track/click', {}, { url: 'https://exemplo.test/' })).statusCode).toBe(204);
    expect((await post('/track/click', { origin: 'https://evil.example' }, { url: 'https://exemplo.test/' })).statusCode).toBe(204);
    expect(rows('link_click')).toHaveLength(before);
  });

  it('origem certa → 200 com linha', async () => {
    const before = rows('link_click').length;
    const res = await post('/track/click', { origin: SITE }, { url: 'https://exemplo.test/' });
    expect(res.statusCode).toBe(200);
    expect(rows('link_click')).toHaveLength(before + 1);
  });
});

describe('POST /track/page com TRACK_ALLOWED_ORIGINS vazia', () => {
  beforeEach(() => {
    cfg.TRACK_ALLOWED_ORIGINS = [];
  });

  it('Origin ausente continua sendo aceita, sem origin_host', async () => {
    const res = await post('/track/page', {}, { path: '/timer/ABCD' });
    expect(res.statusCode).toBe(200);
    expect(rows('page_view').at(-1)).toMatchObject({ originHost: '' });
  });

  it('qualquer origem é aceita e o hostname válido é gravado', async () => {
    const res = await post('/track/page', { origin: 'https://evil.example' }, { path: '/' });
    expect(res.statusCode).toBe(200);
    expect(rows('page_view').at(-1)).toMatchObject({ originHost: 'evil.example' });
  });
});
