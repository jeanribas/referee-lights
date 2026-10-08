import fastifyCors from '@fastify/cors';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { Server as SocketIOServer, type Socket } from 'socket.io';

/** Versão do pacote (server/package.json). */
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
}

import geoip from 'geoip-lite';
import { AnalyticsStore } from './analytics.js';
import { config } from './config.js';
import { resolveClientIp } from './client-ip.js';
import { KeyRelay } from './key-relay.js';
import { attachFrontend } from './next-host.js';
import { registerAppUpdate } from './app-update.js';
import { failureBlocked, rateLimitOk, recordFailure } from './rate-limit.js';
import { generateMasterToken, validateCredentials, verifyMasterToken } from './master-auth.js';
import { RoomManager } from './rooms.js';
import { Telemetry } from './telemetry.js';
import {
  type AppState,
  type CardValue,
  type Judge,
  type LegendConfig,
  type Locale,
  type VoteValue
} from './state.js';

type Role = 'admin' | 'display' | Judge;

const ADMIN_ROLE: Role = 'admin';
const DISPLAY_ROLE: Role = 'display';
const JUDGE_ROLES: Judge[] = ['left', 'center', 'right'];

interface ClientData {
  /** Ausente até o client:register ser aceito. */
  role?: Role;
  roomId?: string;
  adminPin?: string;
  refereeToken?: string;
  judgeRole?: Judge;
  connectionId?: number;
  frontendHost?: string;
}

type RegistrationPayload = {
  role: Role;
  roomId: string;
  pin?: string;
  token?: string;
  host?: string;
};

type VotePayload = {
  vote: VoteValue;
};

type CardPayload = {
  card: CardValue;
};

type TimerPayload = {
  action: 'start' | 'stop' | 'reset' | 'set';
  seconds?: number;
};

type IntervalPayload = {
  action: 'start' | 'stop' | 'reset' | 'set' | 'show' | 'hide';
  seconds?: number;
};

type LocalePayload = {
  locale: Locale;
};

type LegendConfigPayload = {
  config: LegendConfig;
};

type AckResponse = { ok: true } | { error: string };

type ClientToServerEvents = {
  'client:register': (payload: RegistrationPayload, ack?: (response: AckResponse) => void) => void;
  'ref:vote': (payload: VotePayload, ack?: (response: AckResponse) => void) => void;
  'ref:card': (payload: CardPayload, ack?: (response: AckResponse) => void) => void;
  'admin:ready': (ack?: (response: AckResponse) => void) => void;
  'admin:release': (ack?: (response: AckResponse) => void) => void;
  'admin:clear': (ack?: (response: AckResponse) => void) => void;
  'timer:command': (payload: TimerPayload, ack?: (response: AckResponse) => void) => void;
  'interval:command': (payload: IntervalPayload, ack?: (response: AckResponse) => void) => void;
  'locale:change': (payload: LocalePayload, ack?: (response: AckResponse) => void) => void;
  'legend:config': (payload: LegendConfigPayload, ack?: (response: AckResponse) => void) => void;
};

type ServerToClientEvents = {
  'state:update': (snapshot: AppState) => void;
  'locale:change': (locale: Locale) => void;
};

type InterServerEvents = Record<string, never>;

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, ClientData>;

type AppSocketServer = SocketIOServer<ClientToServerEvents, ServerToClientEvents, InterServerEvents, ClientData>;

const ROOM_CHANNEL_PREFIX = 'room:';

/** Teto de eventos por socket por segundo (ver `on` no handler de conexão). */
const SOCKET_EVENTS_PER_SEC = 40;

const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'en-US', 'es-ES'];

function roomChannel(roomId: string) {
  return `${ROOM_CHANNEL_PREFIX}${roomId}`;
}

function isAdmin(role: Role | undefined): role is typeof ADMIN_ROLE {
  return role === ADMIN_ROLE;
}

function isDisplay(role: Role | undefined): role is typeof DISPLAY_ROLE {
  return role === DISPLAY_ROLE;
}

function isJudge(role: Role | undefined): role is Judge {
  return role !== undefined && (JUDGE_ROLES as string[]).includes(role);
}

