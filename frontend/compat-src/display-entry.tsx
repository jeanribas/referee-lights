/**
 * Display universal: a MESMA tela React (src/screens/DisplayScreen.tsx),
 * empacotada em ES5 por scripts/build-compat.mjs para rodar em navegador de
 * TV antigo. O que o _app faz no app normal (aviso de conexão, barreira de
 * erro, página vista) é feito aqui.
 */
import { createRoot } from 'react-dom/client';

import { ConnectionLost } from '@/components/ConnectionLost';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import DisplayScreen from '@/screens/DisplayScreen';

type CompatWindow = { RL: { data: { locale: string; sessionScript?: string }; bundleSessionScript: () => void } };
const rlData = () => (window as unknown as CompatWindow).RL.data;

const el = document.getElementById('rl-root');
if (el) {
  createRoot(el).render(
    <>
      <ErrorBoundary>
        <DisplayScreen />
      </ErrorBoundary>
      <ConnectionLost />
    </>
  );
}
// Pacote: CSS embutido na página e depois o script de sessão (como o _app)
if (rlData().sessionScript === 'inline-css') (window as unknown as CompatWindow).RL.bundleSessionScript();
