import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { useRoomSocket } from '@/hooks/useRoomSocket';
import { CardValue, Judge, VoteValue } from '@/types/state';
import { useWakeLock } from '@/hooks/useWakeLock';
import { getMessages, type Messages } from '@/lib/i18n/messages';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { Seo } from '@/components/Seo';
import { FooterBadges } from '@/components/FooterBadges';

function useViewportScale(designWidth: number, designHeight: number) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const update = () => {
      const sy = window.innerHeight / designHeight;
      setScale(Math.min(sy, 1));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [designWidth, designHeight]);
  return scale;
}

const CARD_OPTIONS: Array<{ value: Exclude<CardValue, null>; color: string; glyph: string }> = [
  { value: 1, color: 'bg-red-500 text-white', glyph: '1' },
  { value: 2, color: 'bg-blue-500 text-white', glyph: '2' },
  { value: 3, color: 'bg-yellow-400 text-slate-900', glyph: '3' }
];

export default function RefereeConsole() {
  const router = useRouter();
  const judge = router.query.judge;
  const locale = typeof router.locale === 'string' ? router.locale : undefined;
  const messages = useMemo(() => getMessages(locale), [locale]);

  if (!router.isReady) {
    return null;
  }

  if (typeof judge !== 'string' || !['left', 'center', 'right'].includes(judge)) {
    return (
      <>
        <Seo
          title="Referee Lights · Console"
          description={
            messages.referee.metaDescription ??
            'Console móvel do árbitro com ações GOOD/NO LIFT e cartões IPF, sincronizado ao painel Referee Lights.'
          }
          canonicalPath="/ref"
          noIndex
        />
        <p className="min-h-screen bg-black p-6 text-slate-100">{messages.referee.invalidRoute}</p>
      </>
    );
  }

  return <RefereeView judge={judge as Judge} messages={messages} />;
}

