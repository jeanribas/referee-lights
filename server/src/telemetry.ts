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

export interface InstanceSnapshot {
  activeRooms: number;
  totalSessions: number;
  totalConnections: number;
  uniqueIps: number;
}

/**
 * Privacy-first telemetry.
 *
 * - Can be disabled via TELEMETRY_ENABLED=false
 * - Never sends raw IPs, hostnames, or user-agents
 * - IPs are hashed (one-way) before leaving the process
 * - Only aggregated, non-identifying stats are sent in heartbeats
 * - Instance ID is a random UUID — not tied to any person
 *
 * Store-and-forward: eventos que falham no envio (bundle offline em LAN)
 * voltam para a fila, são persistidos em data/telemetry-queue.json e
 * reenviados quando a conexão voltar. Fila limitada a MAX_QUEUE eventos
 * (descarta os mais antigos) para nunca crescer sem limite.
 */
const MAX_QUEUE = 500;
const QUEUE_FILE = path.resolve('data', 'telemetry-queue.json');

export class Telemetry {
  private buffer: TelemetryEvent[] = [];
  private readonly endpoint: string;
  private readonly heartbeatEndpoint: string;
  readonly instanceId: string;
  private readonly enabled: boolean;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private startedAt: number;
  private statsProvider: (() => InstanceSnapshot) | null = null;

  constructor(baseUrl: string, enabled = true) {
    this.endpoint = `${baseUrl}/telemetry/events`;
    this.heartbeatEndpoint = `${baseUrl}/telemetry/heartbeat`;
    this.instanceId = getInstanceId();
    this.startedAt = Date.now();
    this.enabled = enabled;

    if (!this.enabled) return;

    this.loadQueue();

    this.flushTimer = setInterval(() => this.flush(), 30_000);
    if (this.flushTimer.unref) this.flushTimer.unref();

    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), 5 * 60_000);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();

    const initial = setTimeout(() => this.sendHeartbeat(), 10_000);
    if (initial.unref) initial.unref();
  }

  setStatsProvider(fn: () => InstanceSnapshot): void {
    this.statsProvider = fn;
  }

  trackSessionCreated(roomId: string): void {
    this.push('session_created', { roomId });
  }

  trackConnection(roomId: string, role: string, ip: string): void {
    // Hash IP before buffering — raw IP never leaves process
    this.push('connection', { roomId, role, ipHash: this.hashIp(ip) });
  }

  trackDisconnection(roomId: string, role: string): void {
    this.push('disconnection', { roomId, role });
  }

  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip + 'referee-lights-salt').digest('hex').slice(0, 16);
  }

  private push(event: string, data: Record<string, unknown>): void {
    if (!this.enabled) return;
    this.buffer.push({
      event,
      data,
      timestamp: new Date().toISOString(),
      instanceId: this.instanceId
    });
    if (this.buffer.length > MAX_QUEUE) {
      this.buffer.splice(0, this.buffer.length - MAX_QUEUE);
    }
    if (this.buffer.length >= 20) {
      void this.flush();
    }
  }

  private flushing = false;

  private async flush(): Promise<void> {
    if (this.buffer.length === 0 || this.flushing) return;
    this.flushing = true;
    // Envia em lotes de até 100 (limite aceito pelo servidor)
    const batch = this.buffer.slice(0, 100);
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
        signal: AbortSignal.timeout(10_000)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.buffer.splice(0, batch.length);
      this.saveQueue();
      if (this.buffer.length > 0) {
        this.flushing = false;
        return this.flush();
      }
    } catch {
      // Offline ou servidor fora: eventos ficam na fila e vão para o disco;
      // o timer de 30s tenta de novo quando a conexão voltar.
      this.saveQueue();
    } finally {
      this.flushing = false;
    }
  }

  private loadQueue(): void {
    try {
      if (!fs.existsSync(QUEUE_FILE)) return;
      const stored = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
      if (Array.isArray(stored)) {
        this.buffer = stored.slice(-MAX_QUEUE);
      }
    } catch {
      // fila corrompida: descarta
    }
  }

  private saveQueue(): void {
    try {
      fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
      if (this.buffer.length === 0) {
        if (fs.existsSync(QUEUE_FILE)) fs.unlinkSync(QUEUE_FILE);
        return;
      }
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(this.buffer));
    } catch {
      // sem disco disponível: segue só com a fila em memória
    }
  }

  private async sendHeartbeat(): Promise<void> {
    const stats = this.statsProvider?.() ?? null;
    // Only send non-identifying, aggregated data
    const payload = {
      instanceId: this.instanceId,
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      stats
    };
    try {
      await fetch(this.heartbeatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      // fire-and-forget
    }
  }
}
