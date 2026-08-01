import crypto from 'node:crypto';

import { RoomState, type AppState, type Judge } from './state.js';

type RefereeTokens = Record<Judge, string>;

interface Room {
  id: string;
  adminPin: string;
  refereeTokens: RefereeTokens;
  state: RoomState;
  createdAt: number;
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

export class RoomManager {
  private rooms = new Map<string, Room>();

  constructor(private onStateUpdate: RoomStateListener) {}

  createRoom(): RoomAccessPayload {
    const roomId = this.generateRoomId();
    const state = new RoomState();
    const adminPin = this.generateAdminPin();
    const refereeTokens = this.generateRefereeTokens();

    state.onSnapshot((snapshot) => {
      this.onStateUpdate(roomId, snapshot);
    });

    const room: Room = {
      id: roomId,
      adminPin,
      refereeTokens,
      state,
      createdAt: Date.now()
    };

    this.rooms.set(roomId, room);

    return this.toRoomAccessPayload(room);
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

  listRooms(): Array<{ id: string; createdAt: number; connectedJudges: number }> {
    return [...this.rooms.values()].map((room) => {
      const snapshot = room.state.getSnapshot();
      const connectedJudges = [snapshot.connected.left, snapshot.connected.center, snapshot.connected.right].filter(Boolean).length;
      return { id: room.id, createdAt: room.createdAt, connectedJudges };
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
