import type { GetStaticPaths, GetStaticProps } from 'next';

import { ConnectionStatus } from '@/components/ConnectionStatus';
import { FooterBadges } from '@/components/FooterBadges';
import { Seo } from '@/components/Seo';
import { getMessages } from '@/lib/i18n/messages';
import { compatData, COMPAT_SCRIPT_VERSION, CompatLostBanner, CompatNoSleepVideo, CompatThirdParty } from '@/lib/compat-page';
import type { Judge } from '@/types/state';

/**
 * Console do árbitro — tela UNIVERSAL.
 *
 * Árbitros usam o próprio celular, muitas vezes velho e sem atualização. Por
 * isso esta página não carrega o React no navegador (unstable_runtimeJS:
 * false): o HTML vem pronto do servidor, com as mesmas classes de sempre, e a
 * parte viva (conexão, votos, cartões, tempo) é o script escrito à mão em
 * public/compat/ref.js + rl.js, que roda em qualquer navegador com JavaScript.
 * O visual é o mesmo da versão React — conferido pixel a pixel.
 */
export const config = { unstable_runtimeJS: false };

const JUDGES: Judge[] = ['left', 'center', 'right'];

type Props = { judge: Judge | null; locale: string };

export const getStaticPaths: GetStaticPaths = async ({ locales = [] }) => ({
  paths: locales.flatMap((locale) => JUDGES.map((judge) => ({ params: { judge }, locale }))),
  // Posição desconhecida (/ref/xyz) ainda responde, com a mensagem de rota inválida
  fallback: 'blocking'
});

export const getStaticProps: GetStaticProps<Props> = async ({ params, locale }) => {
  const raw = typeof params?.judge === 'string' ? params.judge : '';
  const judge = (JUDGES as string[]).includes(raw) ? (raw as Judge) : null;
  return { props: { judge, locale: locale ?? 'pt-BR' } };
};

const CARD_OPTIONS: Array<{ value: 1 | 2 | 3; color: string; glyph: string }> = [
  { value: 1, color: 'bg-red-500 text-white', glyph: '1' },
  { value: 2, color: 'bg-blue-500 text-white', glyph: '2' },
  { value: 3, color: 'bg-yellow-400 text-slate-900', glyph: '3' }
];

// Classes de estado trocadas pelo public/compat/ref.js. Ficam escritas por
// inteiro aqui para o Tailwind gerá-las (ele lê o texto do arquivo):
//   ativo: ring-4 ring-white/70 · início ativo: ring-4 ring-emerald-300/60
//   pausa ativa: ring-4 ring-amber-200/70 · inativo: opacity-80
const INACTIVE = 'opacity-80';
const PAUSE_ACTIVE = 'ring-4 ring-amber-200/70';

export default function RefereeConsole({ judge, locale }: Props) {
  const messages = getMessages(locale);
  const refereeMessages = messages.referee;

  if (!judge) {
    return (
      <>
        <Seo
          title="Referee Lights · Console"
          description={
            refereeMessages.metaDescription ??
            'Console móvel do árbitro com ações GOOD/NO LIFT e cartões IPF, sincronizado ao painel Referee Lights.'
          }
          canonicalPath="/ref"
          noIndex
        />
        <p className="min-h-screen bg-black p-6 text-slate-100">{refereeMessages.invalidRoute}</p>
      </>
    );
  }

  const isCenter = judge === 'center';
  const judgeTitle = isCenter
    ? refereeMessages.center.title
    : judge === 'left'
      ? refereeMessages.side.leftTitle
      : refereeMessages.side.rightTitle;
  const data = compatData(locale, {
    judge,
    designHeight: isCenter ? 780 : 620,
    connection: messages.common.connection
  });

  return (
    <>
      <Seo
        title={`Referee Lights · ${judgeTitle}`}
        description={
          refereeMessages.metaDescription ??
          'Console móvel do árbitro com ações GOOD/NO LIFT, cartões IPF e integração em tempo real com o painel Referee Lights.'
        }
        canonicalPath={`/ref/${judge}`}
        noIndex
      />
      <div id="rl-console">{isCenter ? <CenterLayout locale={locale} /> : <SideLayout judge={judge} locale={locale} />}</div>
      <div id="rl-missing" style={{ display: 'none' }}>
        <MissingRefCredentials judge={judge} locale={locale} />
      </div>
      <CompatLostBanner locale={locale} />
      <CompatNoSleepVideo />
      <script id="rl-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />
      <script defer src={`/compat/rl.js?v=${COMPAT_SCRIPT_VERSION}`} />
      <script defer src={`/compat/ref.js?v=${COMPAT_SCRIPT_VERSION}`} />
      <CompatThirdParty />
    </>
  );
}

