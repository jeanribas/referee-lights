export type Judge = 'left' | 'center' | 'right';
export type VoteValue = 'white' | 'red' | null;
export type CardValue = 1 | 2 | 3 | null;
export type Phase = 'idle' | 'revealed';

export type Locale = 'pt-BR' | 'en-US' | 'es-ES';

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
  locale: Locale;
  legendConfig: LegendConfig;
}

export type RoomSnapshot = AppState;

const DEFAULT_TIMER_MS = 60_000;
const AUTO_CLEAR_MS = 10_000;
const INTERVAL_TICK_RATE_MS = 200;
const DEFAULT_LOCALE: Locale = 'pt-BR';
const DEFAULT_LEGEND_CONFIG: LegendConfig = {
  bgColor: 'transparent',
  timerColor: '#FFFFFF',
  digitMode: 'hhmmss',
  showPlaceholders: true,
  showDashedFrame: true,
  keepAwake: true
};

export class RoomState {
  private state: AppState & { lastTickAt?: number } = {
    phase: 'idle',
    votes: {
      left: null,
      center: null,
      right: null
    },
    cards: {
      left: [],
      center: [],
      right: []
    },
    timerMs: DEFAULT_TIMER_MS,
    running: false,
    connected: {
      left: false,
      center: false,
      right: false
    },
    intervalMs: 0,
    intervalConfiguredMs: 0,
    intervalRunning: false,
    intervalVisible: false,
    locale: DEFAULT_LOCALE,
    legendConfig: { ...DEFAULT_LEGEND_CONFIG }
  };

  private tickInterval: NodeJS.Timeout | null = null;
  private autoClearTimeout: NodeJS.Timeout | null = null;
  private subscribers = new Set<(snapshot: AppState) => void>();
  private intervalTickHandle: NodeJS.Timeout | null = null;
  private intervalLastTickAt: number | undefined;

