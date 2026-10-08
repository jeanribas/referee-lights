import type { GetStaticProps } from 'next';

import { Seo } from '@/components/Seo';
import { compatData, COMPAT_SCRIPT_VERSION, CompatThirdParty } from '@/lib/compat-page';
import { getMessages } from '@/lib/i18n/messages';

/**
 * Display — tela UNIVERSAL (TV/monitor, muitas vezes com navegador que não
 * atualiza). Sem o runtime do Next no navegador: a tela React de sempre
 * (src/screens/DisplayScreen.tsx) vem empacotada em ES5 em
 * /compat/display.js (scripts/build-compat.mjs). Visual e comportamento
 * iguais — conferido pixel a pixel.
 */
export const config = { unstable_runtimeJS: false };

export const getStaticProps: GetStaticProps<{ locale: string }> = async ({ locale }) => ({
  props: { locale: locale ?? 'pt-BR' }
});

export default function DisplayPage({ locale }: { locale: string }) {
  const displayMessages = getMessages(locale).display;
  return (
    <>
      <Seo
        title="Referee Lights · Display"
        description={
          displayMessages.metaDescription ??
          'Tela de display IPF sincronizada com timers, luzes e alertas de intervalo controlados pelo painel Referee Lights.'
        }
        canonicalPath="/display"
        noIndex
      />
      {/* Até o script montar a tela, só o fundo (como a versão React) */}
      <div id="rl-root">
        <div className="h-screen w-screen bg-black" />
      </div>
      <script id="rl-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(compatData(locale, {})) }} />
      <script defer src={`/compat/rl.js?v=${COMPAT_SCRIPT_VERSION}`} />
      <script defer src={`/compat/display.js?v=${COMPAT_SCRIPT_VERSION}`} />
      <CompatThirdParty />
    </>
  );
}
