/**
 * socket.io-client para as telas universais: a mesma API usada pelo
 * useRoomSocket, por cima do cliente mínimo do public/compat/rl.js
 * (WebSocket e, sem ele, HTTP comum).
 */
type Handler = (...args: unknown[]) => void;
type RLSocket = {
  on(ev: string, fn: Handler): void;
  emit(ev: string, payload?: unknown, ack?: Handler): void;
  open(): void;
  close(): void;
  connected: boolean;
  handlers: Record<string, Handler[]>;
};
type CompatWindow = { RL: { Socket: new (base: string) => RLSocket } };

export function io(url: string) {
  const base = String(url).replace(/\/$/, '');
  const s = new (window as unknown as CompatWindow).RL.Socket(base);
  const api = {
    get connected() {
      return s.connected;
    },
    on(ev: string, fn: Handler) {
      // o socket.io entrega Error no connect_error
      if (ev === 'connect_error') s.on(ev, (msg: unknown) => fn(new Error(String(msg))));
      else s.on(ev, fn);
      return api;
    },
    emit(ev: string, payload?: unknown, ack?: Handler) {
      s.emit(ev, payload, ack);
      return api;
    },
    connect() {
      s.open();
      return api;
    },
    disconnect() {
      const was = s.connected;
      s.close();
      if (was) (s.handlers.disconnect || []).forEach((fn) => fn('io client disconnect'));
      return api;
    },
    removeAllListeners() {
      s.handlers = {};
      return api;
    }
  };
  return api;
}

export type Socket = ReturnType<typeof io>;
export default io;