export async function createServer() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL
    }
  });

  await app.register(fastifyCors, {
    origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  });

  // socket.io acoplado direto ao http.Server do Fastify (o plugin
  // fastify-socket.io não suporta Fastify 5)
  app.decorate('io', new SocketIOServer(app.server, {
    // Maior payload legítimo (legend:config) tem < 300 bytes; o padrão de 1MB
    // por mensagem só servia para inflar memória com lixo.
    maxHttpBufferSize: 16 * 1024,
    cors: {
      origin: config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    }
  }));
  app.addHook('onClose', (instance, done) => {
    instance.io.close();
    done();
  });

  const io = app.io as AppSocketServer;

  const keyRelay = new KeyRelay();
  const keyRelayAvailable = config.KEY_RELAY_AVAILABLE;

  const lastPhaseByRoom = new Map<string, string>();
  // Conexões vivas por árbitro (sala:juiz). O árbitro só aparece como
  // desconectado quando a ÚLTIMA cai: com Wi-Fi instável o celular reconecta
  // antes de o servidor perceber a morte da conexão antiga (até ~45 s), e
  // essa queda atrasada apagava a luz de um árbitro que estava votando.
  const judgeConnections = new Map<string, number>();
  const judgeKey = (roomId: string, judge: Judge) => `${roomId}:${judge}`;
  const judgeUp = (roomId: string, judge: Judge) => {
    const k = judgeKey(roomId, judge);
    judgeConnections.set(k, (judgeConnections.get(k) ?? 0) + 1);
    roomManager.getRoomState(roomId)?.setConnected(judge, true);
  };
  const judgeDown = (roomId: string, judge: Judge) => {
    const k = judgeKey(roomId, judge);
    const left = Math.max(0, (judgeConnections.get(k) ?? 1) - 1);
    if (left === 0) judgeConnections.delete(k);
    else judgeConnections.set(k, left);
    if (left === 0) roomManager.getRoomState(roomId)?.setConnected(judge, false);
  };
  const roomManager = new RoomManager((roomId, snapshot) => {
    io.to(roomChannel(roomId)).emit('state:update', snapshot);
    const snap = snapshot as { phase: string; votes: Record<string, string | null> };
    keyRelay.onStateUpdate(roomId, snap);
    // Transição para 'revealed' = uma decisão concluída. Conta os cartões de
    // forma agregada — dado central de uso do produto.
    if (snap.phase === 'revealed' && lastPhaseByRoom.get(roomId) !== 'revealed') {
      const values = Object.values(snap.votes ?? {});
      telemetry.trackDecision(roomId, {
        white: values.filter((v) => v === 'white').length,
        red: values.filter((v) => v != null && v !== 'white').length
      });
    }
    lastPhaseByRoom.set(roomId, snap.phase);
  }, {
    ttlMs: config.ROOM_TTL_HOURS * 3600_000,
    onExpire: (roomId) => {
      // Arquiva: fecha a sessão registrada e derruba os sockets restantes —
      // clientes órfãos recebem room_not_found na próxima ação e recomeçam.
      const sessionId = sessionMap.get(roomId);
      if (sessionId != null) {
        analyticsStore.closeSession(sessionId);
        sessionMap.delete(roomId);
      }
      lastPhaseByRoom.delete(roomId);
      telemetry.trackRoomArchived(roomId);
      io.in(roomChannel(roomId)).disconnectSockets(true);
      app.log.info(`sala ${roomId} arquivada por inatividade`);
    },
    store: {
      save: (room) => analyticsStore.saveRoomState(room),
      touch: (roomId, ms) => analyticsStore.touchRoomState(roomId, ms),
      remove: (roomId) => analyticsStore.deleteRoomState(roomId)
    }
  });
  const analyticsStore = new AnalyticsStore(config.ANALYTICS_DB_PATH);
  const telemetry = new Telemetry(config.TELEMETRY_URL, config.TELEMETRY_ENABLED, readAppVersion());
  telemetry.setStatsProvider(() => ({
    ...analyticsStore.getStats(roomManager.roomCount()),
    rooms: roomManager.listRooms()
  }));
  const sessionMap = new Map<string, number>();

  // Recuperação pós-restart: salas com atividade nas últimas ROOM_TTL_HOURS
  // voltam com o mesmo código, PIN e QR codes — reiniciar a máquina no meio
  // (ou entre blocos) da competição não derruba a sala.
  {
    const restored = analyticsStore
      .loadRoomStates(config.ROOM_TTL_HOURS * 3600_000)
      .filter((rec) => roomManager.restoreRoom(rec));
    if (restored.length > 0) {
      app.log.info(`${restored.length} sala(s) recuperada(s) após restart: ${restored.map((r) => r.roomId).join(', ')}`);
    }
  }

  // X-Forwarded-For só é usado com TRUST_PROXY_HOPS > 0 (padrão 0 no bundle:
  // na LAN não há proxy e o header é forjável pelo cliente).
  function extractIp(request: { socket?: { remoteAddress?: string }; ip: string; headers: Record<string, string | string[] | undefined> }): string {
    return resolveClientIp(request.socket?.remoteAddress ?? request.ip, request.headers['x-forwarded-for'], config.TRUST_PROXY_HOPS);
  }

  function socketIp(socket: AppSocket): string {
    return resolveClientIp(socket.handshake.address, socket.handshake.headers['x-forwarded-for'], config.TRUST_PROXY_HOPS);
  }

  // Força bruta de PIN (4 dígitos) / token: 30 credenciais erradas por IP a
  // cada 10 min, somando HTTP (/rooms/:id/access, refresh, key relay) e socket.
  const AUTH_FAIL_LIMIT = 30;
  const AUTH_FAIL_WINDOW_MS = 10 * 60_000;
  const authFailKey = (ip: string) => `authfail:${ip}`;

  function isLoopback(ip: string): boolean {
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }

  function socketHost(socket: AppSocket): string {
    const host = socket.handshake.headers.host;
    if (typeof host === 'string') return host.split(':')[0];
    return '';
  }

  function mapRoleToPage(role: string): string {
    if (role === 'admin') return '/admin';
    if (role === 'display') return '/display';
    if (role === 'left' || role === 'center' || role === 'right') return `/ref/${role}`;
    return '/';
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.post<{ Body: { locale?: string } }>('/rooms', async (request, reply) => {
    // Criação em massa enche a memória e o pool de códigos de 4 letras.
    // Loopback (admin na própria máquina do bundle) não entra no limite.
    const ip = extractIp(request);
    if (!isLoopback(ip) && !rateLimitOk(`room:${ip}`, 30, 10 * 60_000)) {
      reply.code(429);
      return { error: 'rate_limited' };
    }
    // Idioma opcional e validado: cliente antigo (ou body ausente) segue caindo
    // no padrão do servidor, então a rota continua compatível.
    const requested = request.body?.locale;
    const locale = SUPPORTED_LOCALES.find((code) => code === requested);
    const data = roomManager.createRoom(locale);
    const sessionId = analyticsStore.logSessionCreated(data.roomId, data.adminPin);
    if (sessionId !== null) sessionMap.set(data.roomId, sessionId);
    telemetry.trackSessionCreated(data.roomId);
    analyticsStore.logAccess('room_created', data.roomId, ip);
    reply.code(201);
    return data;
  });

  app.post<{
    Params: { roomId: string };
    Body: { adminPin?: string };
  }>('/rooms/:roomId/access', async (request, reply) => {
    const { roomId } = request.params;
    const { adminPin } = request.body ?? {};

    const failKey = authFailKey(extractIp(request));
    if (failureBlocked(failKey, AUTH_FAIL_LIMIT)) {
      reply.code(429);
      return { error: 'too_many_attempts' };
    }

    const state = roomManager.getRoomState(roomId);
    if (!state) {
      reply.code(404);
      return { error: 'room_not_found' };
    }

    if (!roomManager.verifyAdminPin(roomId, adminPin)) {
      recordFailure(failKey, AUTH_FAIL_WINDOW_MS);
      reply.code(403);
      return { error: 'invalid_pin' };
    }

    const payload = roomManager.getRoomAccess(roomId, adminPin!);
    if (!payload) {
      reply.code(500);
      return { error: 'unknown_error' };
    }

    return payload;
  });

  app.post<{
    Params: { roomId: string };
    Body: { adminPin?: string };
  }>('/rooms/:roomId/refresh-ref-tokens', async (request, reply) => {
    const { roomId } = request.params;
    const { adminPin } = request.body ?? {};

    const failKey = authFailKey(extractIp(request));
    if (failureBlocked(failKey, AUTH_FAIL_LIMIT)) {
      reply.code(429);
      return { error: 'too_many_attempts' };
    }

    const state = roomManager.getRoomState(roomId);
    if (!state) {
      reply.code(404);
      return { error: 'room_not_found' };
    }

    if (!roomManager.verifyAdminPin(roomId, adminPin)) {
      recordFailure(failKey, AUTH_FAIL_WINDOW_MS);
      reply.code(403);
      return { error: 'invalid_pin' };
    }

    const payload = roomManager.rotateRefereeTokens(roomId);
    if (!payload) {
      reply.code(500);
      return { error: 'unknown_error' };
    }

    return payload;
  });

  io.on('connection', (socket: AppSocket) => {
    socket.data = {};

    // Rede de segurança: payload e ack vêm de qualquer cliente anônimo. Uma
    // exceção síncrona num handler virava uncaughtException → process.exit(1),
    // derrubando todas as salas. Aqui ela vira erro registrado e o socket segue.
    // Flood: um cliente legítimo manda poucos eventos por segundo (voto,
    // cartão, botão do admin). Acima de SOCKET_EVENTS_PER_SEC o excedente é
    // recusado; quem insiste (5x o limite na mesma janela) é desconectado.
    let floodWindowStart = 0;
    let floodCount = 0;
    const on = (event: keyof ClientToServerEvents, handler: (...args: unknown[]) => void) => {
      socket.on(event, ((...args: unknown[]) => {
        const now = Date.now();
        if (now - floodWindowStart >= 1000) {
          floodWindowStart = now;
          floodCount = 0;
        }
        floodCount += 1;
        if (floodCount > SOCKET_EVENTS_PER_SEC) {
          if (floodCount > SOCKET_EVENTS_PER_SEC * 5) {
            app.log.warn({ event: 'socket_flood', ip: socketIp(socket) }, 'socket desconectado por flood');
            socket.disconnect(true);
            return;
          }
          toAck(args[args.length - 1])?.({ error: 'rate_limited' });
          return;
        }
        try {
          handler(...args);
        } catch (error) {
          telemetry.trackError(`socket ${event}`, String((error as Error)?.message ?? error), errorDetails(error));
          app.log.error({ err: error, event }, 'socket_handler_error');
        }
      }) as never);
    };

    on('client:register', (rawPayload, rawAck) => {
      const ack = toAck(rawAck);
      const payload = parseRegistration(rawPayload);
      if (!payload) {
        ack?.({ error: 'invalid_payload' });
        return;
      }

      const failKey = authFailKey(socketIp(socket));
      if (failureBlocked(failKey, AUTH_FAIL_LIMIT)) {
        ack?.({ error: 'too_many_attempts' });
        return;
      }

      const state = roomManager.getRoomState(payload.roomId);
      if (!state) {
        ack?.({ error: 'room_not_found' });
        return;
      }

      if (isAdmin(payload.role) || isDisplay(payload.role)) {
        if (!roomManager.verifyAdminPin(payload.roomId, payload.pin)) {
          recordFailure(failKey, AUTH_FAIL_WINDOW_MS);
          ack?.({ error: 'invalid_pin' });
          return;
        }
      }

      if (isJudge(payload.role)) {
        if (!roomManager.isValidRefToken(payload.roomId, payload.role, payload.token)) {
          recordFailure(failKey, AUTH_FAIL_WINDOW_MS);
          ack?.({ error: 'invalid_token' });
          return;
        }
      }

      if (isJudge(socket.data.role) && socket.data.roomId && socket.data.judgeRole) {
        judgeDown(socket.data.roomId, socket.data.judgeRole);
      }

      if (socket.data.roomId) {
        socket.leave(roomChannel(socket.data.roomId));
      }

      socket.join(roomChannel(payload.roomId));
      socket.data.role = payload.role;
      socket.data.roomId = payload.roomId;
      socket.data.adminPin = payload.pin;
      socket.data.refereeToken = payload.token;
      socket.data.judgeRole = isJudge(payload.role) ? payload.role : undefined;
      socket.data.frontendHost = payload.host ?? '';

      if (socket.data.judgeRole) {
        judgeUp(payload.roomId, socket.data.judgeRole);
      }

      const clientHost = payload.host ?? socketHost(socket);
      const sessionId = sessionMap.get(payload.roomId) ?? analyticsStore.findSessionByRoomId(payload.roomId);
      const connId = analyticsStore.logConnection(
        sessionId,
        payload.role,
        isJudge(payload.role) ? payload.role : null,
        socketIp(socket),
        clientHost
      );
      if (connId !== null) socket.data.connectionId = connId;
      telemetry.trackConnection(payload.roomId, payload.role, socketIp(socket));

      ack?.({ ok: true });
      socket.emit('state:update', state.getSnapshot());
    });

    on('ref:vote', (payload, rawAck) => {
      const ack = toAck(rawAck);
      const judgeContext = ensureJudgeContext(socket, roomManager);
      if (!judgeContext.ok) {
        ack?.({ error: judgeContext.error });
        return;
      }
      const parsed = parseVote(payload);
      if (!parsed.ok) {
        ack?.({ error: 'invalid_payload' });
        return;
      }
      judgeContext.state.setVote(judgeContext.judge, parsed.vote);
      ack?.({ ok: true });
    });

    on('ref:card', (payload, rawAck) => {
      const ack = toAck(rawAck);
      const judgeContext = ensureJudgeContext(socket, roomManager);
      if (!judgeContext.ok) {
        ack?.({ error: judgeContext.error });
        return;
      }
      const parsed = parseCard(payload);
      if (!parsed.ok) {
        ack?.({ error: 'invalid_payload' });
        return;
      }
      judgeContext.state.setCard(judgeContext.judge, parsed.card);
      ack?.({ ok: true });
    });

    on('admin:ready', (rawAck) => {
      const ack = toAck(rawAck);
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }
      adminContext.state.setPhaseReady();
      ack?.({ ok: true });
    });

    on('admin:release', (rawAck) => {
      const ack = toAck(rawAck);
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }
      adminContext.state.releaseDecision();
      ack?.({ ok: true });
    });

    on('admin:clear', (rawAck) => {
      const ack = toAck(rawAck);
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }
      adminContext.state.clearDecision();
      ack?.({ ok: true });
    });

    on('timer:command', (payload, rawAck) => {
      const ack = toAck(rawAck);
      const timerContext = ensureTimerControllerContext(socket, roomManager);
      if (!timerContext.ok) {
        ack?.({ error: timerContext.error });
        return;
      }

      const command = parseTimedCommand(payload, ['start', 'stop', 'reset', 'set'] as const);
      if (!command.ok) {
        ack?.({ error: command.error });
        return;
      }

      switch (command.action) {
        case 'start':
          timerContext.state.startTimer();
          break;
        case 'stop':
          timerContext.state.stopTimer();
          break;
        case 'reset':
          timerContext.state.resetTimer();
          break;
        case 'set':
          timerContext.state.startTimerWithSeconds(command.seconds ?? 60);
          break;
        default:
          ack?.({ error: 'unknown_action' });
          return;
      }

      ack?.({ ok: true });
    });

    on('interval:command', (payload, rawAck) => {
      const ack = toAck(rawAck);
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }

      const command = parseTimedCommand(payload, ['start', 'stop', 'reset', 'set', 'show', 'hide'] as const);
      if (!command.ok) {
        ack?.({ error: command.error });
        return;
      }

      switch (command.action) {
        case 'start':
          adminContext.state.startInterval();
          break;
        case 'stop':
          adminContext.state.stopInterval();
          break;
        case 'reset':
          adminContext.state.resetInterval();
          break;
        case 'set':
          adminContext.state.configureInterval(command.seconds ?? 0);
          break;
        case 'show':
          adminContext.state.setIntervalVisible(true);
          break;
        case 'hide':
          adminContext.state.setIntervalVisible(false);
          break;
        default:
          ack?.({ error: 'unknown_action' });
          return;
      }

      ack?.({ ok: true });
    });

    on('locale:change', (payload, rawAck) => {
      const ack = toAck(rawAck);
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }

      const locale = isRecord(payload) ? SUPPORTED_LOCALES.find((code) => code === payload.locale) : undefined;
      if (!locale) {
        ack?.({ error: 'invalid_payload' });
        return;
      }

      adminContext.state.setLocale(locale);
      io.to(roomChannel(adminContext.roomId)).emit('locale:change', locale);
      ack?.({ ok: true });
    });

    on('legend:config', (payload, rawAck) => {
      const ack = toAck(rawAck);
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }

      const nextConfig = parseLegendConfig(isRecord(payload) ? payload.config : undefined);
      if (!nextConfig) {
        ack?.({ error: 'invalid_payload' });
        return;
      }

      adminContext.state.setLegendConfig(nextConfig);
      ack?.({ ok: true });
    });

    socket.on('disconnect', (reason: string) => {
      app.log.info({ event: 'disconnect', role: socket.data.role, reason });
      const { roomId, judgeRole, connectionId } = socket.data;
      if (roomId && judgeRole) {
        judgeDown(roomId, judgeRole);
      }
      if (connectionId) analyticsStore.logDisconnection(connectionId);
      // Só quem se registrou conta (simétrico ao trackConnection do register).
      if (socket.data.role) telemetry.trackDisconnection(roomId ?? '', socket.data.role);
    });
  });

  // --- Endpoints administrativos ---

  app.post<{ Body: { user?: string; password?: string } }>('/master/auth', async (request, reply) => {
    const user = request.body?.user?.trim() ?? '';
    const password = request.body?.password?.trim() ?? '';
    if (!config.MASTER_USER || !config.MASTER_PASSWORD) {
      reply.code(503);
      return { error: 'master_not_configured' };
    }
    if (!validateCredentials(user, password)) {
      reply.code(403);
      return { error: 'invalid_credentials' };
    }
    return { ok: true, token: generateMasterToken(user) };
  });

  function requireMaster(request: { headers: Record<string, string | string[] | undefined> }): boolean {
    const auth = request.headers.authorization;
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return false;
    return verifyMasterToken(auth.slice(7));
  }

  app.get<{ Querystring: { period?: string } }>('/master/stats', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return analyticsStore.getStats(roomManager.roomCount(), request.query.period);
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>('/master/sessions', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
    const offset = Math.max(0, Number(request.query.offset) || 0);
    return { sessions: analyticsStore.getRecentSessions(limit, offset) };
  });

  app.get<{ Querystring: { period?: string } }>('/master/geo', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return analyticsStore.getGeoDistribution(request.query.period);
  });

  app.get<{ Querystring: { period?: string } }>('/master/geo-markers', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { markers: analyticsStore.getGeoMarkers(request.query.period) };
  });

  app.get<{ Querystring: { period?: string } }>('/master/timeline', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { timeline: analyticsStore.getTimeline(request.query.period) };
  });

  app.get('/master/hourly', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { hourly: analyticsStore.getHourlyDistribution() };
  });

  app.get('/master/roles', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { roles: analyticsStore.getRoleBreakdown() };
  });

  app.get<{ Querystring: { period?: string } }>('/master/duration', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return analyticsStore.getDurationStats(request.query.period);
  });

  app.get('/master/activity', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { activity: analyticsStore.getRecentActivity() };
  });

  // --- Endpoints de instâncias ---

  app.post('/telemetry/events', async () => {
    // Receive event batches from instances (fire-and-forget on their side)
    return { ok: true };
  });

  app.post('/telemetry/heartbeat', async (request, reply) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = request.body as any;
    if (!body?.instanceId) { reply.code(400); return { error: 'missing_instance_id' }; }
    analyticsStore.upsertHeartbeat({
      instanceId: body.instanceId,
      platform: body.platform ?? '',
      arch: body.arch ?? '',
      nodeVersion: body.nodeVersion ?? '',
      uptimeSeconds: body.uptimeSeconds ?? 0,
      stats: body.stats ?? null
    });
    return { ok: true };
  });

  app.get('/master/instances', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { instances: analyticsStore.getInstances() };
  });

  app.post<{ Body: { url?: string } }>('/track/click', async (request, reply) => {
    const url = request.body?.url?.trim() ?? '';
    if (!url) { reply.code(400); return { error: 'missing_url' }; }
    analyticsStore.logAccess('link_click', url, extractIp(request));
    return { ok: true };
  });

  app.get('/master/active', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { rooms: roomManager.listRooms() };
  });

  app.get('/master/online', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    const visitors: Array<{
      role: string;
      roomId: string;
      page: string;
      host: string;
      country: string;
      city: string;
      connectedAt: string;
    }> = [];
    for (const [, socket] of io.sockets.sockets) {
      const data = socket.data as ClientData;
      if (!data.roomId) continue;
      const host = data.frontendHost || socketHost(socket as unknown as AppSocket);
      const ip = socketIp(socket as unknown as AppSocket);
      const geo = geoip.lookup(ip);
      visitors.push({
        role: data.role ?? '',
        roomId: data.roomId,
        page: mapRoleToPage(data.role ?? ''),
        host,
        country: geo?.country ?? '',
        city: geo?.city ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        connectedAt: (socket as any).handshake?.time ?? new Date().toISOString()
      });
    }
    return { visitors, count: visitors.length };
  });

  app.get<{ Querystring: { period?: string } }>('/master/pages', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { pages: analyticsStore.getPages(request.query.period) };
  });

  app.get<{ Querystring: { period?: string } }>('/master/hosts', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { hosts: analyticsStore.getHosts(request.query.period) };
  });

  // --- Key Relay Endpoints ---

  app.get('/key-relay/status', async () => {
    return {
      available: keyRelayAvailable,
      active: keyRelay.isActive,
      // Código da sala monitorada não sai em rota anônima (status é público
      // para o admin saber se o relay existe/está ativo).
      roomId: null,
      keys: keyRelay.keys
    };
  });

  // Key Relay aperta teclas NA MÁQUINA do servidor: só existe onde foi
  // habilitado (bundle) e exige o PIN da sala — antes qualquer um na rede
  // ligava, desligava ou reconfigurava as teclas sem credencial.
  function keyRelayAuth(
    request: { socket?: { remoteAddress?: string }; ip: string; headers: Record<string, string | string[] | undefined> },
    roomId: string | undefined,
    adminPin: unknown
  ): { ok: true } | { ok: false; code: number; error: string } {
    if (!keyRelayAvailable) return { ok: false, code: 403, error: 'key_relay_unavailable' };
    const failKey = authFailKey(extractIp(request));
    if (failureBlocked(failKey, AUTH_FAIL_LIMIT)) return { ok: false, code: 429, error: 'too_many_attempts' };
    if (!roomId || !roomManager.getRoomState(roomId)) return { ok: false, code: 404, error: 'room_not_found' };
    if (!roomManager.verifyAdminPin(roomId, typeof adminPin === 'string' ? adminPin : undefined)) {
      recordFailure(failKey, AUTH_FAIL_WINDOW_MS);
      return { ok: false, code: 403, error: 'invalid_pin' };
    }
    return { ok: true };
  }

  app.post<{ Body: { roomId?: string; adminPin?: string; validKey?: string; invalidKey?: string } }>('/key-relay/start', async (request, reply) => {
    const roomId = typeof request.body?.roomId === 'string' ? request.body.roomId.trim() : '';
    if (!roomId) { reply.code(400); return { error: 'missing_room_id' }; }
    const auth = keyRelayAuth(request, roomId, request.body?.adminPin);
    if (!auth.ok) { reply.code(auth.code); return { error: auth.error }; }
    try {
      keyRelay.start(roomId, request.body?.validKey, request.body?.invalidKey);
      return { ok: true, roomId, keys: keyRelay.keys };
    } catch (err) {
      reply.code(400);
      return { error: (err as Error).message === 'invalid_key' ? 'invalid_key' : 'key_relay_error' };
    }
  });

  app.post<{ Body: { roomId?: string; adminPin?: string } }>('/key-relay/stop', async (request, reply) => {
    // Desligar exige o PIN da sala monitorada; se ela já foi arquivada, vale
    // o PIN de qualquer sala ativa (senão o relay ficaria preso ligado).
    const monitored = keyRelay.monitoredRoom;
    const target = monitored && roomManager.getRoomState(monitored) ? monitored : request.body?.roomId;
    const auth = keyRelayAuth(request, typeof target === 'string' ? target : undefined, request.body?.adminPin);
    if (!auth.ok) { reply.code(auth.code); return { error: auth.error }; }
    keyRelay.stop();
    return { ok: true };
  });

  // Erros das telas (window.onerror, promessas rejeitadas, Error Boundary,
  // socket que não reconecta). Entram pelo mesmo canal e fila offline dos
  // erros do servidor. Sem dados pessoais: mensagem, stack resumido, tela,
  // código da sala e navegador.
  app.post('/client-errors', { bodyLimit: 8 * 1024 }, async (request, reply) => {
    if (!rateLimitOk(`clienterr:${extractIp(request)}`, 20, 60_000)) {
      reply.code(429);
      return { error: 'rate_limited' };
    }
    const body = request.body;
    if (!isRecord(body) || typeof body.message !== 'string' || !body.message) {
      reply.code(400);
      return { error: 'invalid_payload' };
    }
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    const screen = (str(body.screen, 32) ?? 'desconhecida').replace(/[^\w/-]/g, '');
    telemetry.trackError(`ui ${screen}`, body.message, {
      origin: 'ui',
      kind: str(body.kind, 64) ?? 'Error',
      stack: str(body.stack, 1000),
      screen,
      roomId: str(body.roomId, 16),
      userAgent: str(request.headers['user-agent'], 200)
    });
    reply.code(204);
    return null;
  });

  // Rotas do lançador (exe): desligar com calma (fila e banco gravados) e
  // registrar erros do próprio lançador (extração, porta, antivírus...).
  // Só existem com LAUNCHER_TOKEN e só respondem a loopback com o token.
  if (config.LAUNCHER_TOKEN) {
    const launcherAuth = (request: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string }; ip: string }) =>
      isLoopback(request.socket?.remoteAddress ?? request.ip) &&
      request.headers['x-launcher-token'] === config.LAUNCHER_TOKEN;

    app.post('/__launcher/shutdown', async (request, reply) => {
      if (!launcherAuth(request)) { reply.code(404); return { error: 'not_found' }; }
      // App fechado de propósito: encerra TODAS as salas (sessão fechada,
      // sockets derrubados, estado salvo apagado) — reabrir começa limpo.
      // A troca de versão não manda isso e preserva as salas.
      if (isRecord(request.body) && request.body.endSessions === true) {
        const ended = roomManager.sweepExpired(Number.POSITIVE_INFINITY);
        if (ended.length > 0) app.log.info(`${ended.length} sala(s) encerrada(s) ao fechar o app`);
      }
      // SQLite grava na hora (síncrono) e a fila vai para o disco aqui; o
      // close espera conexões abertas (navegadores, keep-alive) por no
      // máximo 2 s antes de sair.
      setTimeout(() => {
        telemetry.persistNow();
        void Promise.race([app.close(), new Promise((r) => setTimeout(r, 2000))]).finally(() => process.exit(0));
      }, 50);
      reply.code(202);
      return { ok: true };
    });

    app.get('/__launcher/busy', async (request, reply) => {
      if (!launcherAuth(request)) { reply.code(404); return { error: 'not_found' }; }
      return roomManager.busyState(config.BUSY_ACTIVITY_MINUTES * 60_000);
    });

    app.post('/__launcher/error', { bodyLimit: 16 * 1024 }, async (request, reply) => {
      if (!launcherAuth(request)) { reply.code(404); return { error: 'not_found' }; }
      const body = request.body;
      if (!isRecord(body) || typeof body.message !== 'string' || !body.message) {
        reply.code(400);
        return { error: 'invalid_payload' };
      }
      const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : undefined);
      telemetry.trackError(`launcher ${str(body.context, 40) ?? ''}`.trim(), body.message, {
        origin: 'launcher',
        kind: str(body.kind, 64) ?? 'launcher_error',
        stack: str(body.detail, 1000),
        userAgent: str(body.system, 200)
      });
      reply.code(204);
      return null;
    });
  }

  // Erros são registrados: saber ONDE o app quebra em campo orienta
  // correções. Mantém a resposta padrão do Fastify.
  app.setErrorHandler((error, request, reply) => {
    // Só o caminho: a query string carrega PIN e tokens de sala
    telemetry.trackError(`http ${request.method} ${request.url.split('?')[0]}`, String((error as Error)?.message ?? error), errorDetails(error));
    request.log.error(error);
    reply.send(error);
  });

  const g = globalThis as { __rlProcessErrorHooks?: boolean };
  if (!g.__rlProcessErrorHooks) {
    g.__rlProcessErrorHooks = true;
    process.on('uncaughtException', (err) => {
      telemetry.trackError('uncaughtException', String((err as Error)?.message ?? err), errorDetails(err));
      telemetry.persistNow();
      console.error('[fatal]', err);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      telemetry.trackError('unhandledRejection', String(reason), errorDetails(reason));
      telemetry.persistNow();
    });
  }

  if (config.FRONTEND_DIR) {
    registerAppUpdate(app, {
      appVersion: process.env.RL_LAUNCHER_VERSION || readAppVersion(),
      controlUrl: config.LAUNCHER_CONTROL_URL,
      token: config.LAUNCHER_TOKEN,
      manifestUrl: config.UPDATE_MANIFEST_URL,
      checkEnabled: config.UPDATE_CHECK,
      isLoopback
    });
    await attachFrontend(app, config.FRONTEND_DIR, config.PORT, (error, url) => {
      telemetry.trackError(`next ${url.split('?')[0]}`, String((error as Error)?.message ?? error), errorDetails(error));
      app.log.error({ err: error, url }, 'next_handler_error');
    });
    app.log.info(`frontend servido na mesma porta (${config.FRONTEND_DIR})`);
  }

  return app;
}

