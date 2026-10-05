import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useMemo, useState } from 'react';

import { Seo } from '@/components/Seo';
import { FooterBadges } from '@/components/FooterBadges';
import { useCooldownBadges } from '@/components/TimerDisplay';
import { IntervalCard, TimerCard } from '@/components/TimerControls';
import { BrandLogo } from '@/components/BrandLogo';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { useRouterReady } from '@/hooks/useRouterReady';
import { getMessages, type Messages } from '@/lib/i18n/messages';

function formatInterval(ms: number) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600).toString().padStart(2, '0');
  const m = Math.floor((totalSec % 3600) / 60).toString().padStart(2, '0');
  const s = (totalSec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export default function TimerPage() {
  const router = useRouter();
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);
  const adminMessages = messages.admin;
  const displayMessages = messages.display;
  const commonMessages = messages.common;
  // Lado a lado na tela deitada, cada cartão com metade da largura
  const card = 'rounded-2xl border border-slate-800 bg-slate-900 p-4 landscape:flex-1 landscape:basis-0';

  const routerReady = useRouterReady();
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : undefined;
  const adminPin = typeof router.query.pin === 'string' ? router.query.pin : undefined;

  const {
    state, status,
    timerStart, timerStop, timerReset, timerSet,
    intervalStart, intervalStop, intervalReset, intervalSet,
  } = useRoomSocket('display', { roomId, adminPin });

  const cooldownBadges = useCooldownBadges(state?.phase);
  const [customMinutes, setCustomMinutes] = useState(1);
  const [intervalHours, setIntervalHours] = useState(0);
  const [intervalMinutes, setIntervalMinutes] = useState(10);
  const [intervalSeconds, setIntervalSeconds] = useState(0);

  useEffect(() => {
    if (!router.isReady) return;
    const targetLocale = state?.locale;
    if (!targetLocale) return;
    if (router.locale === targetLocale) return;
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000`;
    void router.replace({ pathname: router.pathname, query: router.query }, undefined, { locale: targetLocale });
  }, [router, state?.locale]);

  const handleSetMinutes = () => {
    timerSet(Math.max(0, customMinutes) * 60);
  };

  const handleIntervalSet = () => {
    const totalSeconds = intervalHours * 3600 + intervalMinutes * 60 + intervalSeconds;
    intervalSet(totalSeconds);
  };

  const intervalDisplay = formatInterval(state?.intervalMs ?? 0);

  // Até ler a URL, só o fundo (sem piscar "não configurado" ao recarregar)
  if (!routerReady) return <div className="h-[100dvh] bg-slate-950" />;
  if (!roomId || !adminPin) {
    return <MissingTimerCredentials messages={displayMessages} />;
  }


  return (
    <>
      <Seo
        title="Referee Lights · Timer"
        description="Controle do cronômetro da plataforma Referee Lights."
        canonicalPath="/timer"
        noIndex
      />
      {/* Ocupa exatamente a janela (dvh: some a barra do navegador no celular); nada rola */}
      <main className="flex h-[100dvh] flex-col justify-center gap-3 overflow-hidden bg-slate-950 p-3 text-slate-100 sm:p-4">
        <header className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3">
          <BrandLogo size={28} />
          {/* Status da conexão como no admin e nos árbitros, ao lado da sala */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-[13px] font-semibold text-slate-300">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 rounded-full ${status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-amber-400' : 'bg-red-500'}`}
              />
              {/* No celular estreito fica só a bolinha + estado */}
              <span className="max-sm:sr-only">{commonMessages.labels.status}:</span> {commonMessages.connection[status]}
            </span>
            <span className="whitespace-nowrap rounded-lg bg-slate-800 px-3 py-1.5 text-[15px] font-semibold text-slate-200">
              {commonMessages.labels.room} <span className="font-bold tracking-[0.12em] text-white">{roomId}</span>
            </span>
          </div>
        </header>

        {/* Em pé: um cartão sobre o outro. Deitado: lado a lado. Os cartões têm a
            altura do conteúdo e o conjunto fica centralizado na janela */}
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 landscape:flex-row landscape:items-start">
          <TimerCard
            className={card}
            messages={adminMessages.timer}
            remainingMs={state?.timerMs ?? 60_000}
            running={state?.running ?? false}
            badges={cooldownBadges}
            minutes={customMinutes}
            onMinutesChange={setCustomMinutes}
            onStart={timerStart}
            onStop={timerStop}
            onReset={timerReset}
            onSet={handleSetMinutes}
          />
          <IntervalCard
            className={card}
            messages={adminMessages.interval}
            shortLabels={messages.referee.center}
            display={intervalDisplay}
            hours={intervalHours}
            minutes={intervalMinutes}
            seconds={intervalSeconds}
            onHoursChange={setIntervalHours}
            onMinutesChange={setIntervalMinutes}
            onSecondsChange={setIntervalSeconds}
            onSet={handleIntervalSet}
            onStart={intervalStart}
            onPause={intervalStop}
            onReset={intervalReset}
          />
        </div>

        <div className="shrink-0 opacity-60 [@media(max-height:900px)]:hidden">
          <FooterBadges />
        </div>
      </main>
    </>
  );
}

function MissingTimerCredentials({ messages }: { messages: Messages['display'] }) {
  const translatedDescription = messages.missing.description.replace('/display?', '/timer?');
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-white">
      <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">{messages.missing.title}</h1>
      <p className="max-w-xl text-sm text-white/70">{translatedDescription}</p>
      <Link
        href="/admin"
        className="rounded-full border border-white/20 px-5 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white transition hover:bg-white/10"
      >
        {messages.missing.goToAdmin}
      </Link>
    </main>
  );
}
