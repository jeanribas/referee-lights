import { useRouter } from 'next/router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { connectionStore } from '@/hooks/useRoomSocket';
import { getMessages } from '@/lib/i18n/messages';

/**
 * Aviso global de conexão perdida (todas as telas de sala: admin, display,
 * legenda, timer e árbitros). Sem ele a tela seguia mostrando o último estado
 * como se estivesse tudo certo — ninguém percebia que o servidor tinha sido
 * fechado ou a rede caído. Aparece após 2 s sem conexão (não pisca em
 * reconexões rápidas) e some sozinho quando volta.
 *
 * É também o único aviso de erro da sala (PIN inválido, link revogado...):
 * cada tela tinha uma pílula própria que aparecia junto e por baixo deste.
 * O admin fica de fora: ele volta para a tela de acesso com o erro.
 */
const TEXTS = {
  pt: { lost: 'Sem conexão com o servidor', retry: 'reconectando…', room: 'Sessão encerrada ou inexistente' },
  en: { lost: 'No connection to the server', retry: 'reconnecting…', room: 'Session closed or not found' },
  es: { lost: 'Sin conexión con el servidor', retry: 'reconectando…', room: 'Sesión cerrada o inexistente' }
};

export function ConnectionLost() {
  const router = useRouter();
  const t = TEXTS[(router.locale ?? 'pt').slice(0, 2) as keyof typeof TEXTS] ?? TEXTS.pt;
  const { active, status, error } = useSyncExternalStore(connectionStore.subscribe, connectionStore.get, connectionStore.getServer);
  const [show, setShow] = useState(false);
  const everConnected = useRef(false);

  useEffect(() => {
    if (!active || status === 'connected') {
      if (status === 'connected') everConnected.current = true;
      setShow(false);
      return;
    }
    // Antes da 1ª conexão espera mais (a página acabou de abrir)
    const id = setTimeout(() => setShow(true), everConnected.current ? 2000 : 6000);
    return () => clearTimeout(id);
  }, [active, status]);

  const roomGone = active && error === 'room_not_found';
  // Erro conhecido da sala aparece na hora, traduzido; erro cru do socket não
  const knownError = active && error && !roomGone && router.pathname !== '/admin'
    ? getMessages(router.locale).common.errors[error] ?? null
    : null;
  if (!show && !roomGone && !knownError) return null;
  return (
    <div
      role="alert"
      data-connection-lost
      // Aviso, não alarme: faixa escura com borda vermelha e ponto pulsando, em
      // caixa normal e numa linha só (no celular também), por cima do topo
      className="fixed left-1/2 top-3 z-[60] flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-red-500/60 bg-slate-950 px-4 py-2.5 text-[15px] font-semibold leading-tight text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span>
        {roomGone ? t.room : knownError ?? t.lost}
        {/* No celular fica só o principal; o ponto pulsando já diz que está tentando */}
        {!roomGone && !knownError && <span className="hidden font-normal text-slate-400 sm:inline"> · {t.retry}</span>}
      </span>
    </div>
  );
}
