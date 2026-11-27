// Política de arquivamento por ociosidade: `activity` (antiga) x `votes`
// (só voto/cartão ou os 3 árbitros conectados renovam a sala).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRoomIdlePolicy } from '../src/config.js';
import { RoomManager, type PersistedRoom } from '../src/rooms.js';

const HOUR = 3600_000;

let start = 0;
beforeEach(() => {
  vi.useFakeTimers();
  start = Date.now();
});
afterEach(() => {
  vi.useRealTimers();
});

function at(hours: number) {
  return start + hours * HOUR;
}

function votesRoom(ttlHours = 24) {
  const rm = new RoomManager(() => {}, { ttlMs: ttlHours * HOUR, idlePolicy: 'votes' });
  const { roomId } = rm.createRoom();
  const state = () => rm.getRoomState(roomId)!;
  return { rm, roomId, state };
}

describe('política votes: sala sem voto', () => {
  it('expira após o ttl mesmo com reconexões de 1 árbitro', () => {
    const { rm, roomId, state } = votesRoom();
    // Celular do central reabre a aba a cada poucas horas
    vi.setSystemTime(at(5));
    state().setConnected('center', true);
    vi.setSystemTime(at(5.1));
    state().setConnected('center', false);
    vi.setSystemTime(at(20));
    state().setConnected('left', true);
    vi.setSystemTime(at(20.1));
    state().setConnected('left', false);

    expect(rm.sweepExpired(at(23))).toEqual([]);
    expect(rm.sweepExpired(at(25))).toEqual([roomId]);
    expect(rm.roomCount()).toBe(0);
  });

  it('dois árbitros conectados não contam como atividade', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(20));
    state().setConnected('left', true);
    state().setConnected('center', true);
    vi.setSystemTime(at(20.5));
    state().setConnected('left', false);
    state().setConnected('center', false);

    expect(rm.sweepExpired(at(25))).toEqual([roomId]);
  });

  it('timer, intervalo, legenda e locale não contam como atividade', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(20));
    state().startTimerWithSeconds(90);
    state().configureInterval(60);
    state().setLocale('en-US');
    state().setLegendConfig({
      bgColor: '#000000',
      timerColor: '#FFFFFF',
      digitMode: 'mmss',
      showPlaceholders: true,
      showDashedFrame: true,
      keepAwake: true
    });
    state().setAllConnected(false);

    expect(rm.sweepExpired(at(25))).toEqual([roomId]);
  });
});

describe('política votes: voto renova', () => {
  it('voto de árbitro adia o arquivamento', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(20));
    state().setVote('left', 'white');

    expect(rm.sweepExpired(at(30))).toEqual([]);
    expect(rm.sweepExpired(at(45))).toEqual([roomId]);
  });

  it('cartão adia o arquivamento', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(20));
    state().setCard('center', 1);

    expect(rm.sweepExpired(at(30))).toEqual([]);
    expect(rm.sweepExpired(at(45))).toEqual([roomId]);
  });

  it('voto grava atividade no store (persistência com throttle)', () => {
    const touched: Array<[string, number]> = [];
    const rm = new RoomManager(() => {}, {
      ttlMs: 24 * HOUR,
      idlePolicy: 'votes',
      store: { save: () => {}, touch: (id, ms) => touched.push([id, ms]), remove: () => {} }
    });
    const { roomId } = rm.createRoom();
    vi.setSystemTime(at(10));
    rm.getRoomState(roomId)!.setVote('right', 'red');
    expect(touched.at(-1)).toEqual([roomId, at(10)]);
  });
});

