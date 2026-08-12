import crypto from 'node:crypto';

import { RoomState, type AppState, type Judge, type Locale } from './state.js';

type RefereeTokens = Record<Judge, string>;

interface Room {
  id: string;
  adminPin: string;
  refereeTokens: RefereeTokens;
  state: RoomState;
  createdAt: number;
  /** Última mudança de estado (voto, timer, conexão…) — base do arquivamento. */
  lastActivityAt: number;
}

export interface RoomAccessPayload {
  roomId: string;
  adminPin: string;
  joinQRCodes: {
    left: { token: string };
    center: { token: string };
    right: { token: string };
  };
}

type RoomStateListener = (roomId: string, snapshot: AppState) => void;

export interface PersistedRoom {
  roomId: string;
  adminPin: string;
  refereeTokens: Record<string, string>;
  createdAt: number;
  lastActivityAt: number;
}

interface RoomManagerOptions {
  /** Sala sem NENHUMA atividade por este tempo é arquivada (código volta ao pool). */
  ttlMs?: number;
  /** Chamado ao arquivar — fecha a sessão no analytics, avisa telemetria etc. */
  onExpire?: (roomId: string) => void;
  /** Persistência para recuperação pós-restart (salas voltam em até TTL). */
  store?: {
    save: (room: PersistedRoom) => void;
    touch: (roomId: string, lastActivityMs: number) => void;
    remove: (roomId: string) => void;
  };
}

/** Atividade é persistida no máximo a cada 30s — voto/timer não vira I/O por tick. */
const TOUCH_THROTTLE_MS = 30_000;

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 60 * 1000;

export class RoomManager {
  private rooms = new Map<string, Room>();
  private readonly ttlMs: number;
  private readonly onExpire?: (roomId: string) => void;
  private readonly store?: RoomManagerOptions['store'];
  private lastPersistedTouch = new Map<string, number>();

  constructor(private onStateUpdate: RoomStateListener, options: RoomManagerOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.onExpire = options.onExpire;
    this.store = options.store;
    // Varredura periódica; unref para não segurar o processo vivo.
    const timer = setInterval(() => this.sweepExpired(), SWEEP_INTERVAL_MS);
    if (timer.unref) timer.unref();
  }

  /**
   * Arquiva salas paradas há mais que o TTL. Uma competição não fica um dia
   * inteiro sem um único voto/timer/conexão — sala nesse estado é lixo de
   * memória, e arquivar devolve o código de 4 letras ao pool.
   * Público para testes e para varredura manual.
   */
  sweepExpired(now = Date.now()): string[] {
    const expired: string[] = [];
    for (const [roomId, room] of this.rooms) {
      if (now - room.lastActivityAt > this.ttlMs) {
        this.rooms.delete(roomId);
        this.lastPersistedTouch.delete(roomId);
        this.store?.remove(roomId);
        expired.push(roomId);
      }
    }
    for (const roomId of expired) this.onExpire?.(roomId);
    return expired;
  }

  createRoom(locale?: Locale): RoomAccessPayload {
    const roomId = this.generateRoomId();
    const state = new RoomState(locale);
    const adminPin = this.generateAdminPin();
    const refereeTokens = this.generateRefereeTokens();

    const room: Room = {
      id: roomId,
      adminPin,
      refereeTokens,
      state,
      createdAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.attachActivityTracking(room);
    this.rooms.set(roomId, room);
    this.store?.save({ roomId, adminPin, refereeTokens, createdAt: room.createdAt, lastActivityAt: room.lastActivityAt });

    return this.toRoomAccessPayload(room);
  }

  /** Religa uma sala persistida (pós-restart) com o MESMO código, PIN e QRs. */
  restoreRoom(rec: PersistedRoom): boolean {
    if (this.rooms.has(rec.roomId)) return false;
    const room: Room = {
      id: rec.roomId,
      adminPin: rec.adminPin,
      refereeTokens: rec.refereeTokens as RefereeTokens,
      state: new RoomState(),
      createdAt: rec.createdAt,
      lastActivityAt: rec.lastActivityAt
    };
    this.attachActivityTracking(room);
    this.rooms.set(room.id, room);
    return true;
  }

  private attachActivityTracking(room: Room): void {
    // onSnapshot emite imediatamente ao assinar — essa emissão inicial não é
    // atividade (senão restaurar uma sala velha a "rejuvenesceria").
    let initialEmit = true;
    room.state.onSnapshot((snapshot) => {
      if (initialEmit) {
        initialEmit = false;
        this.onStateUpdate(room.id, snapshot);
        return;
      }
      room.lastActivityAt = Date.now();
      const last = this.lastPersistedTouch.get(room.id) ?? 0;
      if (room.lastActivityAt - last > TOUCH_THROTTLE_MS) {
        this.lastPersistedTouch.set(room.id, room.lastActivityAt);
        this.store?.touch(room.id, room.lastActivityAt);
      }
      this.onStateUpdate(room.id, snapshot);
    });
  }

  verifyAdminPin(roomId: string, pin?: string) {
    if (!pin) return false;
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.adminPin === pin;
  }

  getRoomAccess(roomId: string, pin: string) {
    if (!this.verifyAdminPin(roomId, pin)) {
      return null;
    }
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return this.toRoomAccessPayload(room);
  }

  getRefereeTokens(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return { ...room.refereeTokens };
  }

  rotateRefereeTokens(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    room.refereeTokens = this.generateRefereeTokens();
    room.state.setAllConnected(false);
    this.store?.save({
      roomId: room.id,
      adminPin: room.adminPin,
      refereeTokens: room.refereeTokens,
      createdAt: room.createdAt,
      lastActivityAt: room.lastActivityAt
    });
    return this.toRoomAccessPayload(room);
  }

  isValidRefToken(roomId: string, judge: Judge, token?: string) {
    if (!token) return false;
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.refereeTokens[judge] === token;
  }

  getRoomState(roomId: string) {
    return this.rooms.get(roomId)?.state ?? null;
  }

  listRooms(): Array<{ id: string; createdAt: number; connectedJudges: number; phase: string }> {
    return [...this.rooms.values()].map((room) => {
      const snapshot = room.state.getSnapshot();
      const connectedJudges = [snapshot.connected.left, snapshot.connected.center, snapshot.connected.right].filter(Boolean).length;
      return { id: room.id, createdAt: room.createdAt, connectedJudges, phase: snapshot.phase };
    });
  }

  roomCount(): number {
    return this.rooms.size;
  }

  private toRoomAccessPayload(room: Room): RoomAccessPayload {
    return {
      roomId: room.id,
      adminPin: room.adminPin,
      joinQRCodes: {
        left: { token: room.refereeTokens.left },
        center: { token: room.refereeTokens.center },
        right: { token: room.refereeTokens.right }
      }
    };
  }

  private readonly alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  private generateRoomId() {
    let candidate: string;
    do {
      candidate = [...crypto.randomBytes(4)]
        .map((value) => this.alphabet[value % this.alphabet.length])
        .join('');
    } while (this.rooms.has(candidate));
    return candidate;
  }

  private generateAdminPin() {
    return String(1000 + Math.floor(Math.random() * 9000));
  }

  private generateRefereeTokens(): RefereeTokens {
    return {
      left: this.generateToken(),
      center: this.generateToken(),
      right: this.generateToken()
    };
  }

  private generateToken() {
    return crypto.randomBytes(9).toString('base64url');
  }

}
