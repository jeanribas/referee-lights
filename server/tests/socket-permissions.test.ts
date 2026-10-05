// Matriz de permissões do websocket por papel + fluxo de decisão completo e
// payloads malformados. Servidor real em porta efêmera, clientes socket.io
// reais. Banco isolado; envio externo desligado.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { io as ioClient, type Socket } from 'socket.io-client';

process.env.TELEMETRY_ENABLED = 'false';
process.env.GEO_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';
process.env.MASTER_USER = 'test-user';
process.env.MASTER_PASSWORD = 'test-password';
process.env.MASTER_TOKEN_SECRET = 'test-secret';

const dataDir = mkdtempSync(path.join(tmpdir(), 'rl-socket-'));
process.env.ANALYTICS_DB_PATH = path.join(dataDir, 'analytics.db');

type App = Awaited<ReturnType<typeof import('../src/server.js')['createServer']>>;
type Ack = { ok: true } | { error: string };
type Snapshot = {
  phase: string;
  votes: Record<string, string | null>;
  cards: Record<string, number[]>;
  timerMs: number;
  running: boolean;
  connected: Record<string, boolean>;
  intervalMs: number;
  intervalConfiguredMs: number;
  intervalRunning: boolean;
  intervalVisible: boolean;
  locale: string;
  legendConfig: Record<string, unknown>;
};
interface Room {
  roomId: string;
  adminPin: string;
  joinQRCodes: Record<'left' | 'center' | 'right', { token: string }>;
}

let app: App;
let baseUrl = '';
const sockets: Socket[] = [];

async function createRoom(): Promise<Room> {
  const res = await app.inject({ method: 'POST', url: '/rooms', payload: {} });
  return res.json() as Room;
}

/** Cliente conectado que guarda o último snapshot recebido. */
async function connect(): Promise<Socket & { last?: Snapshot }> {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true, reconnection: false }) as Socket & {
    last?: Snapshot;
  };
  sockets.push(socket);
  socket.on('state:update', (s: Snapshot) => {
    socket.last = s;
  });
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', reject);
  });
  return socket;
}

function emitAck(socket: Socket, event: string, ...args: unknown[]): Promise<Ack> {
  return socket.timeout(3000).emitWithAck(event, ...args) as Promise<Ack>;
}

async function register(role: string, room: Room, overrides: Record<string, unknown> = {}) {
  const socket = await connect();
  const payload: Record<string, unknown> = { role, roomId: room.roomId };
  if (role === 'admin' || role === 'display') payload.pin = room.adminPin;
  if (role === 'left' || role === 'center' || role === 'right') {
    payload.token = room.joinQRCodes[role as 'left'].token;
  }
  const ack = await emitAck(socket, 'client:register', { ...payload, ...overrides });
  return { socket, ack };
}

async function waitFor(socket: Socket & { last?: Snapshot }, pred: (s: Snapshot) => boolean, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (socket.last && pred(socket.last)) return socket.last;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error(`condição não atingida; último estado: ${JSON.stringify(socket.last)}`);
}