describe('política votes: três árbitros conectados', () => {
  it('impede expiração enquanto os 3 estiverem conectados, mesmo sem voto', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(1));
    state().setConnected('left', true);
    state().setConnected('center', true);
    state().setConnected('right', true);

    expect(rm.sweepExpired(at(30))).toEqual([]);
    expect(rm.roomCount()).toBe(1);
    expect(rm.getRoomState(roomId)).not.toBeNull();
  });

  it('conta como atividade: após soltar os 3, o prazo volta a correr a partir daí', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(1));
    state().setConnected('left', true);
    state().setConnected('center', true);
    state().setConnected('right', true);
    // varredura durante o uso renova a sala
    expect(rm.sweepExpired(at(30))).toEqual([]);

    // os 3 saem em 30h: 10h depois ainda viva, 25h depois arquivada
    vi.setSystemTime(at(30));
    state().setConnected('left', false);
    state().setConnected('center', false);
    state().setConnected('right', false);
    expect(rm.sweepExpired(at(40))).toEqual([]);
    expect(rm.sweepExpired(at(55))).toEqual([roomId]);
  });

  it('dois de três conectados não impedem expiração', () => {
    const { rm, roomId, state } = votesRoom();
    vi.setSystemTime(at(1));
    state().setConnected('left', true);
    state().setConnected('center', true);
    state().setConnected('right', true);
    vi.setSystemTime(at(20));
    state().setConnected('right', false);

    // último momento com os 3 conectados: 1h; 24h depois ainda não passou do ttl
    expect(rm.sweepExpired(at(25))).toEqual([]);
    expect(rm.sweepExpired(at(26))).toEqual([roomId]);
  });
});

describe('política votes: restauração pós-restart', () => {
  it('sala restaurada não rejuvenesce com reconexão de um árbitro', () => {
    const rm = new RoomManager(() => {}, { ttlMs: 24 * HOUR, idlePolicy: 'votes' });
    const rec: PersistedRoom = {
      roomId: 'VELH',
      adminPin: '1234',
      refereeTokens: { left: 'a', center: 'b', right: 'c' },
      createdAt: at(-30),
      lastActivityAt: at(-25)
    };
    expect(rm.restoreRoom(rec)).toBe(true);
    vi.setSystemTime(at(0));
    rm.getRoomState('VELH')!.setConnected('left', true);
    expect(rm.sweepExpired(at(0))).toEqual(['VELH']);
  });

  it('sala restaurada com voto recente continua viva', () => {
    const rm = new RoomManager(() => {}, { ttlMs: 24 * HOUR, idlePolicy: 'votes' });
    rm.restoreRoom({
      roomId: 'NOVA',
      adminPin: '1234',
      refereeTokens: { left: 'a', center: 'b', right: 'c' },
      createdAt: at(-30),
      lastActivityAt: at(-2)
    });
    expect(rm.sweepExpired(at(0))).toEqual([]);
  });
});

describe('política activity (padrão) continua igual', () => {
  it('reconexão de um árbitro renova a sala', () => {
    const rm = new RoomManager(() => {}, { ttlMs: 24 * HOUR });
    const { roomId } = rm.createRoom();
    vi.setSystemTime(at(20));
    rm.getRoomState(roomId)!.setConnected('left', true);
    expect(rm.sweepExpired(at(30))).toEqual([]);
    expect(rm.sweepExpired(at(45))).toEqual([roomId]);
  });
});

describe('parseRoomIdlePolicy', () => {
  it('vazio e ausente viram activity sem aviso', () => {
    expect(parseRoomIdlePolicy(undefined)).toEqual({ policy: 'activity', invalid: null });
    expect(parseRoomIdlePolicy('')).toEqual({ policy: 'activity', invalid: null });
  });

  it('aceita votes e activity, sem diferenciar caixa nem espaço', () => {
    expect(parseRoomIdlePolicy(' VOTES ')).toEqual({ policy: 'votes', invalid: null });
    expect(parseRoomIdlePolicy('activity')).toEqual({ policy: 'activity', invalid: null });
  });

  it('valor inválido cai em activity e guarda o valor para o aviso', () => {
    expect(parseRoomIdlePolicy('sempre')).toEqual({ policy: 'activity', invalid: 'sempre' });
  });
});
