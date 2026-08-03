import fastifyCors from '@fastify/cors';
import Fastify from 'fastify';
import { readFileSync } from 'node:fs';
import { Server as SocketIOServer, type Socket } from 'socket.io';

import { lookupGeo } from './geo.js';
import { AnalyticsStore } from './analytics.js';
import { config } from './config.js';
import { KeyRelay } from './key-relay.js';
import { generateMasterToken, validateCredentials, verifyMasterToken } from './master-auth.js';
import { rateLimitOk } from './rate-limit.js';
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

type Role = 'admin' | 'display' | Judge | 'viewer';

const ADMIN_ROLE: Role = 'admin';
const DISPLAY_ROLE: Role = 'display';
const VIEWER_ROLE: Role = 'viewer';
const JUDGE_ROLES: Judge[] = ['left', 'center', 'right'];

interface ClientData {
  role: Role;
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

const SUPPORTED_LOCALES: Locale[] = ['pt-BR', 'en-US', 'es-ES'];

function roomChannel(roomId: string) {
  return `${ROOM_CHANNEL_PREFIX}${roomId}`;
}

function isAdmin(role: Role): role is typeof ADMIN_ROLE {
  return role === ADMIN_ROLE;
}

function isDisplay(role: Role): role is typeof DISPLAY_ROLE {
  return role === DISPLAY_ROLE;
}

function isJudge(role: Role): role is Judge {
  return (JUDGE_ROLES as string[]).includes(role);
}

/** Versão do pacote (server/package.json) — vai no heartbeat da telemetria. */
function readAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    return typeof pkg.version === 'string' ? pkg.version : '';
  } catch {
    return '';
  }
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
  });
  const analyticsStore = new AnalyticsStore(config.ANALYTICS_DB_PATH);
  const telemetry = new Telemetry(config.TELEMETRY_URL, config.TELEMETRY_ENABLED, readAppVersion());
  telemetry.setStatsProvider(() => analyticsStore.getStats(roomManager.roomCount()));
  const sessionMap = new Map<string, number>();

  function extractIp(request: { ip: string; headers: Record<string, string | string[] | undefined> }): string {
    const forwarded = request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return request.ip ?? '';
  }

  function socketIp(socket: AppSocket): string {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
    return socket.handshake.address ?? '';
  }

  function socketHost(socket: AppSocket): string {
    const host = socket.handshake.headers.host;
    if (typeof host === 'string') return host.split(':')[0];
    return '';
  }

  function mapRoleToPage(role: string, _judgeRole?: string): string {
    if (role === 'admin') return '/admin';
    if (role === 'display') return '/display';
    if (role === 'left' || role === 'center' || role === 'right') return `/ref/${role}`;
    return '/';
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/rooms', async (request, reply) => {
    const data = roomManager.createRoom();
    const sessionId = analyticsStore.logSessionCreated(data.roomId, data.adminPin);
    if (sessionId !== null) sessionMap.set(data.roomId, sessionId);
    telemetry.trackSessionCreated(data.roomId);
    analyticsStore.logAccess('room_created', data.roomId, extractIp(request));
    reply.code(201);
    return data;
  });

  app.post<{
    Params: { roomId: string };
    Body: { adminPin?: string };
  }>('/rooms/:roomId/access', async (request, reply) => {
    const { roomId } = request.params;
    const { adminPin } = request.body ?? {};

    const state = roomManager.getRoomState(roomId);
    if (!state) {
      reply.code(404);
      return { error: 'room_not_found' };
    }

    if (!roomManager.verifyAdminPin(roomId, adminPin)) {
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

    const state = roomManager.getRoomState(roomId);
    if (!state) {
      reply.code(404);
      return { error: 'room_not_found' };
    }

    if (!roomManager.verifyAdminPin(roomId, adminPin)) {
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
    socket.data = { role: VIEWER_ROLE };

    socket.on('client:register', (payload, ack) => {
      if (!payload || !payload.roomId || !payload.role) {
        ack?.({ error: 'invalid_payload' });
        return;
      }

      const state = roomManager.getRoomState(payload.roomId);
      if (!state) {
        ack?.({ error: 'room_not_found' });
        return;
      }

      if (isAdmin(payload.role) || isDisplay(payload.role)) {
        if (!roomManager.verifyAdminPin(payload.roomId, payload.pin)) {
          ack?.({ error: 'invalid_pin' });
          return;
        }
      }

      if (isJudge(payload.role)) {
        if (!roomManager.isValidRefToken(payload.roomId, payload.role, payload.token)) {
          ack?.({ error: 'invalid_token' });
          return;
        }
      }

      if (isJudge(socket.data.role) && socket.data.roomId) {
        const previousState = roomManager.getRoomState(socket.data.roomId);
        if (previousState && socket.data.judgeRole) {
          previousState.setConnected(socket.data.judgeRole, false);
        }
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
        state.setConnected(socket.data.judgeRole, true);
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

    socket.on('ref:vote', (payload, ack) => {
      const judgeContext = ensureJudgeContext(socket, roomManager);
      if (!judgeContext.ok) {
        ack?.({ error: judgeContext.error });
        return;
      }
      judgeContext.state.setVote(judgeContext.judge, payload.vote);
      ack?.({ ok: true });
    });

    socket.on('ref:card', (payload, ack) => {
      const judgeContext = ensureJudgeContext(socket, roomManager);
      if (!judgeContext.ok) {
        ack?.({ error: judgeContext.error });
        return;
      }
      judgeContext.state.setCard(judgeContext.judge, payload.card);
      ack?.({ ok: true });
    });

    socket.on('admin:ready', (ack) => {
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }
      adminContext.state.setPhaseReady();
      ack?.({ ok: true });
    });

    socket.on('admin:release', (ack) => {
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }
      adminContext.state.releaseDecision();
      ack?.({ ok: true });
    });

    socket.on('admin:clear', (ack) => {
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }
      adminContext.state.clearDecision();
      ack?.({ ok: true });
    });

    socket.on('timer:command', (payload, ack) => {
      const timerContext = ensureTimerControllerContext(socket, roomManager);
      if (!timerContext.ok) {
        ack?.({ error: timerContext.error });
        return;
      }

      switch (payload.action) {
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
          timerContext.state.startTimerWithSeconds(payload.seconds ?? 60);
          break;
        default:
          ack?.({ error: 'unknown_action' });
          return;
      }

      ack?.({ ok: true });
    });

    socket.on('interval:command', (payload, ack) => {
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }

      switch (payload.action) {
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
          adminContext.state.configureInterval(payload.seconds ?? 0);
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

    socket.on('locale:change', (payload, ack) => {
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }

      if (!payload || !SUPPORTED_LOCALES.includes(payload.locale)) {
        ack?.({ error: 'invalid_payload' });
        return;
      }

      adminContext.state.setLocale(payload.locale);
      io.to(roomChannel(adminContext.roomId)).emit('locale:change', payload.locale);
      ack?.({ ok: true });
    });

    socket.on('legend:config', (payload, ack) => {
      const adminContext = ensureAdminContext(socket, roomManager);
      if (!adminContext.ok) {
        ack?.({ error: adminContext.error });
        return;
      }

      const nextConfig = parseLegendConfig(payload?.config);
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
        const state = roomManager.getRoomState(roomId);
        state?.setConnected(judgeRole, false);
      }
      if (connectionId) analyticsStore.logDisconnection(connectionId);
      telemetry.trackDisconnection(roomId ?? '', socket.data.role ?? '');
    });
  });

  // --- Master Admin Endpoints ---

  app.post<{ Body: { user?: string; password?: string } }>('/master/auth', async (request, reply) => {
    // 10 tentativas por IP a cada 15min — barra brute force de credenciais
    if (!rateLimitOk(`auth:${extractIp(request)}`, 10, 15 * 60_000)) {
      reply.code(429);
      return { error: 'too_many_attempts' };
    }
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
    return {
      ...analyticsStore.getStats(roomManager.roomCount(), request.query.period),
      bundle: analyticsStore.getBundleSummary()
    };
  });

  app.get<{ Querystring: { limit?: string; offset?: string } }>('/master/sessions', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
    const offset = Math.max(0, Number(request.query.offset) || 0);
    return {
      sessions: analyticsStore.getRecentSessions(limit, offset),
      bundleSessions: analyticsStore.getBundleSessions(limit)
    };
  });

  app.get<{ Querystring: { period?: string } }>('/master/geo', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return analyticsStore.getGeoDistribution(request.query.period);
  });

  app.get<{ Querystring: { period?: string } }>('/master/geo-markers', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return {
      markers: analyticsStore.getGeoMarkers(request.query.period),
      bundleMarkers: analyticsStore.getInstanceMarkers()
    };
  });

  app.get<{ Querystring: { period?: string } }>('/master/timeline', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return {
      timeline: analyticsStore.getTimeline(request.query.period),
      bundleTimeline: analyticsStore.getBundleTimeline(request.query.period)
    };
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

  // --- Telemetry Endpoints (receive from all instances) ---

  app.post('/telemetry/events', async (request, reply) => {
    // Premissa do produto: os filhos (bundles) reportam o máximo de dados de
    // uso possível, e o master consome. Eventos por sala (session_created,
    // connection, disconnection — com roomId, papel e hash de IP, nunca IP
    // cru nem nomes) são gravados em instance_events e lidos em
    // /master/instances/:id/activity.
    if (!rateLimitOk(`tel:${extractIp(request)}`, 60, 60_000)) {
      reply.code(429);
      return { error: 'rate_limited' };
    }
    const body = request.body as { events?: unknown } | null;
    const events = Array.isArray(body?.events) ? body.events.slice(0, 100) : [];
    const valid = events.filter(
      (e): e is { instanceId: string; event: string; data?: Record<string, unknown>; timestamp?: string } =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as Record<string, unknown>).instanceId === 'string' &&
        typeof (e as Record<string, unknown>).event === 'string'
    );
    if (valid.length === 0) return { ok: true, stored: 0 };
    const stored = analyticsStore.recordInstanceEvents(
      valid.map((e) => ({
        instanceId: e.instanceId.slice(0, 64),
        event: e.event.slice(0, 64),
        roomId: typeof e.data?.roomId === 'string' ? e.data.roomId.slice(0, 16) : undefined,
        data: e.data,
        timestamp: typeof e.timestamp === 'string' ? e.timestamp.slice(0, 32) : undefined
      }))
    );
    return { ok: true, stored };
  });

  app.post('/telemetry/heartbeat', async (request, reply) => {
    if (!rateLimitOk(`hb:${extractIp(request)}`, 30, 60_000)) {
      reply.code(429);
      return { error: 'rate_limited' };
    }
    const body = request.body as { samples?: unknown } | Record<string, unknown> | null;
    // Bundles < 1.3.1 mandam UMA amostra no corpo; a partir da 1.3.1 vem
    // `{samples: [...]}`, porque a fila offline agora carrega heartbeats.
    const raw = Array.isArray((body as { samples?: unknown })?.samples)
      ? ((body as { samples: unknown[] }).samples).slice(0, 100)
      : [body];

    let stored = 0;
    for (const item of raw) {
      const s = item as Record<string, any> | null;
      if (!s?.instanceId || typeof s.instanceId !== 'string') continue;
      analyticsStore.upsertHeartbeat({
        ip: extractIp(request),
        instanceId: s.instanceId.slice(0, 64),
        appVersion: String(s.appVersion ?? '').slice(0, 32),
        platform: String(s.platform ?? '').slice(0, 32),
        arch: String(s.arch ?? '').slice(0, 16),
        nodeVersion: String(s.nodeVersion ?? '').slice(0, 32),
        uptimeSeconds: Number(s.uptimeSeconds) || 0,
        stats: s.stats ?? null,
        sampledAt: typeof s.timestamp === 'string' ? s.timestamp.slice(0, 32) : undefined
      });
      stored++;
    }
    if (stored === 0) { reply.code(400); return { error: 'missing_instance_id' }; }
    return { ok: true, stored };
  });

  app.get('/master/instances', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { instances: analyticsStore.getInstances() };
  });

  app.get<{ Params: { id: string } }>('/master/instances/:id/activity', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    const id = String(request.params.id ?? '').slice(0, 64);
    if (!id) { reply.code(400); return { error: 'missing_instance_id' }; }
    return analyticsStore.getInstanceActivity(id);
  });

  app.post<{ Body: { url?: string } }>('/track/click', async (request, reply) => {
    if (!rateLimitOk(`click:${extractIp(request)}`, 30, 60_000)) {
      reply.code(429);
      return { error: 'rate_limited' };
    }
    const url = request.body?.url?.trim().slice(0, 300) ?? '';
    if (!url) { reply.code(400); return { error: 'missing_url' }; }
    analyticsStore.logAccess('link_click', url, extractIp(request));
    return { ok: true };
  });

  app.post<{ Body: { path?: string; device?: string; locale?: string; referrer?: string } }>(
    '/track/page',
    async (request, reply) => {
      // Page views do site: só o pathname (nunca query string — PINs e tokens
      // de sala viajam em query e não podem chegar aos logs). IP é hasheado
      // dentro do logAccess, como nos demais eventos.
      if (!rateLimitOk(`page:${extractIp(request)}`, 60, 60_000)) {
        reply.code(429);
        return { error: 'rate_limited' };
      }
      const raw = request.body?.path?.trim() ?? '';
      const path = raw.split('?')[0].split('#')[0].slice(0, 200);
      if (!path.startsWith('/')) { reply.code(400); return { error: 'invalid_path' }; }
      const device = ['mobile', 'tablet', 'desktop'].includes(request.body?.device ?? '')
        ? (request.body!.device as string)
        : '';
      const locale = (request.body?.locale ?? '').slice(0, 10).replace(/[^a-zA-Z-]/g, '');
      // Referrer: só o hostname, nunca a URL completa
      const referrer = (request.body?.referrer ?? '').slice(0, 100).replace(/[^a-zA-Z0-9.-]/g, '');
      analyticsStore.logAccess('page_view', path, extractIp(request), { device, locale, referrer });
      return { ok: true };
    }
  );

  app.get<{ Querystring: { period?: string } }>('/master/devices', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { devices: analyticsStore.getDevices(request.query.period) };
  });

  app.get<{ Querystring: { period?: string } }>('/master/locales', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { locales: analyticsStore.getLocales(request.query.period) };
  });

  app.get<{ Querystring: { period?: string } }>('/master/referrers', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { referrers: analyticsStore.getReferrers(request.query.period) };
  });

  app.get('/master/clicks', async (request, reply) => {
    if (!requireMaster(request)) { reply.code(401); return { error: 'unauthorized' }; }
    return { clicks: analyticsStore.getLinkClicks() };
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
      const geo = lookupGeo(ip);
      visitors.push({
        role: data.role,
        roomId: data.roomId,
        page: mapRoleToPage(data.role, data.judgeRole),
        host,
        country: geo?.country ?? '',
        city: geo?.city ?? '',
        connectedAt: (socket as any).handshake?.time ?? new Date().toISOString()
      });
    }
    // Além dos sockets de sala, inclui quem navega no site (page_view nos
    // últimos 5min, um por IP hasheado) — visão "ao vivo" completa.
    const siteVisitors = analyticsStore.getRecentSiteVisitors(5);
    // Bundles "no ar" (heartbeat < 10 min) entram no ao-vivo com rótulo próprio
    const bundleInstances = analyticsStore.getOnlineBundleInstances();
    return {
      visitors,
      count: visitors.length,
      siteVisitors,
      siteCount: siteVisitors.length,
      bundleInstances,
      bundleCount: bundleInstances.length
    };
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
      roomId: keyRelay.monitoredRoom,
      keys: keyRelay.keys
    };
  });

  app.post<{ Body: { roomId?: string; validKey?: string; invalidKey?: string } }>('/key-relay/start', async (request, reply) => {
    const roomId = request.body?.roomId?.trim();
    if (!roomId) { reply.code(400); return { error: 'missing_room_id' }; }
    try {
      keyRelay.start(roomId, request.body?.validKey, request.body?.invalidKey);
      return { ok: true, roomId, keys: keyRelay.keys };
    } catch (err: any) {
      reply.code(400);
      return { error: err?.message ?? 'invalid_config' };
    }
  });

  app.post('/key-relay/stop', async () => {
    keyRelay.stop();
    return { ok: true };
  });

  // Erros são dado de primeira classe na telemetria: saber ONDE o app quebra
  // orienta correções. Rastreia e mantém a resposta padrão do Fastify.
  app.setErrorHandler((error, request, reply) => {
    telemetry.trackError(`http ${request.method} ${request.url}`, String((error as Error)?.message ?? error));
    request.log.error(error);
    reply.send(error);
  });

  const g = globalThis as { __rlProcessErrorHooks?: boolean };
  if (!g.__rlProcessErrorHooks) {
    g.__rlProcessErrorHooks = true;
    process.on('uncaughtException', (err) => {
      telemetry.trackError('uncaughtException', String((err as Error)?.message ?? err));
      telemetry.persistNow();
      console.error('[fatal]', err);
      process.exit(1);
    });
    process.on('unhandledRejection', (reason) => {
      telemetry.trackError('unhandledRejection', String(reason));
      telemetry.persistNow();
    });
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