function ensureJudgeContext(socket: AppSocket, roomManager: RoomManager) {
  const { role, roomId, refereeToken, judgeRole } = socket.data;
  if (!roomId || !judgeRole || !isJudge(role)) {
    return { ok: false as const, error: 'not_authorised' };
  }
  if (!roomManager.isValidRefToken(roomId, judgeRole, refereeToken)) {
    return { ok: false as const, error: 'invalid_token' };
  }
  const state = roomManager.getRoomState(roomId);
  if (!state) {
    return { ok: false as const, error: 'room_not_found' };
  }
  return { ok: true as const, state, judge: judgeRole };
}

function ensureAdminContext(socket: AppSocket, roomManager: RoomManager) {
  const { role, roomId, adminPin } = socket.data;
  if (!roomId || !(isAdmin(role) || isDisplay(role))) {
    return { ok: false as const, error: 'not_authorised' };
  }
  if (!roomManager.verifyAdminPin(roomId, adminPin)) {
    return { ok: false as const, error: 'invalid_pin' };
  }
  const state = roomManager.getRoomState(roomId);
  if (!state) {
    return { ok: false as const, error: 'room_not_found' };
  }
  return { ok: true as const, state, roomId };
}

function ensureTimerControllerContext(socket: AppSocket, roomManager: RoomManager) {
  const { role, roomId, adminPin, refereeToken, judgeRole } = socket.data;
  if (!roomId) {
    return { ok: false as const, error: 'not_authorised' };
  }

  if (isAdmin(role) || isDisplay(role)) {
    if (!roomManager.verifyAdminPin(roomId, adminPin)) {
      return { ok: false as const, error: 'invalid_pin' };
    }
    const state = roomManager.getRoomState(roomId);
    if (!state) {
      return { ok: false as const, error: 'room_not_found' };
    }
    return { ok: true as const, state };
  }

  if (isJudge(role) && judgeRole === 'center') {
    if (!roomManager.isValidRefToken(roomId, judgeRole, refereeToken)) {
      return { ok: false as const, error: 'invalid_token' };
    }
    const state = roomManager.getRoomState(roomId);
    if (!state) {
      return { ok: false as const, error: 'room_not_found' };
    }
    return { ok: true as const, state };
  }

  return { ok: false as const, error: 'not_authorised' };
}