function RefereeView({ judge, messages }: { judge: Judge; messages: Messages }) {
  const router = useRouter();
  const commonMessages = messages.common;
  const refereeMessages = messages.referee;
  const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : undefined;
  const token = typeof router.query.token === 'string' ? router.query.token : undefined;
  const { state, status, sendVote, sendCard, timerStart, timerStop, timerReset } = useRoomSocket(judge, {
    roomId,
    refereeToken: token
  });
  const isCenter = judge === 'center';
  const judgeTitle = isCenter
    ? refereeMessages.center.title
    : judge === 'left'
      ? refereeMessages.side.leftTitle
      : refereeMessages.side.rightTitle;
  const timerSeconds = useMemo(() => Math.round((state?.timerMs ?? 0) / 1000), [state?.timerMs]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useWakeLock(hydrated);

  const vibrate = useHapticFeedback();

  const vote = state?.votes[judge] ?? null;
  const cards = state?.cards[judge] ?? [];

  useEffect(() => {
    if (!router.isReady) return;
    const targetLocale = state?.locale;
    if (!targetLocale) return;
    if (router.locale === targetLocale) return;
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000`;
    void router.replace({ pathname: router.pathname, query: router.query }, undefined, { locale: targetLocale });
  }, [router, state?.locale]);

  const handleValid = useCallback(() => {
    vibrate();
    if (vote === 'white') {
      sendVote(null);
      sendCard(null);
      return;
    }
    sendVote('white');
    sendCard(null);
  }, [sendCard, sendVote, vibrate, vote]);

  const toggleCard = useCallback(
    (card: Exclude<CardValue, null>) => {
      vibrate();
      const currentCards = state?.cards[judge] ?? [];
      const isActive = currentCards.includes(card);
      if (isActive) {
        sendCard(card);
        if (currentCards.length <= 1) {
          sendVote(null);
        }
        return;
      }
      if (vote !== 'red') {
        sendVote('red');
      }
      sendCard(card);
    },
    [judge, sendCard, sendVote, state?.cards, vibrate, vote]
  );

  const handleStart = useCallback(() => {
    vibrate();
    timerStart();
  }, [timerStart, vibrate]);

  const handlePause = useCallback(() => {
    vibrate();
    timerStop();
  }, [timerStop, vibrate]);

  const handleReset = useCallback(() => {
    vibrate();
    timerReset();
  }, [timerReset, vibrate]);

  const missingCredentials = !roomId || !token;

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
      {missingCredentials ? (
        <MissingRefCredentials judge={judge} messages={refereeMessages} />
      ) : isCenter ? (
        <CenterLayout
          status={status}
          timerSeconds={timerSeconds}
          running={state?.running ?? false}
          vote={vote}
          cards={cards}
          onStart={handleStart}
          onPause={handlePause}
          onReset={handleReset}
          onValid={handleValid}
          onToggleCard={toggleCard}
          messages={refereeMessages}
          commonMessages={commonMessages}
        />
      ) : (
        <SideLayout
          judge={judge}
          status={status}
          vote={vote}
          cards={cards}
          onValid={handleValid}
          onToggleCard={toggleCard}
          messages={refereeMessages}
          commonMessages={commonMessages}
        />
      )}
    </>
  );
}

function CenterLayout(props: {
  status: 'disconnected' | 'connecting' | 'connected';
  timerSeconds: number;
  running: boolean;
  vote: VoteValue;
  cards: CardValue[];
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onValid: () => void;
  onToggleCard: (card: Exclude<CardValue, null>) => void;
  messages: Messages['referee'];
  commonMessages: Messages['common'];
}) {
  const {
    status,
    timerSeconds,
    running,
    vote,
    cards,
    onStart,
    onPause,
    onReset,
    onValid,
    onToggleCard,
    messages,
    commonMessages
  } = props;
  const isValidActive = vote === 'white';
  const isPaused = !running;
  const vScale = useViewportScale(375, 780);
  const scaleStyle: CSSProperties | undefined = vScale < 1 ? {
    transformOrigin: 'top left',
    transform: `scale(${vScale})`,
    width: `${100 / vScale}%`,
    height: `${100 / vScale}vh`,
  } : undefined;

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950">
    <main className="flex h-screen flex-col gap-3 bg-slate-950 px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-4 text-white" style={scaleStyle}>
      <header className="flex flex-col items-center gap-1 text-xs uppercase tracking-[0.5em] text-slate-400">
        <span>{messages.center.title}</span>
        <ConnectionStatus status={status} messages={commonMessages} className="normal-case tracking-normal" />
      </header>

      <section className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-[#1F232A] p-4 shadow-xl">
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs uppercase tracking-[0.4em] text-slate-400">
            {messages.center.timeLabel}
          </span>
          <div className="text-4xl font-bold text-white">{formatSeconds(timerSeconds)}</div>
        </div>
        <div className="flex w-full flex-wrap justify-center gap-3">
          <button
            className={`flex-1 transform rounded-xl bg-emerald-500 px-4 py-3 font-semibold text-slate-900 transition duration-150 active:scale-95 active:brightness-95 ${
              running ? 'ring-4 ring-emerald-300/60' : 'opacity-80'
            }`}
            onClick={onStart}
            disabled={status !== 'connected'}
          >
            {messages.center.start}
          </button>
          <button
            className={`flex-1 transform rounded-xl bg-amber-400 px-4 py-3 font-semibold text-slate-900 transition duration-150 active:scale-95 active:brightness-95 ${
              isPaused ? 'ring-4 ring-amber-200/70' : 'opacity-80'
            }`}
            onClick={onPause}
            disabled={status !== 'connected'}
          >
            {messages.center.pause}
          </button>
          <button
            className="flex-1 transform rounded-xl bg-red-500 px-4 py-3 font-semibold text-white transition duration-150 active:scale-95 active:brightness-95"
            onClick={onReset}
            disabled={status !== 'connected'}
          >
            {messages.center.reset}
          </button>
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <button
          className={`w-full rounded-2xl bg-white py-9 text-2xl font-bold uppercase tracking-[0.3em] text-slate-900 shadow-xl transition ${
            isValidActive ? 'ring-4 ring-white/70' : 'opacity-80'
          }`}
          onClick={onValid}
          disabled={status !== 'connected'}
        >
          {messages.center.valid}
        </button>
        {CARD_OPTIONS.map((option) => {
          const isActive = cards.includes(option.value);
          return (
            <button
              key={option.value}
              className={`flex w-full items-center justify-center rounded-2xl py-9 text-2xl font-bold uppercase tracking-[0.3em] shadow-xl transition ${
                option.color
              } ${isActive ? 'ring-4 ring-white/70' : 'opacity-80'}`}
              onClick={() => onToggleCard(option.value)}
              disabled={status !== 'connected'}
            >
              {isActive ? '✓' : option.glyph}
            </button>
          );
        })}
      </section>

      <div className="mt-2 opacity-60">
        <FooterBadges />
      </div>
    </main>
    </div>
  );
}

function SideLayout(props: {
  judge: Judge;
  status: 'disconnected' | 'connecting' | 'connected';
  vote: VoteValue;
  cards: CardValue[];
  onValid: () => void;
  onToggleCard: (card: Exclude<CardValue, null>) => void;
  messages: Messages['referee'];
  commonMessages: Messages['common'];
}) {
  const { judge, status, vote, cards, onValid, onToggleCard, messages, commonMessages } = props;
  const isValidActive = vote === 'white';
  const sideLabel = judge === 'left' ? messages.side.leftTitle : messages.side.rightTitle;
  const vScale = useViewportScale(375, 620);
  const scaleStyle: CSSProperties | undefined = vScale < 1 ? {
    transformOrigin: 'top left',
    transform: `scale(${vScale})`,
    width: `${100 / vScale}%`,
    height: `${100 / vScale}vh`,
  } : undefined;

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-950">
    <main className="flex h-screen flex-col gap-4 bg-slate-950 px-6 pt-[calc(env(safe-area-inset-top)+1rem)] pb-6 text-slate-100" style={scaleStyle}>
      <header className="flex flex-col items-center gap-1 text-center text-xs uppercase tracking-[0.4em] text-slate-400">
        <span>{sideLabel}</span>
        <ConnectionStatus status={status} messages={commonMessages} className="normal-case tracking-normal" />
      </header>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <button
          className={`w-full rounded-2xl bg-white py-9 text-2xl font-bold uppercase tracking-[0.3em] text-slate-900 shadow-xl transition ${
            isValidActive ? 'ring-4 ring-white/70' : 'opacity-80'
          }`}
          onClick={onValid}
          disabled={status !== 'connected'}
        >
          {messages.side.valid}
        </button>
        {CARD_OPTIONS.map((option) => {
          const isActive = cards.includes(option.value);
          return (
            <button
              key={option.value}
              className={`flex w-full items-center justify-center rounded-2xl py-9 text-2xl font-bold uppercase tracking-[0.3em] shadow-xl transition ${
                option.color
              } ${isActive ? 'ring-4 ring-white/70' : 'opacity-80'}`}
              onClick={() => onToggleCard(option.value)}
              disabled={status !== 'connected'}
            >
              {isActive ? '✓' : option.glyph}
            </button>
          );
        })}
      </section>
      <div className="mt-2 opacity-60">
        <FooterBadges />
      </div>
    </main>
    </div>
  );
}

function MissingRefCredentials({ judge, messages }: { judge: Judge; messages: Messages['referee'] }) {
  const description = messages.missing.description.replace('{judge}', judge);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-6 py-12 text-center text-white">
      <h1 className="text-2xl font-semibold uppercase tracking-[0.45em]">
        {messages.missing.title}
      </h1>
      <p className="max-w-md text-sm text-slate-300">{description}</p>
      <div className="mt-2 opacity-60">
        <FooterBadges />
      </div>
    </main>
  );
}

function useHapticFeedback() {
  return useCallback((pattern: number | number[] = [30]) => {
    if (typeof window === 'undefined') return;
    try {
      if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch (error) {
      console.warn('vibration_failed', error);
    }
  }, []);
}

function formatSeconds(seconds: number) {
  const mins = Math.floor(seconds / 60).toString();
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