beforeAll(async () => {
  const { createServer } = await import('../src/server.js');
  app = await createServer();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (!addr || typeof addr === 'string') throw new Error('sem endereço');
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterEach(() => {
  while (sockets.length) sockets.pop()?.disconnect();
});

afterAll(async () => {
  await app.close();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('client:register', () => {
  it('cada papel registra com credenciais corretas', async () => {
    const room = await createRoom();
    for (const role of ['admin', 'display', 'left', 'center', 'right']) {
      const { ack } = await register(role, room);
      expect(ack).toEqual({ ok: true });
    }
  });

  it('recusa PIN errado, token errado, token de outro juiz, sala inexistente e payload vazio', async () => {
    const room = await createRoom();
    expect((await register('admin', room, { pin: '0000' })).ack).toEqual({ error: 'invalid_pin' });
    expect((await register('display', room, { pin: undefined })).ack).toEqual({ error: 'invalid_pin' });
    expect((await register('left', room, { token: 'nope' })).ack).toEqual({ error: 'invalid_token' });
    expect((await register('left', room, { token: room.joinQRCodes.right.token })).ack).toEqual({
      error: 'invalid_token'
    });
    expect((await register('admin', room, { roomId: 'ZZZZZZ' })).ack).toEqual({ error: 'room_not_found' });
    const s = await connect();
    expect(await emitAck(s, 'client:register', {})).toEqual({ error: 'invalid_payload' });
    expect(await emitAck(s, 'client:register', null)).toEqual({ error: 'invalid_payload' });
    // papel desconhecido não pode entrar no canal da sala sem credencial
    expect(await emitAck(s, 'client:register', { role: 'superadmin', roomId: room.roomId })).toEqual({
      error: 'invalid_payload'
    });
  });

  it('papel viewer (removido) é recusado e não entra no canal da sala', async () => {
    const room = await createRoom();
    const s = await connect();
    expect(await emitAck(s, 'client:register', { role: 'viewer', roomId: room.roomId })).toEqual({
      error: 'invalid_payload'
    });
    const { socket: admin } = await register('admin', room);
    expect(await emitAck(admin, 'admin:ready')).toEqual({ ok: true });
    await new Promise((r) => setTimeout(r, 150));
    expect((s as Socket & { last?: Snapshot }).last).toBeUndefined();
  });

  it('PIN de outra sala não abre esta', async () => {
    const a = await createRoom();
    const b = await createRoom();
    expect((await register('admin', a, { pin: b.adminPin })).ack).toEqual({ error: 'invalid_pin' });
  });

  it('token rotacionado deixa de valer', async () => {
    const room = await createRoom();
    await app.inject({
      method: 'POST',
      url: `/rooms/${room.roomId}/refresh-ref-tokens`,
      payload: { adminPin: room.adminPin }
    });
    expect((await register('left', room)).ack).toEqual({ error: 'invalid_token' });
  });
});

describe('matriz de permissões', () => {
  const adminEvents: Array<[string, unknown[]]> = [
    ['admin:ready', []],
    ['admin:release', []],
    ['admin:clear', []],
    ['interval:command', [{ action: 'show' }]],
    ['locale:change', [{ locale: 'en-US' }]],
    [
      'legend:config',
      [
        {
          config: {
            bgColor: '#000000',
            timerColor: '#FFFFFF',
            digitMode: 'mmss',
            showPlaceholders: true,
            showDashedFrame: true,
            keepAwake: true
          }
        }
      ]
    ]
  ];

  it.each(adminEvents)('%s: admin/display ok, juízes e não registrados recusados', async (event, args) => {
    const room = await createRoom();
    for (const role of ['admin', 'display']) {
      const { socket } = await register(role, room);
      expect(await emitAck(socket, event, ...args)).toEqual({ ok: true });
    }
    for (const role of ['left', 'center', 'right']) {
      const { socket } = await register(role, room);
      expect(await emitAck(socket, event, ...args)).toEqual({ error: 'not_authorised' });
    }
    const anon = await connect();
    expect(await emitAck(anon, event, ...args)).toEqual({ error: 'not_authorised' });
  });

  it('ref:vote / ref:card: só juízes', async () => {
    const room = await createRoom();
    for (const role of ['admin', 'display']) {
      const { socket } = await register(role, room);
      expect(await emitAck(socket, 'ref:vote', { vote: 'white' })).toEqual({ error: 'not_authorised' });
      expect(await emitAck(socket, 'ref:card', { card: 1 })).toEqual({ error: 'not_authorised' });
    }
    const anon = await connect();
    expect(await emitAck(anon, 'ref:vote', { vote: 'white' })).toEqual({ error: 'not_authorised' });
    const { socket } = await register('left', room);
    expect(await emitAck(socket, 'ref:vote', { vote: 'white' })).toEqual({ ok: true });
  });

  it('timer:command: admin, display e juiz central; laterais não', async () => {
    const room = await createRoom();
    for (const role of ['admin', 'display', 'center']) {
      const { socket } = await register(role, room);
      expect(await emitAck(socket, 'timer:command', { action: 'reset' })).toEqual({ ok: true });
    }
    for (const role of ['left', 'right']) {
      const { socket } = await register(role, room);
      expect(await emitAck(socket, 'timer:command', { action: 'start' })).toEqual({ error: 'not_authorised' });
    }
  });

  it('juiz perde acesso quando os tokens são rotacionados com ele conectado', async () => {
    const room = await createRoom();
    const { socket } = await register('left', room);
    await app.inject({
      method: 'POST',
      url: `/rooms/${room.roomId}/refresh-ref-tokens`,
      payload: { adminPin: room.adminPin }
    });
    expect(await emitAck(socket, 'ref:vote', { vote: 'white' })).toEqual({ error: 'invalid_token' });
  });

  it('salas isoladas: voto na sala A não aparece na sala B', async () => {
    const a = await createRoom();
    const b = await createRoom();
    const adminB = (await register('admin', b)).socket as Socket & { last?: Snapshot };
    const leftA = (await register('left', a)).socket;
    await emitAck(leftA, 'ref:vote', { vote: 'red' });
    await new Promise((r) => setTimeout(r, 200));
    expect(adminB.last?.votes.left).toBeNull();
    expect(adminB.last?.connected.left).toBe(false);
  });
});

describe('fluxo de decisão', () => {
  it('3 votos revelam; cartões; clear/ready zeram; release força revelação', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket as Socket & { last?: Snapshot };
    const left = (await register('left', room)).socket;
    const center = (await register('center', room)).socket;
    const right = (await register('right', room)).socket;
    await waitFor(admin, (s) => s.connected.left && s.connected.center && s.connected.right);

    await emitAck(left, 'ref:vote', { vote: 'white' });
    await emitAck(center, 'ref:card', { card: 2 });
    await emitAck(center, 'ref:card', { card: 3 });
    expect(admin.last?.phase).toBe('idle');
    await emitAck(right, 'ref:vote', { vote: 'red' });
    await emitAck(right, 'ref:card', { card: 1 });
    // revelou no 3º voto; cartão depois da revelação ainda é aceito na sala
    const revealed = await waitFor(admin, (s) => s.phase === 'revealed');
    expect(revealed.votes).toEqual({ left: 'white', center: 'red', right: 'red' });
    expect(revealed.cards.center).toEqual([2, 3]);

    // voto após revelação é ignorado
    await emitAck(left, 'ref:vote', { vote: 'red' });
    expect(admin.last?.votes.left).toBe('white');

    await emitAck(admin, 'admin:clear');
    await waitFor(admin, (s) => s.phase === 'idle' && s.votes.left === null && s.cards.center.length === 0);

    // release revela mesmo sem os 3 votos
    await emitAck(left, 'ref:vote', { vote: 'white' });
    await emitAck(admin, 'admin:release');
    await waitFor(admin, (s) => s.phase === 'revealed' && s.votes.left === 'white' && s.votes.right === null);

    await emitAck(admin, 'admin:ready');
    await waitFor(admin, (s) => s.phase === 'idle' && s.votes.left === null);
  });

  it('depois da revelação um cartão não transforma luz branca em vermelha', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket as Socket & { last?: Snapshot };
    const left = (await register('left', room)).socket;
    const center = (await register('center', room)).socket;
    const right = (await register('right', room)).socket;
    await emitAck(left, 'ref:vote', { vote: 'white' });
    await emitAck(center, 'ref:vote', { vote: 'white' });
    await emitAck(right, 'ref:vote', { vote: 'red' });
    await waitFor(admin, (s) => s.phase === 'revealed');
    // o juiz que deu vermelho ainda completa o cartão (UI manda voto e cartão em sequência)
    await emitAck(right, 'ref:card', { card: 1 });
    await waitFor(admin, (s) => s.cards.right.join() === '1');
    // mas quem deu branco não pode virar vermelho com a decisão já exibida
    await emitAck(left, 'ref:card', { card: 3 });
    await new Promise((r) => setTimeout(r, 150));
    expect(admin.last?.votes.left).toBe('white');
    expect(admin.last?.cards.left).toEqual([]);
  });

  it('cartão alterna (toggle) e no máximo 3', async () => {
    const room = await createRoom();
    const left = (await register('left', room)).socket as Socket & { last?: Snapshot };
    for (const card of [1, 2, 3]) await emitAck(left, 'ref:card', { card });
    await waitFor(left, (s) => s.cards.left.length === 3 && s.votes.left === 'red');
    await emitAck(left, 'ref:card', { card: 2 });
    await waitFor(left, (s) => s.cards.left.join() === '1,3');
    await emitAck(left, 'ref:card', { card: null });
    await waitFor(left, (s) => s.cards.left.length === 0);
  });

  it('desconexão do juiz marca connected=false', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket as Socket & { last?: Snapshot };
    const left = (await register('left', room)).socket;
    await waitFor(admin, (s) => s.connected.left);
    left.disconnect();
    await waitFor(admin, (s) => !s.connected.left);
  });

  it('timer: set/start/stop/reset e intervalo set/start/stop/hide/show/reset', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket as Socket & { last?: Snapshot };
    await emitAck(admin, 'timer:command', { action: 'set', seconds: 90 });
    await waitFor(admin, (s) => s.running && s.timerMs <= 90_000 && s.timerMs > 85_000);
    await emitAck(admin, 'timer:command', { action: 'stop' });
    await waitFor(admin, (s) => !s.running);
    await emitAck(admin, 'timer:command', { action: 'reset' });
    await waitFor(admin, (s) => s.timerMs === 60_000 && !s.running);
    expect(await emitAck(admin, 'timer:command', { action: 'explode' })).toEqual({ error: 'unknown_action' });

    await emitAck(admin, 'interval:command', { action: 'set', seconds: 600 });
    // Definir não troca o display: só Iniciar mostra o intervalo
    await waitFor(admin, (s) => s.intervalConfiguredMs === 600_000 && !s.intervalVisible);
    await emitAck(admin, 'interval:command', { action: 'start' });
    await waitFor(admin, (s) => s.intervalRunning && s.intervalMs < 600_000 && s.intervalVisible);
    await emitAck(admin, 'interval:command', { action: 'stop' });
    await waitFor(admin, (s) => !s.intervalRunning);
    await emitAck(admin, 'interval:command', { action: 'hide' });
    await waitFor(admin, (s) => !s.intervalVisible);
    await emitAck(admin, 'interval:command', { action: 'show' });
    await waitFor(admin, (s) => s.intervalVisible);
    // Resetar volta o tempo ao configurado e o display para as luzes
    await emitAck(admin, 'interval:command', { action: 'reset' });
    await waitFor(admin, (s) => s.intervalMs === 600_000 && !s.intervalVisible);
  });

  it('locale:change propaga para todos da sala e recusa locale inválido', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket;
    const ref = (await register('center', room)).socket as Socket & { last?: Snapshot };
    const got = new Promise<string>((resolve) => ref.once('locale:change', resolve));
    expect(await emitAck(admin, 'locale:change', { locale: 'es-ES' })).toEqual({ ok: true });
    expect(await got).toBe('es-ES');
    await waitFor(ref, (s) => s.locale === 'es-ES');
    expect(await emitAck(admin, 'locale:change', { locale: 'fr-FR' })).toEqual({ error: 'invalid_payload' });
  });

  it('legend:config valida campos', async () => {
    const room = await createRoom();
    const admin = (await register('display', room)).socket;
    expect(await emitAck(admin, 'legend:config', { config: { bgColor: 'red' } })).toEqual({ error: 'invalid_payload' });
    expect(await emitAck(admin, 'legend:config', {})).toEqual({ error: 'invalid_payload' });
  });
});