function parseLegendConfig(input: unknown): LegendConfig | null {
  const payload = (input ?? {}) as Partial<LegendConfig>;
  if (!isLegendBg(payload.bgColor)) return null;
  if (!isHexColor(payload.timerColor)) return null;
  if (payload.digitMode !== 'hhmmss' && payload.digitMode !== 'mmss') return null;
  if (typeof payload.showPlaceholders !== 'boolean') return null;
  if (payload.showDashedFrame !== undefined && typeof payload.showDashedFrame !== 'boolean') return null;
  if (typeof payload.keepAwake !== 'boolean') return null;

  return {
    bgColor: payload.bgColor,
    timerColor: payload.timerColor,
    digitMode: payload.digitMode,
    showPlaceholders: payload.showPlaceholders,
    showDashedFrame: payload.showDashedFrame ?? true,
    keepAwake: payload.keepAwake
  };
}

function isLegendBg(value: unknown): value is string {
  return value === 'transparent' || isHexColor(value);
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}


type AckFn = (response: AckResponse) => void;

/** Tipo (código ou classe) e stack resumido de um erro, para agrupar no master. */
function errorDetails(error: unknown): { kind: string; stack?: string } {
  const e = error as { code?: unknown; name?: unknown; stack?: unknown } | null;
  const kind = typeof e?.code === 'string' ? e.code : typeof e?.name === 'string' ? e.name : typeof error;
  const stack = typeof e?.stack === 'string' ? e.stack.split('\n').slice(0, 6).join('\n') : undefined;
  return { kind, stack };
}

