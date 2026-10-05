import { useRouter } from 'next/router';
import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * true só depois que a página hidratou E o Next leu a URL. O HTML é gerado
 * sem os parâmetros (roomId, pin...), então decidir "faltou sala/PIN" antes
 * disso fazia toda tela piscar uma mensagem de erro ou a tela de login ao
 * recarregar. Até ficar pronto, as telas mostram só o fundo.
 */
export function useRouterReady() {
  const router = useRouter();
  // false no servidor e na hidratação, true depois (sem efeito nem re-render extra)
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return hydrated && router.isReady;
}