  onSnapshot(listener: (snapshot: AppState) => void) {
    this.subscribers.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.subscribers.delete(listener);
    };
  }

  getSnapshot(): AppState {
    return {
      phase: this.state.phase,
      votes: { ...this.state.votes },
      cards: {
        left: [...this.state.cards.left],
        center: [...this.state.cards.center],
        right: [...this.state.cards.right]
      },
      timerMs: this.state.timerMs,
      running: this.state.running,
      connected: { ...this.state.connected },
      intervalMs: this.state.intervalMs,
      intervalConfiguredMs: this.state.intervalConfiguredMs,
      intervalRunning: this.state.intervalRunning,
      intervalVisible: this.state.intervalVisible,
      locale: this.state.locale,
      legendConfig: { ...this.state.legendConfig }
    };
  }

  destroy() {
    this.cancelAutoClear();
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    if (this.intervalTickHandle) {
      clearInterval(this.intervalTickHandle);
      this.intervalTickHandle = null;
    }
    this.subscribers.clear();
  }

  setVote(judge: Judge, vote: VoteValue) {
    if (this.state.phase === 'revealed') return;
    this.state.votes[judge] = vote;
    if (vote !== 'red') {
      this.state.cards[judge] = [];
    }
    this.notify();
    if (this.allVotesCast()) {
      this.triggerReveal();
    }
  }

  setCard(judge: Judge, card: CardValue) {
    if (card === null) {
      this.state.cards[judge] = [];
      this.notify();
      return;
    }
    this.state.votes[judge] = 'red';
    const cards = this.state.cards[judge];
    if (cards.includes(card)) {
      this.state.cards[judge] = cards.filter((value) => value !== card);
      this.notify();
      return;
    }
    if (cards.length >= 3) {
      return;
    }
    this.state.cards[judge] = [...cards, card];
    this.notify();
  }

  triggerReveal(force = false) {
    if (!force && !this.allVotesCast()) return;
    if (this.state.phase === 'revealed') return;
    this.state.phase = 'revealed';
    this.scheduleAutoClear();
    this.notify();
  }

  clearDecision() {
    this.resetForNextAttempt();
  }

  releaseDecision() {
    this.triggerReveal(true);
  }

  startTimer() {
    if (this.state.running) return;
    this.state.running = true;
    this.state.lastTickAt = Date.now();
    this.tickInterval = setInterval(() => this.tick(), 200);
    this.notify();
  }

  startTimerWithSeconds(seconds: number) {
    this.state.timerMs = Math.max(0, seconds * 1000);
    this.startTimer();
  }

  stopTimer() {
    if (!this.state.running) return;
    this.stopTimerInternal();
    this.notify();
  }

  resetTimer() {
    this.stopTimerInternal();
    this.state.timerMs = DEFAULT_TIMER_MS;
    this.notify();
  }

  configureInterval(seconds: number) {
    const ms = Math.max(0, Math.round(seconds * 1000));
    this.stopIntervalInternal();
    this.state.intervalConfiguredMs = ms;
    this.state.intervalMs = ms;
    this.state.intervalVisible = ms > 0;
    this.notify();
  }

  startInterval() {
    if (this.state.intervalRunning || this.state.intervalMs <= 0) return;
    this.state.intervalRunning = true;
    this.state.intervalVisible = true;
    this.intervalLastTickAt = Date.now();
    if (!this.intervalTickHandle) {
      this.intervalTickHandle = setInterval(() => this.runIntervalTick(), INTERVAL_TICK_RATE_MS);
    }
    this.notify();
  }

  stopInterval() {
    if (!this.state.intervalRunning) return;
    this.stopIntervalInternal();
    this.notify();
  }

  resetInterval() {
    this.stopIntervalInternal();
    this.state.intervalMs = this.state.intervalConfiguredMs;
    this.state.intervalVisible = this.state.intervalConfiguredMs > 0;
    this.notify();
  }

  setIntervalVisible(visible: boolean) {
    this.state.intervalVisible = visible;
    this.notify();
  }

  setLocale(locale: Locale) {
    if (this.state.locale === locale) return;
    this.state.locale = locale;
    this.notify();
  }

  setLegendConfig(config: LegendConfig) {
    const nextConfig: LegendConfig = {
      bgColor: config.bgColor,
      timerColor: config.timerColor,
      digitMode: config.digitMode,
      showPlaceholders: config.showPlaceholders,
      showDashedFrame: config.showDashedFrame,
      keepAwake: config.keepAwake
    };
    const currentConfig = this.state.legendConfig;
    const changed =
      currentConfig.bgColor !== nextConfig.bgColor ||
      currentConfig.timerColor !== nextConfig.timerColor ||
      currentConfig.digitMode !== nextConfig.digitMode ||
      currentConfig.showPlaceholders !== nextConfig.showPlaceholders ||
      currentConfig.showDashedFrame !== nextConfig.showDashedFrame ||
      currentConfig.keepAwake !== nextConfig.keepAwake;

    if (!changed) return;
    this.state.legendConfig = nextConfig;
    this.notify();
  }

  setPhaseReady() {
    this.resetForNextAttempt();
  }

  setConnected(judge: Judge, value: boolean) {
    this.state.connected[judge] = value;
    this.notify();
  }

  setAllConnected(value: boolean) {
    (Object.keys(this.state.connected) as Judge[]).forEach((judge) => {
      this.state.connected[judge] = value;
    });
    this.notify();
  }

  private notify() {
    const snapshot = this.getSnapshot();
    for (const listener of this.subscribers) {
      listener(snapshot);
    }
  }

  private resetForNextAttempt() {
    this.cancelAutoClear();
    this.state.phase = 'idle';
    this.resetVotesAndCards();
    this.state.timerMs = DEFAULT_TIMER_MS;
    this.stopTimerInternal();
    this.notify();
  }

  private resetVotesAndCards() {
    this.state.votes = {
      left: null,
      center: null,
      right: null
    };
    this.state.cards = {
      left: [],
      center: [],
      right: []
    };
  }

  private scheduleAutoClear() {
    this.cancelAutoClear();
    this.autoClearTimeout = setTimeout(() => {
      this.resetForNextAttempt();
    }, AUTO_CLEAR_MS);
  }

  private cancelAutoClear() {
    if (this.autoClearTimeout) {
      clearTimeout(this.autoClearTimeout);
      this.autoClearTimeout = null;
    }
  }

  private stopTimerInternal() {
    this.state.running = false;
    this.state.lastTickAt = undefined;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private stopIntervalInternal() {
    this.state.intervalRunning = false;
    this.intervalLastTickAt = undefined;
    if (this.intervalTickHandle) {
      clearInterval(this.intervalTickHandle);
      this.intervalTickHandle = null;
    }
  }

  private allVotesCast() {
    return (Object.values(this.state.votes) as VoteValue[]).every((vote) => vote !== null);
  }

  private tick() {
    if (!this.state.running) return;
    const now = Date.now();
    const last = this.state.lastTickAt ?? now;
    const delta = now - last;
    this.state.lastTickAt = now;
    this.state.timerMs = Math.max(0, this.state.timerMs - delta);
    if (this.state.timerMs === 0) {
      this.stopTimerInternal();
    }
    this.notify();
  }

  private runIntervalTick() {
    if (!this.state.intervalRunning) return;
    const now = Date.now();
    const last = this.intervalLastTickAt ?? now;
    const delta = now - last;
    this.intervalLastTickAt = now;
    this.state.intervalMs = Math.max(0, this.state.intervalMs - delta);
    if (this.state.intervalMs === 0) {
      this.stopIntervalInternal();
      this.state.intervalVisible = false;
    }
    this.notify();
  }
}