/**
 * O "ack" vem do cliente: qualquer um pode mandar um não-função no lugar do
 * callback. `ack?.()` só protege contra null/undefined — com uma string a
 * chamada lançava TypeError e derrubava o processo inteiro.
 */
function toAck(ack: unknown): AckFn | undefined {
  return typeof ack === 'function' ? (ack as AckFn) : undefined;
}

const VOTE_VALUES: ReadonlyArray<VoteValue> = ['white', 'red', null];
const CARD_VALUES: ReadonlyArray<CardValue> = [1, 2, 3, null];
/** Teto de 24h para timer/intervalo: acima disso é payload inválido. */
const KNOWN_ROLES: ReadonlyArray<Role> = [ADMIN_ROLE, DISPLAY_ROLE, ...JUDGE_ROLES];

/** Papel desconhecido não entra: antes qualquer string caía no canal da sala. */
function parseRegistration(input: unknown): RegistrationPayload | null {
  if (!isRecord(input)) return null;
  const { role, roomId, pin, token, host } = input;
  if (typeof roomId !== 'string' || !roomId) return null;
  if (typeof role !== 'string' || !KNOWN_ROLES.includes(role as Role)) return null;
  return {
    role: role as Role,
    roomId,
    pin: typeof pin === 'string' ? pin : undefined,
    token: typeof token === 'string' ? token : undefined,
    host: typeof host === 'string' ? host.slice(0, 255) : undefined
  };
}

