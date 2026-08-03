// Ciclo de vida das salas: sala sem atividade é arquivada após o TTL,
// o código volta ao pool e o callback de expiração fecha a sessão.
import { describe, expect, it, vi } from 'vitest';
import { RoomManager } from '../src/rooms.js';

const HOUR = 3600_000;

describe('arquivamento de salas por inatividade', () => {
  it('arquiva sala parada além do TTL e libera o código', () => {
    const expired: string[] = [];
    const rm = new RoomManager(() => {}, { ttlMs: 24 * HOUR, onExpire: (id) => expired.push(id) });
    const { roomId } = rm.createRoom();
    expect(rm.roomCount()).toBe(1);

    // 23h depois: ainda viva
    expect(rm.sweepExpired(Date.now() + 23 * HOUR)).toEqual([]);
    expect(rm.roomCount()).toBe(1);

    // 25h depois: arquivada
    expect(rm.sweepExpired(Date.now() + 25 * HOUR)).toEqual([roomId]);
    expect(rm.roomCount()).toBe(0);
    expect(expired).toEqual([roomId]);
    expect(rm.getRoomState(roomId)).toBeNull();
  });

  it('atividade na sala (voto, conexão) adia o arquivamento', () => {
    vi.useFakeTimers();
    try {
      const start = Date.now();
      const rm = new RoomManager(() => {}, { ttlMs: 24 * HOUR });
      const { roomId } = rm.createRoom();

      // 20h depois, alguém mexe na sala (qualquer snapshot conta)
      vi.setSystemTime(start + 20 * HOUR);
      rm.getRoomState(roomId)!.setConnected('left', true);

      // 30h após a criação (10h após a atividade): ainda viva
      expect(rm.sweepExpired(start + 30 * HOUR)).toEqual([]);
      expect(rm.roomCount()).toBe(1);

      // 45h após a criação (25h sem atividade): arquivada
      expect(rm.sweepExpired(start + 45 * HOUR)).toEqual([roomId]);
    } finally {
      vi.useRealTimers();
    }
  });
});
