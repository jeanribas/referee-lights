// Utilitários compartilhados da bateria e2e. Tudo aponta para a API LOCAL
// (E2E_API_URL); scripts de terceiros são bloqueados para que nenhum teste
// gere tráfego externo nem dependa da internet.
import { expect, test as base, type Page, type BrowserContext } from '@playwright/test';
import { io, type Socket } from 'socket.io-client';

import { getMessages } from '../../src/lib/i18n/messages';

export const API_BASE_URL = process.env.E2E_API_URL ?? 'http://localhost:3333';
export const LOCALES = ['pt-BR', 'en-US', 'es-ES'] as const;
type Locale = (typeof LOCALES)[number];
export const JUDGES = ['left', 'center', 'right'] as const;
export type Judge = (typeof JUDGES)[number];

export const msg = (locale: Locale) => getMessages(locale);

/** Indicador de conexão da tela (ConnectionStatus) no estado "conectado" — independe do texto. */
export const connectedBadge = (page: Page) => page.locator('[data-connection="connected"]');

export interface RoomResponse {
  roomId: string;
  adminPin: string;
  joinQRCodes: Record<Judge, { token: string }>;
}

/** Prefixo de rota do locale (pt-BR é o padrão, sem prefixo). */
export function localePath(locale: Locale, path: string) {
  return locale === 'pt-BR' ? path : `/${locale}${path === '/' ? '' : path}`;
}

export async function createRoom(locale?: Locale): Promise<RoomResponse> {
  const res = await fetch(`${API_BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(locale ? { locale } : {})
  });
  expect(res.status).toBe(201);
  return (await res.json()) as RoomResponse;
}

export const urls = {
  admin: (r: RoomResponse) => `/admin?roomId=${r.roomId}&pin=${r.adminPin}`,
  display: (r: RoomResponse) => `/display?roomId=${r.roomId}&pin=${r.adminPin}`,
  legend: (r: RoomResponse, extra = '') => `/legend?roomId=${r.roomId}&pin=${r.adminPin}${extra}`,
  timer: (r: RoomResponse) => `/timer?roomId=${r.roomId}&pin=${r.adminPin}`,
  ref: (r: RoomResponse, judge: Judge) => `/ref/${judge}?roomId=${r.roomId}&token=${r.joinQRCodes[judge].token}`
};

// Hosts/caminhos de terceiros que o _app injeta no site público.
const BLOCKED = [/clarity\.ms/, /\/_vercel\//, /\/_a\//, /vercel-insights/, /vercel-scripts/];

/** Bloqueia terceiros e protege contra qualquer host de produção. */
async function isolateNetwork(context: BrowserContext) {
  await context.route(
    (url) => BLOCKED.some((re) => re.test(url.href)),
    (route) => route.fulfill({ status: 204, body: '' })
  );
  // Exceção só para o alvo passado de propósito (bateria pós-deploy contra
  // produção: E2E_BASE_URL / E2E_API_URL); qualquer outro host de produção
  // continua bloqueado.
  const targets = [process.env.E2E_BASE_URL, process.env.E2E_API_URL]
    .filter((u): u is string => Boolean(u))
    .map((u) => new URL(u).host);
  await context.route(
    (url) => /refereelights\.app|assist\.com\.br/.test(url.host) && !targets.includes(url.host),
    (route) => route.abort('blockedbyclient')
  );
}

interface PageIssues {
  console: string[];
  failed: string[];
}

/** Captura erros de console, exceções e requisições falhas de uma página. */
function watchPage(page: Page, issues: PageIssues) {
  page.on('console', (m) => {
    if (m.type() === 'error') issues.console.push(`${page.url()} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => issues.console.push(`${page.url()} :: pageerror ${e.message}`));
  page.on('requestfailed', (r) => {
    const failure = r.failure()?.errorText ?? '';
    // navegação cancelada por troca de rota/locale não é falha real
    // ("cancelled" é como o WebKit chama o mesmo aborto)
    if (/ERR_ABORTED|blockedbyclient|NS_BINDING_ABORTED|^cancelled$/.test(failure)) return;
    issues.failed.push(`${r.method()} ${r.url()} :: ${failure}`);
  });
  page.on('response', (r) => {
    const url = r.url();
    if (r.status() >= 400 && !BLOCKED.some((re) => re.test(url))) {
      issues.failed.push(`${r.status()} ${r.request().method()} ${url}`);
    }
  });
}

/**
 * Fixture: toda página do contexto é isolada da rede externa e monitorada.
 * Ao final, o teste falha se houve erro de console/requisição — exceto o que
 * o próprio teste declarar como esperado em `allowIssue`.
 */
export const test = base.extend<{ issues: PageIssues; allowIssue: (re: RegExp) => void }>({
  issues: async ({ context }, use) => {
    const issues: PageIssues = { console: [], failed: [] };
    await isolateNetwork(context);
    context.on('page', (p) => watchPage(p, issues));
    await use(issues);
  },
  allowIssue: [
    async ({ issues }, use, testInfo) => {
      const allowed: RegExp[] = [];
      await use((re) => allowed.push(re));
      if (testInfo.status !== testInfo.expectedStatus) return;
      const keep = (s: string) => !allowed.some((re) => re.test(s));
      expect.soft(issues.console.filter(keep), 'erros de console').toEqual([]);
      expect.soft(issues.failed.filter(keep), 'requisições falhas').toEqual([]);
    },
    { auto: true }
  ]
});

export { expect };

/** Abre uma página nova já monitorada (o fixture registra o listener). */
export async function open(context: BrowserContext, path: string) {
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/** Cliente socket direto (eventos sem botão na UI: ready/release/clear). */
export async function adminSocket(room: RoomResponse): Promise<Socket> {
  const socket = io(API_BASE_URL, { transports: ['websocket'], forceNew: true, reconnection: false });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  const ack = await socket
    .timeout(5000)
    .emitWithAck('client:register', { role: 'admin', roomId: room.roomId, pin: room.adminPin });
  expect(ack).toEqual({ ok: true });
  return socket;
}

export async function emitAck(socket: Socket, event: string, ...args: unknown[]) {
  return socket.timeout(5000).emitWithAck(event, ...args);
}

/** Botão GOOD LIFT / cartões do console do árbitro. */
export function refButtons(page: Page) {
  const main = page.locator('main');
  return {
    valid: page.getByRole('button', { name: 'GOOD LIFT' }),
    // os cartões mostram 1/2/3 ou ✓ quando ativos; são os 3 últimos botões do bloco de votos
    card: (n: 1 | 2 | 3) => main.locator('section').last().locator('button').nth(n)
  };
}

/** Quadrados das luzes na ordem esquerda/centro/direita. */
