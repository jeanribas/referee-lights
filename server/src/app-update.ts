import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Aviso de nova versão no /admin do pacote (só para quem abre o painel NA
 * máquina do servidor: loopback e mesma origem).
 *
 * - Com o lançador (RefereeLights.exe): o estado e as ações (atualizar
 *   agora / depois / pular) vêm do lançador, que baixa, confere a assinatura
 *   e troca de versão.
 * - Pacote zip (sem lançador): o server consulta a versão estável publicada
 *   e só avisa, com o link para baixar.
 */

export interface UpdateView {
  state: 'none' | 'available' | 'downloading' | 'ready' | 'deferred' | 'error';
  current: string;
  version?: string;
  notes?: Record<string, string>;
  canApply: boolean;
  downloadUrl?: string;
  message?: string;
}

const DOWNLOAD_PAGE = 'https://refereelights.app/windows';
const ZIP_CHECK_TTL_MS = 6 * 3600_000;

interface Options {
  appVersion: string;
  controlUrl: string;
  token: string;
  manifestUrl: string;
  checkEnabled: boolean;
  isLoopback: (ip: string) => boolean;
}

/** Compara versões "1.3.0", "1.3.10", "1.4.0-rc.1" (sufixo < sem sufixo). */
export function compareVersions(a: string, b: string): number {
  const [ma, sa = ''] = a.split('-', 2);
  const [mb, sb = ''] = b.split('-', 2);
  const pa = ma.split('.').map((n) => Number(n) || 0);
  const pb = mb.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  if (sa === sb) return 0;
  if (!sa) return 1;
  if (!sb) return -1;
  return sa < sb ? -1 : 1;
}

export function registerAppUpdate(app: FastifyInstance, opts: Options) {
  let zipCache: { at: number; view: UpdateView } | null = null;

  // Só a própria máquina, e só a página servida por este server (um site
  // aberto no navegador não consegue disparar a atualização).
  const allowed = (request: FastifyRequest) => {
    const ip = request.socket?.remoteAddress ?? request.ip;
    if (!opts.isLoopback(ip)) return false;
    const origin = request.headers.origin;
    if (request.method !== 'GET') {
      if (typeof origin !== 'string') return false;
      try {
        const o = new URL(origin);
        return ['localhost', '127.0.0.1', '[::1]'].includes(o.hostname) && o.host === request.headers.host;
      } catch {
        return false;
      }
    }
    return true;
  };

  async function fromLauncher(path: string, method: 'GET' | 'POST'): Promise<UpdateView | null> {
    try {
      const res = await fetch(`${opts.controlUrl}${path}`, {
        method,
        headers: { 'X-Launcher-Token': opts.token },
        signal: AbortSignal.timeout(3000)
      });
      if (!res.ok) return null;
      return (await res.json()) as UpdateView;
    } catch {
      return null;
    }
  }

  async function zipView(): Promise<UpdateView> {
    const none: UpdateView = { state: 'none', current: opts.appVersion, canApply: false };
    if (!opts.checkEnabled) return none;
    if (zipCache && Date.now() - zipCache.at < ZIP_CHECK_TTL_MS) return zipCache.view;
    let view = none;
    try {
      const res = await fetch(opts.manifestUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const m = (await res.json()) as { version?: unknown; notes_pt?: unknown; notes_en?: unknown; notes_es?: unknown };
        if (typeof m.version === 'string' && compareVersions(m.version, opts.appVersion) > 0) {
          const notes: Record<string, string> = {};
          for (const l of ['pt', 'en', 'es'] as const) {
            const n = m[`notes_${l}`];
            if (typeof n === 'string') notes[l] = n.slice(0, 500);
          }
          view = { state: 'available', current: opts.appVersion, version: m.version.slice(0, 32), notes, canApply: false, downloadUrl: DOWNLOAD_PAGE };
        }
      }
    } catch {
      // offline (competição em LAN): sem aviso, tenta de novo depois
    }
    zipCache = { at: Date.now(), view };
    return view;
  }

  app.get('/app-update', async (request, reply) => {
    if (!allowed(request)) { reply.code(404); return { error: 'not_found' }; }
    if (opts.controlUrl) {
      return (await fromLauncher('/update', 'GET')) ?? { state: 'none', current: opts.appVersion, canApply: false };
    }
    return zipView();
  });

  app.post<{ Params: { action: string } }>('/app-update/:action', async (request, reply) => {
    if (!allowed(request) || !opts.controlUrl) { reply.code(404); return { error: 'not_found' }; }
    const { action } = request.params;
    if (!['apply', 'later', 'skip', 'check'].includes(action)) { reply.code(400); return { error: 'invalid_action' }; }
    const view = await fromLauncher(`/update/${action}`, 'POST');
    if (!view) { reply.code(502); return { error: 'launcher_unavailable' }; }
    return view;
  });
}
