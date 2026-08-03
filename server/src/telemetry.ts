import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getInstanceId } from './instance-id.js';

interface TelemetryEvent {
  event: string;
  data: Record<string, unknown>;
  timestamp: string;
  instanceId: string;
}

interface HeartbeatSample {
  instanceId: string;
  appVersion: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  uptimeSeconds: number;
  timestamp: string;
  stats: InstanceSnapshot | null;
}

export interface InstanceSnapshot {
  activeRooms: number;
  totalSessions: number;
  totalConnections: number;
  uniqueIps: number;
  /** Salas abertas AGORA (código, árbitros conectados, fase) — dá ao master a
   * mesma granularidade do online. Limitado a 20 para o payload não crescer. */
  rooms?: Array<{ id: string; createdAt: number; connectedJudges: number; phase: string }>;
}

/**
 * Telemetria dos filhos para o master — premissa do produto: reportar o
 * máximo de dados de uso possível. Sai daqui:
 *  - eventos por sala (sessão criada, conexão, desconexão) a cada 30s;
 *  - heartbeat com contadores agregados a cada 5 min.
 * Nunca sai: IP cru (só hash irreversível), nomes, decisões de arbitragem.
 * Desligável com TELEMETRY_ENABLED=false (declarado no LEIA-ME do bundle).
 *
 * Store-and-forward: sem internet (competição em LAN), eventos e amostras
 * ficam em fila persistida em data/telemetry-queue.json e são reenviados
 * quando a conexão voltar. Filas limitadas (descartam o mais antigo) para
 * nunca crescer sem limite.
 *
 * Observabilidade: o estado da conexão com a API central é logado no
 * console do server (a janela "Referee-Server" no bundle) — uma linha a
 * cada mudança de estado, sem spam. Falha de telemetria NUNCA é silenciosa.
 */
const MAX_EVENTS = 1000;
const MAX_SAMPLES = 500;
const QUEUE_FILE = path.resolve('data', 'telemetry-queue.json');

export class Telemetry {
  private events: TelemetryEvent[] = [];
  private samples: HeartbeatSample[] = [];
  private readonly endpoint: string;
  private readonly heartbeatEndpoint: string;
  private readonly host: string;
  readonly instanceId: string;
  private readonly enabled: boolean;
  private readonly appVersion: string;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt: number;
  private statsProvider: (() => InstanceSnapshot) | null = null;
  private flushing = false;
  private lastHeartbeatAt = 0;
  /** null = ainda não tentou; true/false = último estado conhecido */
  private online: boolean | null = null;

  constructor(baseUrl: string, enabled = true, appVersion = '') {
    this.endpoint = `${baseUrl}/telemetry/events`;
    this.heartbeatEndpoint = `${baseUrl}/telemetry/heartbeat`;
    this.host = (() => { try { return new URL(baseUrl).host; } catch { return baseUrl; } })();
    this.instanceId = getInstanceId();
    this.appVersion = appVersion;
    this.startedAt = Date.now();
    this.enabled = enabled;

    if (!this.enabled) {
      console.log('[telemetria] desativada (TELEMETRY_ENABLED=false) — nada sai desta máquina');
      return;
    }

    this.loadQueue();
    const queued = this.events.length + this.samples.length;
    console.log(
      `[telemetria] ativa — instância ${this.instanceId.slice(0, 8)}…, destino ${this.host}` +
        (queued > 0 ? ` (${queued} itens pendentes de execução anterior)` : '')
    );

    this.flushTimer = setInterval(() => void this.flush(), 30_000);
    if (this.flushTimer.unref) this.flushTimer.unref();

    // Cadência adaptativa: com sala ativa o heartbeat sai a cada 1 min (o
    // master mostra as salas dos bundles quase ao vivo); parado, a cada 5 min.
    this.heartbeatTimer = setInterval(() => {
      const active = (this.statsProvider?.()?.activeRooms ?? 0) > 0;
      const elapsed = Date.now() - this.lastHeartbeatAt;
      if (active || elapsed >= 5 * 60_000 - 500) this.queueHeartbeat();
    }, 60_000);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();

    const initial = setTimeout(() => this.queueHeartbeat(), 10_000);
    if (initial.unref) initial.unref();
  }

  setStatsProvider(fn: () => InstanceSnapshot): void {
    this.statsProvider = fn;
  }

  /** Grava a fila em disco de forma síncrona — para handlers de crash. */
  persistNow(): void {
    this.saveQueue();
  }

