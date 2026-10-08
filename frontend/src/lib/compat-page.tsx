import { CONNECTION_LOST_TEXTS } from '@/components/ConnectionLost';
import { APP_LOCALES, DEFAULT_LOCALE } from '@/lib/i18n/config';
import { getMessages } from '@/lib/i18n/messages';
import packageJson from '../../package.json';

/**
 * Peças comuns das telas universais (árbitro e display): páginas sem React
 * no navegador, cuja parte viva é public/compat/*.js (ver rl.js).
 */

/** Muda a cada versão: o navegador não usa um rl.js velho do cache. */
export const COMPAT_SCRIPT_VERSION = packageJson.version;

const IS_OFFLINE_BUNDLE = process.env.NEXT_PUBLIC_OFFLINE_BUNDLE === '1';

/**
 * Dados que o script precisa, gravados no HTML (<script type=application/json>).
 * `defaultBase` repete a regra de lib/config.ts para URL vazia: na web a API
 * fica na porta 3333 do mesmo host.
 */
export function compatData(locale: string, extra: Record<string, unknown>) {
  const messages = getMessages(locale);
  const lost = CONNECTION_LOST_TEXTS[locale.slice(0, 2) as keyof typeof CONNECTION_LOST_TEXTS] ?? CONNECTION_LOST_TEXTS.pt;
  return {
    locale,
    locales: APP_LOCALES,
    defaultLocale: DEFAULT_LOCALE,
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? '',
    wsUrl: process.env.NEXT_PUBLIC_WS_URL ?? '',
    defaultBase: 'port3333',
    trackPages: true,
    offline: IS_OFFLINE_BUNDLE,
    lost,
    errors: messages.common.errors,
    ...extra
  };
}

/**
 * Aviso "Sem conexão" — o mesmo HTML/classes do components/ConnectionLost.tsx,
 * escondido; o rl.js mostra e troca o texto.
 */
export function CompatLostBanner({ locale }: { locale: string }) {
  const t = CONNECTION_LOST_TEXTS[locale.slice(0, 2) as keyof typeof CONNECTION_LOST_TEXTS] ?? CONNECTION_LOST_TEXTS.pt;
  return (
    <div
      id="rl-lost"
      role="alert"
      data-connection-lost
      style={{ display: 'none' }}
      className="fixed left-1/2 top-3 z-[60] flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-2.5 rounded-xl border border-red-500/60 bg-slate-950 px-4 py-2.5 text-[15px] font-semibold leading-tight text-white shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
    >
      <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      <span>
        <span id="rl-lost-text" />
        <span id="rl-lost-retry" className="hidden font-normal text-slate-400 sm:inline">
          {' · '}
          {t.retry}
        </span>
      </span>
    </div>
  );
}

/** Vídeo mudo da tela sempre acesa (fallback da Wake Lock), como o useWakeLock cria. */
export function CompatNoSleepVideo() {
  return (
    <video
      id="rl-nosleep"
      playsInline
      muted
      title="No Sleep"
      preload="auto"
      style={{ position: 'fixed', width: 1, height: 1, opacity: 0, pointerEvents: 'none', top: 0, left: 0 }}
    >
      <source type="video/webm" src="/compat/nosleep.webm" />
      <source type="video/mp4" src="/compat/nosleep.mp4" />
    </video>
  );
}

/**
 * Scripts de terceiros que o _app põe em todas as telas da web (não no
 * pacote offline). Nas telas universais o _app não roda no navegador, então
 * eles entram aqui como HTML puro.
 */
export function CompatThirdParty() {
  if (IS_OFFLINE_BUNDLE) return null;
  return (
    <>
      <script defer src="/_vercel/insights/script.js" data-sdkn="@vercel/analytics/react" />
      <script
        dangerouslySetInnerHTML={{
          __html:
            '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w1gy8xnf5m");'
        }}
      />
    </>
  );
}
