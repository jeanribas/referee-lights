import { useRouter } from 'next/router';
import { useCallback, useEffect, useState } from 'react';

/**
 * Aviso de nova versão no /admin do pacote Windows. Só aparece para quem abre
 * o painel na máquina do servidor (o server responde só a loopback).
 *  - RefereeLights.exe: Atualizar agora / Depois / Pular esta versão (o
 *    lançador baixa, confere a assinatura e troca; com competição em
 *    andamento, instala ao fechar).
 *  - Pacote zip: só avisa e leva para a página de download.
 */

interface UpdateView {
  state: 'none' | 'available' | 'downloading' | 'ready' | 'deferred' | 'error';
  current: string;
  version?: string;
  notes?: Record<string, string>;
  canApply: boolean;
  downloadUrl?: string;
  message?: string;
}

const TEXTS = {
  pt: {
    title: (v: string) => `Nova versão disponível: ${v}`,
    apply: 'Atualizar agora',
    later: 'Depois',
    skip: 'Pular esta versão',
    download: 'Baixar',
    deferred: 'Competição em andamento: a atualização será instalada quando o Referee Lights for fechado.',
    restarting: 'Atualizando… a página volta sozinha em alguns segundos.'
  },
  en: {
    title: (v: string) => `New version available: ${v}`,
    apply: 'Update now',
    later: 'Later',
    skip: 'Skip this version',
    download: 'Download',
    deferred: 'Competition in progress: the update will be installed when Referee Lights is closed.',
    restarting: 'Updating… this page will come back in a few seconds.'
  },
  es: {
    title: (v: string) => `Nueva versión disponible: ${v}`,
    apply: 'Actualizar ahora',
    later: 'Después',
    skip: 'Omitir esta versión',
    download: 'Descargar',
    deferred: 'Competencia en curso: la actualización se instalará al cerrar Referee Lights.',
    restarting: 'Actualizando… la página volverá en unos segundos.'
  }
};

const CHECK_EVERY_MS = 10 * 60_000;

export function UpdateBanner() {
  const router = useRouter();
  const lang = (router.locale ?? 'pt-BR').slice(0, 2) as keyof typeof TEXTS;
  const t = TEXTS[lang] ?? TEXTS.pt;
  const [view, setView] = useState<UpdateView | null>(null);
  const [hidden, setHidden] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/app-update', { cache: 'no-store' });
      if (res.ok) setView(await res.json());
    } catch {
      // servidor reiniciando ou offline: tenta de novo depois
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, CHECK_EVERY_MS);
    return () => clearInterval(id);
  }, [load]);

  // Durante a troca de versão o servidor some por alguns segundos
  useEffect(() => {
    if (!restarting) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch('/health', { cache: 'no-store' });
        if (res.ok) window.location.reload();
      } catch {
        // ainda reiniciando
      }
    }, 2000);
    return () => clearInterval(id);
  }, [restarting]);

  const act = async (action: 'apply' | 'later' | 'skip') => {
    if (action === 'later') {
      setHidden(true);
      return;
    }
    try {
      const res = await fetch(`/app-update/${action}`, { method: 'POST' });
      const next = (await res.json()) as UpdateView;
      if (action === 'apply' && next.message === 'restarting') {
        setRestarting(true);
        return;
      }
      setView(next);
      if (action === 'skip') setHidden(true);
    } catch {
      setRestarting(action === 'apply');
    }
  };

  if (restarting) {
    return <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-sky-600 px-4 py-3 text-sm text-white shadow-2xl">{t.restarting}</div>;
  }
  if (hidden || !view || !view.version || !['available', 'ready', 'deferred'].includes(view.state)) return null;

  const notes = view.notes?.[lang] || view.notes?.pt || '';
  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 rounded-xl border border-sky-400/40 bg-slate-900/95 px-4 py-3 text-sm text-slate-100 shadow-2xl">
      <strong className="text-sky-300">{t.title(view.version)}</strong>
      {notes && <p className="whitespace-pre-line text-slate-300">{notes}</p>}
      {view.state === 'deferred' ? (
        <p className="text-amber-300">{t.deferred}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {view.canApply ? (
            <button type="button" className="rounded bg-sky-500 px-3 py-1 font-semibold text-slate-950" onClick={() => act('apply')}>
              {t.apply}
            </button>
          ) : view.downloadUrl ? (
            <a className="rounded bg-sky-500 px-3 py-1 font-semibold text-slate-950" href={view.downloadUrl} target="_blank" rel="noreferrer">
              {t.download}
            </a>
          ) : null}
          <button type="button" className="rounded px-3 py-1 text-slate-300 hover:bg-slate-800" onClick={() => act('later')}>
            {t.later}
          </button>
          {view.canApply && (
            <button type="button" className="rounded px-3 py-1 text-slate-400 hover:bg-slate-800" onClick={() => act('skip')}>
              {t.skip}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
