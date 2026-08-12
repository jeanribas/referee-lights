// A sala nasce no idioma de quem a criou.
//
// Antes, a sala sempre nascia em pt-BR. Como as telas de operação adotam o
// idioma da SALA, quem criava a sessão com a interface em inglês era jogado
// para o português ao entrar — e o NEXT_LOCALE gravado ali levava a troca para
// o site inteiro.
import { describe, expect, it } from 'vitest';
import { RoomManager } from '../src/rooms.js';
import type { Locale } from '../src/state.js';

function manager() {
  return new RoomManager(() => {});
}

function localeOf(rm: RoomManager, roomId: string): string | undefined {
  return rm.getRoomState(roomId)?.getSnapshot().locale;
}

describe('idioma da sala na criação', () => {
  it('cria a sala no idioma pedido', () => {
    const rm = manager();
    const { roomId } = rm.createRoom('en-US');
    expect(localeOf(rm, roomId)).toBe('en-US');
  });

  it('aceita os três idiomas suportados', () => {
    const rm = manager();
    for (const locale of ['pt-BR', 'en-US', 'es-ES'] as Locale[]) {
      const { roomId } = rm.createRoom(locale);
      expect(localeOf(rm, roomId)).toBe(locale);
    }
  });

  it('cai no padrão quando não recebe idioma (cliente antigo)', () => {
    const rm = manager();
    const { roomId } = rm.createRoom();
    expect(localeOf(rm, roomId)).toBe('pt-BR');
  });

  it('salas diferentes não compartilham idioma', () => {
    const rm = manager();
    const en = rm.createRoom('en-US');
    const es = rm.createRoom('es-ES');
    expect(localeOf(rm, en.roomId)).toBe('en-US');
    expect(localeOf(rm, es.roomId)).toBe('es-ES');
  });
});