const MAX_TIMER_SECONDS = 24 * 3600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseVote(payload: unknown): { ok: true; vote: VoteValue } | { ok: false } {
  if (!isRecord(payload) || !VOTE_VALUES.includes(payload.vote as VoteValue)) return { ok: false };
  return { ok: true, vote: payload.vote as VoteValue };
}

function parseCard(payload: unknown): { ok: true; card: CardValue } | { ok: false } {
  if (!isRecord(payload) || !CARD_VALUES.includes(payload.card as CardValue)) return { ok: false };
  return { ok: true, card: payload.card as CardValue };
}

/**
 * Comando de timer/intervalo: `seconds` é opcional, mas se vier precisa ser
 * número finito entre 0 e 24h — string ou NaN deixavam o timer em NaN em
 * todas as telas da sala.
 */
function parseTimedCommand<A extends string>(
  payload: unknown,
  actions: ReadonlyArray<A>
): { ok: true; action: A; seconds?: number } | { ok: false; error: string } {
  if (!isRecord(payload) || typeof payload.action !== 'string') return { ok: false, error: 'invalid_payload' };
  if (!actions.includes(payload.action as A)) return { ok: false, error: 'unknown_action' };
  const { seconds } = payload;
  if (seconds !== undefined && seconds !== null) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_TIMER_SECONDS) {
      return { ok: false, error: 'invalid_payload' };
    }
    return { ok: true, action: payload.action as A, seconds };
  }
  return { ok: true, action: payload.action as A };
}
