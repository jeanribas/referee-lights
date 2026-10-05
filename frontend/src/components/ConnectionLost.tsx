import { useRouter } from 'next/router';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { connectionStore } from '@/hooks/useRoomSocket';

/**
 * Aviso global de conexão perdida (todas as telas de sala: admin, display,
 * legenda, timer e árbitros). Sem ele a tela seguia mostrando o último estado
 * como se estivesse tudo certo — ninguém percebia que o servidor tinha sido
 * fechado ou a rede caído. Aparece após 2 s sem conexão (não pisca em
 * reconexões rápidas) e some sozinho quando volta.
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
  if (!show && !roomGone) return null;
  return (
    <div
      role="alert"
      data-connection-lost
      className="fixed left-1/2 top-4 z-[60] flex max-w-[95vw] -translate-x-1/2 items-center gap-3 rounded-full bg-red-600 px-6 py-3 text-center text-base font-bold uppercase tracking-[0.15em] text-white shadow-2xl"
    >
      <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-white" aria-hidden="true" />
      {roomGone ? t.room : `${t.lost} — ${t.retry}`}
    </div>
  );
}