describe('payloads malformados não derrubam o servidor', () => {
  // Qualquer cliente anônimo alcança estes handlers; uma exceção síncrona
  // dentro deles vira uncaughtException → process.exit(1) em produção.
  it('payload ausente/nulo/tipos errados em todos os eventos', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket as Socket & { last?: Snapshot };
    const center = (await register('center', room)).socket;

    for (const bad of [undefined, null, 'x', 42, { vote: 'blue' }, { vote: { $gt: 1 } }]) {
      const ack = await emitAck(center, 'ref:vote', bad);
      expect(ack).toEqual({ error: 'invalid_payload' });
    }
    for (const bad of [undefined, null, { card: 7 }, { card: '1' }]) {
      expect(await emitAck(center, 'ref:card', bad)).toEqual({ error: 'invalid_payload' });
    }
    for (const bad of [undefined, null, { action: 'set', seconds: 'abc' }, { action: 'set', seconds: -5 }]) {
      expect(await emitAck(admin, 'timer:command', bad)).toEqual({ error: 'invalid_payload' });
    }
    for (const bad of [undefined, null, { action: 'set', seconds: 'abc' }]) {
      expect(await emitAck(admin, 'interval:command', bad)).toEqual({ error: 'invalid_payload' });
    }
    expect(await emitAck(admin, 'locale:change', null)).toEqual({ error: 'invalid_payload' });

    // o estado segue íntegro e o servidor responde
    const snap = await waitFor(admin, () => true);
    expect(Number.isFinite(snap.timerMs)).toBe(true);
    expect(snap.votes.center).toBeNull();
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
  });

  it('eventos sem callback de ack não quebram', async () => {
    const room = await createRoom();
    const admin = (await register('admin', room)).socket;
    admin.emit('admin:ready');
    admin.emit('timer:command', null);
    admin.emit('ref:vote', null);
    await new Promise((r) => setTimeout(r, 200));
    expect(await emitAck(admin, 'timer:command', { action: 'reset' })).toEqual({ ok: true });
  });

  it('"ack" que não é função (cliente anônimo) não derruba o servidor', async () => {
    const anon = await connect();
    anon.emit('admin:ready', 'nao-e-funcao');
    anon.emit('ref:vote', { vote: 'white' }, 123);
    anon.emit('client:register', { role: 'admin', roomId: 'ZZZZZZ' }, 'x');
    await new Promise((r) => setTimeout(r, 200));
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    const room = await createRoom();
    expect((await register('admin', room)).ack).toEqual({ ok: true });
  });
});