  trackSessionCreated(roomId: string): void {
    this.push('session_created', { roomId });
  }

  trackConnection(roomId: string, role: string, ip: string): void {
    // Hash do IP antes de sair do processo — IP cru nunca sai da máquina
    this.push('connection', { roomId, role, ipHash: this.hashIp(ip) });
  }

  trackDisconnection(roomId: string, role: string): void {
    this.push('disconnection', { roomId, role });
  }

  /** Decisão revelada: contagem agregada de cartões (sem identificar atleta). */
  trackDecision(roomId: string, counts: { white: number; red: number }): void {
    this.push('decision', { roomId, white: counts.white, red: counts.red });
  }

  /** Sala arquivada por inatividade — fecha o ciclo de vida no master. */
  trackRoomArchived(roomId: string): void {
    this.push('room_archived', { roomId });
  }

  /** Erro de runtime — essencial para saber onde o app quebra em campo. */
  trackError(context: string, message: string): void {
    this.push('error', {
      context: context.slice(0, 64),
      message: message.slice(0, 300),
      appVersion: this.appVersion
    });
    void this.flush();
  }

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip + 'referee-lights-salt').digest('hex').slice(0, 16);
  }

  private push(event: string, data: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.events.push({
      event,
      data,
      timestamp: new Date().toISOString(),
      instanceId: this.instanceId
    });
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
    }
    if (this.events.length >= 20) void this.flush();
  }

  private queueHeartbeat(): void {
    if (!this.enabled) return;
    this.lastHeartbeatAt = Date.now();
    const stats = this.statsProvider?.() ?? null;
    if (stats?.rooms) stats.rooms = stats.rooms.slice(0, 20);
    this.samples.push({
      instanceId: this.instanceId,
      appVersion: this.appVersion,
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      stats
    });
    if (this.samples.length > MAX_SAMPLES) {
      this.samples.splice(0, this.samples.length - MAX_SAMPLES);
    }
    void this.flush();
  }

  private async flush(): Promise<void> {
    if (this.flushing || (this.events.length === 0 && this.samples.length === 0)) return;
    this.flushing = true;
    try {
      while (this.samples.length > 0) {
        const batch = this.samples.slice(0, 100);
        const ok = await this.post(this.heartbeatEndpoint, { samples: batch });
        if (!ok) return;
        this.samples.splice(0, batch.length);
      }
      while (this.events.length > 0) {
        const batch = this.events.slice(0, 100);
        const ok = await this.post(this.endpoint, { events: batch });
        if (!ok) return;
        this.events.splice(0, batch.length);
      }
    } finally {
      this.saveQueue();
      this.flushing = false;
    }
  }

  /** Envia um lote; loga mudanças de estado online/offline. */
  private async post(url: string, body: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.setOnline(true);
      return true;
    } catch (err) {
      const detail =
        (err as { cause?: { code?: string } })?.cause?.code ??
        (err as Error)?.message ??
        'erro desconhecido';
      this.setOnline(false, String(detail));
      return false;
    }
  }

  private setOnline(ok: boolean, detail?: string): void {
    if (this.online === ok) return;
    this.online = ok;
    if (ok) {
      console.log(`[telemetria] conectado a ${this.host} — dados de uso sendo reportados`);
    } else {
      const queued = this.events.length + this.samples.length;
      console.log(
        `[telemetria] SEM CONEXÃO com ${this.host} (${detail}) — ` +
          `${queued} item(ns) guardados em fila local, reenvio automático quando a internet voltar`
      );
    }
  }

  private loadQueue(): void {
    try {
      if (!fs.existsSync(QUEUE_FILE)) return;
      const stored = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
      if (Array.isArray(stored?.events)) this.events = stored.events.slice(-MAX_EVENTS);
      if (Array.isArray(stored?.samples)) this.samples = stored.samples.slice(-MAX_SAMPLES);
    } catch {
      // fila corrompida: descarta
    }
  }

  private saveQueue(): void {
    try {
      if (this.events.length === 0 && this.samples.length === 0) {
        if (fs.existsSync(QUEUE_FILE)) fs.unlinkSync(QUEUE_FILE);
        return;
      }
      fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
      fs.writeFileSync(QUEUE_FILE, JSON.stringify({ events: this.events, samples: this.samples }));
    } catch {
      // sem disco disponível: segue só com a fila em memória
    }
  }
}
