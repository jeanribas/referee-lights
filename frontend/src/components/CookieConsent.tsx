import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { getMessages } from '@/lib/i18n/messages';
import type { AppLocale } from '@/lib/i18n/config';

/**
 * Barra de consentimento própria, trilíngue.
 *
 * O tracker (`/_a/s.js`, servido por stats.assist.com.br) traz um banner de
 * fallback — o próprio script o descreve como "só microsites, sem consent
 * conhecido". Ele tem o texto fixo em português e não aceita atributo de
 * idioma. Num site trilíngue isso não serve, então `_app.tsx` passa
 * data-banner="0" e a barra passa a ser esta.
 *
 * O estado continua sendo do tracker: gravamos pela API pública
 * `window.aa("consent", ...)` e lemos a mesma chave que ele lê, para que quem
 * já escolheu não veja a barra de novo. Nada de duplicar a regra de decisão.
 */

const CONSENT_KEY = 'aa_consent';

declare global {
  interface Window {
    aa?: (cmd: string, a?: unknown, b?: unknown) => void;
  }
}

function storedConsent(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_KEY);
  } catch {
    // Safari em modo privado lança ao tocar em localStorage. Sem leitura não há
    // como saber se já houve escolha; não mostrar a barra é o lado seguro.
    return 'unavailable';
  }
}

export function CookieConsent() {
  const router = useRouter();
  const locale = (router.locale ?? 'pt-BR') as AppLocale;
  const messages = getMessages(locale).consent;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Só depois da montagem: o estado de consentimento é por navegador, então
    // renderizar no servidor daria divergência de hidratação.
    if (storedConsent() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const decide = (choice: 'granted' | 'denied') => {
    // O tracker pode ainda não ter carregado (strategy="afterInteractive").
    // Nesse caso grava direto na mesma chave: quando ele subir, lê e respeita.
    if (typeof window.aa === 'function') window.aa('consent', choice);
    else {
      try {
        window.localStorage.setItem(CONSENT_KEY, choice);
      } catch {
        /* modo privado: a escolha vale só para esta sessão */
      }
    }
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label={messages.ariaLabel}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#111318',
        color: '#f7f8fa',
        font: '14px/1.5 system-ui, sans-serif',
        padding: '14px 16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderTop: '1px solid rgba(255,255,255,.12)'
      }}
    >
      <span>{messages.text}</span>
      <button
        type="button"
        onClick={() => decide('granted')}
        style={{
          background: '#3987e5',
          color: '#fff',
          border: 0,
          borderRadius: 8,
          padding: '8px 16px',
          font: 'inherit',
          cursor: 'pointer'
        }}
      >
        {messages.accept}
      </button>
      <button
        type="button"
        onClick={() => decide('denied')}
        style={{
          background: 'transparent',
          color: '#a8b0bd',
          border: '1px solid rgba(255,255,255,.25)',
          borderRadius: 8,
          padding: '8px 16px',
          font: 'inherit',
          cursor: 'pointer'
        }}
      >
        {messages.reject}
      </button>
    </div>
  );
}