function VoteButtons({ label }: { label: string }) {
  return (
    <>
      <button
        data-rl="valid"
        disabled
        className={`w-full rounded-2xl bg-white py-9 text-2xl font-bold uppercase tracking-[0.3em] text-slate-900 shadow-xl transition ${INACTIVE}`}
      >
        {label}
      </button>
      {CARD_OPTIONS.map((option) => (
        <button
          key={option.value}
          data-rl="card"
          data-card={option.value}
          data-glyph={option.glyph}
          disabled
          className={`flex w-full items-center justify-center rounded-2xl py-9 text-2xl font-bold uppercase tracking-[0.3em] shadow-xl transition ${option.color} ${INACTIVE}`}
        >
          {option.glyph}
        </button>
      ))}
    </>
  );
}

function CenterLayout({ locale }: { locale: string }) {
  const messages = getMessages(locale).referee;
  const commonMessages = getMessages(locale).common;
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950">
      <main
        data-rl="fit"
        className="flex h-screen flex-col gap-3 bg-slate-950 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 text-white"
      >
        <header className="flex flex-col items-center gap-1 text-xs uppercase tracking-[0.5em] text-slate-400">
          <span>{messages.center.title}</span>
          <ConnectionStatus status="connecting" messages={commonMessages} className="normal-case tracking-normal" />
        </header>

        <section className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-[#1F232A] p-4 shadow-xl">
          <div className="flex flex-col items-center gap-1">
            <span className="text-xs uppercase tracking-[0.4em] text-slate-400">{messages.center.timeLabel}</span>
            <div data-rl="time" className="text-4xl font-bold text-white">
              0:00
            </div>
          </div>
          <div className="flex w-full flex-wrap justify-center gap-3">
            <button
              data-rl="start"
              disabled
              className={`flex-1 transform rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-900 transition duration-150 active:scale-95 active:brightness-95 ${INACTIVE}`}
            >
              {messages.center.start}
            </button>
            <button
              data-rl="pause"
              disabled
              className={`flex-1 transform rounded-xl bg-amber-400 px-4 py-3 font-semibold text-slate-900 transition duration-150 active:scale-95 active:brightness-95 ${PAUSE_ACTIVE}`}
            >
              {messages.center.pause}
            </button>
            <button
              data-rl="reset"
              disabled
              className="flex-1 transform rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition duration-150 active:scale-95 active:brightness-95"
            >
              {messages.center.reset}
            </button>
          </div>
        </section>

        <section data-rl="votes" className="flex min-h-0 flex-1 flex-col gap-3">
          <VoteButtons label={messages.center.valid} />
        </section>

        <div className="mt-2 opacity-60" data-rl="footer">
          <FooterBadges />
        </div>
      </main>
    </div>
  );
}

function SideLayout({ judge, locale }: { judge: Judge; locale: string }) {
  const messages = getMessages(locale).referee;
  const commonMessages = getMessages(locale).common;
  const sideLabel = judge === 'left' ? messages.side.leftTitle : messages.side.rightTitle;
  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950">
      <main
        data-rl="fit"
        className="flex h-screen flex-col gap-4 bg-slate-950 px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-6 text-slate-100"
      >
        <header className="flex flex-col items-center gap-1 text-center text-xs uppercase tracking-[0.4em] text-slate-400">
          <span>{sideLabel}</span>
          <ConnectionStatus status="connecting" messages={commonMessages} className="normal-case tracking-normal" />
        </header>

        <section data-rl="votes" className="flex min-h-0 flex-1 flex-col gap-3">
          <VoteButtons label={messages.side.valid} />
        </section>
        <div className="mt-2 opacity-60" data-rl="footer">
          <FooterBadges />
        </div>
      </main>
    </div>
  );
}

function MissingRefCredentials({ judge, locale }: { judge: Judge; locale: string }) {
  const messages = getMessages(locale).referee;
  const description = messages.missing.description.replace('{judge}', judge);
  return (
    // div, não main: fica no HTML (escondida) junto do console, e só pode
    // haver um <main> na página
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-white">
      <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">{messages.missing.title}</h1>
      <p className="max-w-md text-sm text-slate-300">{description}</p>
      <div className="mt-2 opacity-60">
        <FooterBadges />
      </div>
    </div>
  );
}
