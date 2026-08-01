import clsx from 'clsx';
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';

import { AppState, CardValue, Judge, VoteValue } from '@/types/state';

interface Props {
  state: AppState;
  showCardPlaceholders?: boolean;
  showLightPlaceholders?: boolean;
  showPendingRing?: boolean;
  delayReveal?: boolean;
  forceConnectedPlaceholders?: boolean;
  sizeMode?: 'default' | 'legend' | 'stage';
}

export function DecisionLights({
  state,
  showCardPlaceholders = false,
  showLightPlaceholders = true,
  showPendingRing = true,
  delayReveal = true,
  forceConnectedPlaceholders = false,
  sizeMode = 'default'
}: Props) {
  const [delayedVotes, setDelayedVotes] = useState(state.votes);
  const [delayedCards, setDelayedCards] = useState(state.cards);
  const [delayedPhase, setDelayedPhase] = useState(state.phase);
  const voteSignature = `${state.votes.left ?? 'null'}|${state.votes.center ?? 'null'}|${state.votes.right ?? 'null'}`;
  const cardsSignature = [
    state.cards.left.join(','),
    state.cards.center.join(','),
    state.cards.right.join(',')
  ].join('|');
  // Signatures ensure we only react when underlying vote/card values change, not on timer ticks.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo por assinatura, deps diretas anulariam o propósito
  const stableVotes = useMemo(() => state.votes, [voteSignature]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- memo por assinatura, deps diretas anulariam o propósito
  const stableCards = useMemo(() => state.cards, [cardsSignature]);
  const isLegendSize = sizeMode === 'legend';
  const isStageSize = sizeMode === 'stage';
  const containerClassName = isLegendSize
    ? 'flex w-full max-w-[min(92vw,95vh)] flex-col items-center gap-4'
    : isStageSize
      ? 'flex w-full max-w-none flex-col items-center gap-10'
      : 'flex w-full max-w-6xl flex-col items-center gap-10';
  const rowClassName = isLegendSize
    ? 'flex w-full flex-row flex-wrap items-start justify-center gap-[clamp(0.75rem,2.5vw,2rem)]'
    : isStageSize
      ? 'flex flex-row items-end justify-center gap-24'
      : 'flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-center sm:gap-32';

  useEffect(() => {
    if (!delayReveal) {
      setDelayedVotes(stableVotes);
      setDelayedCards(stableCards);
      setDelayedPhase(state.phase);
      return;
    }

    const timer = window.setTimeout(() => {
      setDelayedVotes(stableVotes);
      setDelayedCards(stableCards);
      setDelayedPhase(state.phase);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [stableVotes, stableCards, state.phase, delayReveal]);

  return (
    <div className={containerClassName}>
      <div className={rowClassName}>
        {(Object.keys(state.votes) as Judge[]).map((judge) => (
          <JudgeLight
            key={judge}
            connected={state.connected?.[judge] ?? false}
            vote={delayedVotes[judge]}
            cards={delayedCards[judge]}
            revealed={delayedPhase === 'revealed'}
            showCardPlaceholders={showCardPlaceholders}
            showLightPlaceholders={showLightPlaceholders}
            showPendingRing={showPendingRing}
            forceConnectedPlaceholders={forceConnectedPlaceholders}
            sizeMode={sizeMode}
          />
        ))}
      </div>
    </div>
  );
}

function JudgeLight({
  connected,
  vote,
  cards,
  revealed,
  showCardPlaceholders,
  showLightPlaceholders,
  showPendingRing,
  forceConnectedPlaceholders,
  sizeMode
}: {
  connected: boolean;
  vote: VoteValue;
  cards: CardValue[];
  revealed: boolean;
  showCardPlaceholders: boolean;
  showLightPlaceholders: boolean;
  showPendingRing: boolean;
  forceConnectedPlaceholders: boolean;
  sizeMode: 'default' | 'legend' | 'stage';
}) {
  const isLegendSize = sizeMode === 'legend';
  const isStageSize = sizeMode === 'stage';
  const squareStyle: CSSProperties = {
    width: isLegendSize
      ? 'clamp(9.5rem, min(26vw, 24vh), 22rem)'
      : isStageSize
        ? '240px'
        : 'clamp(12.32rem, 24.64vw, 28.16rem)',
    minWidth: isLegendSize
      ? 'clamp(9.5rem, min(26vw, 24vh), 22rem)'
      : isStageSize
        ? '240px'
        : 'clamp(12.32rem, 24.64vw, 28.16rem)',
    aspectRatio: '1 / 1',
    fontSize: isLegendSize
      ? 'clamp(3.8rem, min(10vw, 9.5vh), 10.5rem)'
      : isStageSize
        ? '118px'
        : 'clamp(5.28rem, 10.56vw, 14.08rem)'
  };
  const cardSlotHeight = isLegendSize
    ? 'clamp(2.2rem, 4vh, 4.2rem)'
    : isStageSize
      ? '64px'
      : '5rem';
  const squareBorderRadius = isLegendSize
    ? 'clamp(1rem, 2.8vh, 2.4rem)'
    : isStageSize
      ? '42px'
      : 'clamp(1.6rem, 3.4vw, 3rem)';
  const cardBorderRadius = isLegendSize
    ? 'clamp(0.35rem, 0.95vh, 0.85rem)'
    : isStageSize
      ? '12px'
      : '0.75rem';
  const squareSurfaceStyle: CSSProperties = {
    ...squareStyle,
    borderRadius: squareBorderRadius
  };
  const cardStripClassName = isLegendSize
    ? 'mt-3 grid w-full grid-cols-3 gap-2 px-2'
    : isStageSize
      ? 'absolute top-full mt-6 grid w-full grid-cols-3 gap-4 px-4'
      : 'absolute top-full mt-6 grid w-full grid-cols-3 gap-4 px-4';

  if (!connected) {
    if (!showLightPlaceholders) {
      return (
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="invisible" style={squareStyle} />
        </div>
      );
    }

    return (
      <div className="flex flex-none flex-col items-center gap-2 text-center">
        <div className="relative" style={{ width: squareStyle.width }}>
          <div className="flex items-center justify-center bg-[#0F1216]" style={squareSurfaceStyle} />
          {showCardPlaceholders && (
            <div className={cardStripClassName}>
              {[1, 2, 3].map((slot) => (
                <CardSlot
                  key={`card-placeholder-${slot}`}
                  card={null}
                  showPlaceholder
                  height={cardSlotHeight}
                  radius={cardBorderRadius}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const displayVote: VoteValue = revealed ? vote : null;
  const hasVote = vote !== null;
  const pending = hasVote && !revealed && showPendingRing;

  const showPlaceholderSquare = showLightPlaceholders || forceConnectedPlaceholders;

  const squareClass = clsx(
    'flex items-center justify-center text-center font-bold transition-all duration-200',
    displayVote === 'white' && 'bg-white text-slate-900 shadow-xl',
    displayVote === 'red' && 'bg-red-500 text-white shadow-xl',
    displayVote === null &&
      (showPlaceholderSquare
        ? 'bg-[#0F1216] text-transparent shadow-xl'
        : 'bg-transparent text-transparent shadow-none'),
    pending && 'ring-4 ring-slate-500/60'
  );

  const showCardStrip = showCardPlaceholders || (revealed && vote === 'red' && cards.length > 0);

  return (
    <div className="flex flex-none flex-col items-center gap-2 text-center">
      <div className="relative" style={{ width: squareStyle.width }}>
        <div className={squareClass} style={squareSurfaceStyle}>
          {renderSymbol(displayVote)}
        </div>
        {showCardStrip && (
          <div className={cardStripClassName}>
            {[1, 2, 3].map((slot) => (
              <CardSlot
                key={`card-${slot}`}
                card={cards.find((value) => value === slot) ?? null}
                showPlaceholder={showCardPlaceholders}
                height={cardSlotHeight}
                radius={cardBorderRadius}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function renderSymbol(vote: VoteValue) {
  if (vote === 'white') return '✓';
  if (vote === 'red') return '✕';
  return '—';
}

function CardSlot({
  card,
  showPlaceholder,
  height,
  radius
}: {
  card: CardValue;
  showPlaceholder: boolean;
  height: string;
  radius: string;
}) {
  if (!card) {
    if (!showPlaceholder) {
      return <div className="bg-transparent" style={{ height, borderRadius: radius }} />;
    }
    return <div className="bg-[#0F1216]" style={{ height, borderRadius: radius }} />;
  }

  const map: Record<Exclude<CardValue, null>, string> = {
    1: 'bg-red-500 text-white',
    2: 'bg-blue-500 text-white',
    3: 'bg-yellow-400 text-slate-900'
  };

  return <div className={`w-full shadow-lg ${map[card]}`} style={{ height, borderRadius: radius }} />;
}
