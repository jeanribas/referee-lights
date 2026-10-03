export type Judge = 'left' | 'center' | 'right';
export type VoteValue = 'white' | 'red' | null;
export type CardValue = 1 | 2 | 3 | null;
export type Phase = 'idle' | 'revealed';

import type { AppLocale } from '@/lib/i18n/config';

export interface LegendConfig {
  bgColor: string;
  timerColor: string;
  digitMode: 'mmss' | 'hhmmss';
  showPlaceholders: boolean;
  showDashedFrame: boolean;
  keepAwake: boolean;
}

export interface AppState {
  phase: Phase;
  votes: Record<Judge, VoteValue>;
  cards: Record<Judge, CardValue[]>;
  timerMs: number;
  running: boolean;
  connected: Record<Judge, boolean>;
  intervalMs: number;
  intervalConfiguredMs: number;
  intervalRunning: boolean;
  intervalVisible: boolean;
  locale: AppLocale;
  legendConfig: LegendConfig;
}

export type ClientRole = 'admin' | 'display' | Judge;
