// Ciclo de vida das salas: sala sem atividade é arquivada após o TTL,
// o código volta ao pool e o callback de expiração fecha a sessão.
import { describe, expect, it, vi } from 'vitest';
import { RoomManager, type PersistedRoom } from '../src/rooms.js';

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

describe('recuperação de salas pós-restart', () => {
  it('sala persistida volta com o mesmo código, PIN e tokens', () => {
    const saved: PersistedRoom[] = [];
    const rm1 = new RoomManager(() => {}, {
      store: { save: (r) => saved.push(r), touch: () => {}, remove: () => {} }
    });
    const created = rm1.createRoom();
    expect(saved).toHaveLength(1);

    // "restart": novo manager, restaura do que foi persistido
    const rm2 = new RoomManager(() => {});
    expect(rm2.restoreRoom(saved[0])).toBe(true);
    expect(rm2.verifyAdminPin(created.roomId, created.adminPin)).toBe(true);
    expect(rm2.isValidRefToken(created.roomId, 'left', created.joinQRCodes.left.token)).toBe(true);
    // código ocupado: não deixa duplicar
    expect(rm2.restoreRoom(saved[0])).toBe(false);
  });

  it('sala restaurada com atividade antiga expira na primeira varredura', () => {
    const HOUR2 = 3600_000;
    const rm = new RoomManager(() => {}, { ttlMs: 24 * HOUR2 });
    rm.restoreRoom({
      roomId: 'VELH',
      adminPin: '1234',
      refereeTokens: { left: 'a', center: 'b', right: 'c' },
      createdAt: Date.now() - 30 * HOUR2,
      lastActivityAt: Date.now() - 25 * HOUR2
    });
    expect(rm.sweepExpired()).toEqual(['VELH']);
  });
});
