import { getApiBaseUrl } from './config';

/**
 * Erros das telas vão para o servidor (o local no pacote, a API central na
 * web), que os junta aos erros dele. Sem dados pessoais: tipo, mensagem,
 * stack resumido, tela e código da sala.
 *
 * Limites no navegador: no máximo 10 envios por página carregada e o mesmo
 * erro (tipo + mensagem) só uma vez — um erro em loop não vira enxurrada.
 */
const MAX_REPORTS_PER_PAGE = 10;
const sent = new Set<string>();
let reports = 0;
let installed = false;

export interface ClientErrorReport {
  kind: string;
  message: string;
  stack?: string;
}

function currentScreen(): string {
  const segments = window.location.pathname.split('/').filter(Boolean);
  // Prefixo de idioma (/en-US/admin) não é tela
  if (segments[0] && /^[a-z]{2}-[A-Z]{2}$/.test(segments[0])) segments.shift();
  return segments.slice(0, 2).join('/') || 'home';
}

function currentRoomId(): string | undefined {
  const room = new URLSearchParams(window.location.search).get('roomId');
  return room ? room.slice(0, 16) : undefined;
}

export function reportClientError(report: ClientErrorReport): void {
  if (typeof window === 'undefined') return;
  const key = `${report.kind}|${report.message}`;
  if (sent.has(key) || reports >= MAX_REPORTS_PER_PAGE) return;
  sent.add(key);
  reports += 1;
  const body = JSON.stringify({
    kind: report.kind.slice(0, 64),
    message: report.message.slice(0, 300),
    stack: report.stack?.split('\n').slice(0, 6).join('\n').slice(0, 1000),
    screen: currentScreen(),
    roomId: currentRoomId()
  });
  try {
    void fetch(`${getApiBaseUrl().replace(/\/$/, '')}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => undefined);
  } catch {
    // reportar erro nunca pode gerar outro erro
  }
}

export function errorToReport(error: unknown, fallbackKind = 'Error'): ClientErrorReport {
  if (error instanceof Error) {
    return { kind: error.name || fallbackKind, message: error.message || String(error), stack: error.stack };
  }
  return { kind: fallbackKind, message: typeof error === 'string' ? error : JSON.stringify(error ?? null) ?? 'null' };
}

/** Captura global: exceções não tratadas e promessas rejeitadas sem catch. */
export function installGlobalErrorReporting(): void {
  if (typeof window === 'undefined' || installed) return;
  installed = true;
  window.addEventListener('error', (event) => {
    // Falha ao carregar <script>/<img> chega aqui sem `error`: ignora
    if (!event.error && !event.message) return;
    reportClientError(event.error ? errorToReport(event.error) : { kind: 'Error', message: event.message });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(errorToReport(event.reason, 'UnhandledRejection'));
  });
}
