import { useRouter } from 'next/router';
import { useMemo } from 'react';

import { getMessages } from '@/lib/i18n/messages';

export default function RefIndex() {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const refereeMessages = messages.referee;
  // <a> e não <Link>: o console do árbitro é tela universal (sem o runtime
  // do Next) e só funciona carregando a página inteira.
  const prefix = locale && locale !== router.defaultLocale ? `/${locale}` : '';

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-950 px-6 py-8 text-slate-100">
      <h1 className="text-lg font-semibold uppercase tracking-[0.4em]">{refereeMessages.selectorTitle}</h1>
      <div className="flex flex-col gap-4 text-center text-sm uppercase tracking-[0.3em]">
        <a className="rounded-xl border border-slate-700 px-6 py-3" href={`${prefix}/ref/left`}>
          {refereeMessages.side.leftTitle}
        </a>
        <a className="rounded-xl border border-slate-700 px-6 py-3" href={`${prefix}/ref/center`}>
          {refereeMessages.center.title}
        </a>
        <a className="rounded-xl border border-slate-700 px-6 py-3" href={`${prefix}/ref/right`}>
          {refereeMessages.side.rightTitle}
        </a>
      </div>
    </main>
  );
}
