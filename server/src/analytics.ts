import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import { lookupGeo } from './geo.js';

interface GeoInfo {
  country: string;
  region: string;
  city: string;
  lat: number;
  lng: number;
}

export interface SessionRow {
  id: number;
  room_id: string;
  created_at: string;
  closed_at: string | null;
  connection_count: number;
  top_country: string | null;
}

export interface StatsResult {
  totalSessions: number;
  totalConnections: number;
  uniqueIps: number;
  activeRooms: number;
}

export interface GeoDistribution {
  countries: Array<{ country: string; count: number }>;
  cities: Array<{ city: string; country: string; count: number }>;
}

export class AnalyticsStore {
  private db: Database.Database | null = null;

  constructor(dbPath: string) {
    try {
      const dir = path.dirname(dbPath);
      fs.mkdirSync(dir, { recursive: true });
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.createTables();
    } catch (err) {
      console.error('[analytics] Failed to open database:', err);
      this.db = null;
    }
  }

  private createTables() {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        admin_pin_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS connections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER REFERENCES sessions(id),
        role TEXT NOT NULL,
        judge_position TEXT,
        ip TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        connected_at TEXT NOT NULL DEFAULT (datetime('now')),
        disconnected_at TEXT
      );

      CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        room_id TEXT,
        ip TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        user_agent TEXT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS instances (
        instance_id TEXT PRIMARY KEY,
        platform TEXT,
        arch TEXT,
        node_version TEXT,
        uptime_seconds INTEGER DEFAULT 0,
        active_rooms INTEGER DEFAULT 0,
        total_sessions INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        unique_ips INTEGER DEFAULT 0,
        first_seen TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS instance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        room_id TEXT,
        payload TEXT,
        event_ts TEXT,
        received_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions(room_id);
      CREATE INDEX IF NOT EXISTS idx_connections_session_id ON connections(session_id);
      CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_instances_last_seen ON instances(last_seen);
      CREATE TABLE IF NOT EXISTS instance_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL,
        active_rooms INTEGER DEFAULT 0,
        total_sessions INTEGER DEFAULT 0,
        total_connections INTEGER DEFAULT 0,
        unique_ips INTEGER DEFAULT 0,
        uptime_seconds INTEGER DEFAULT 0,
        sampled_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_instance_events_instance ON instance_events(instance_id, received_at);
      CREATE INDEX IF NOT EXISTS idx_instance_samples ON instance_samples(instance_id, sampled_at);
    `);

    // Migrate: add host column
    try {
      this.db!.exec("ALTER TABLE connections ADD COLUMN host TEXT DEFAULT ''");
    } catch {
      // column already exists
    }
    // Migrate: geo + contexto do visitante nos access_logs (page_view no mapa,
    // dispositivos/idiomas/origens no dashboard)
    for (const ddl of [
      'ALTER TABLE access_logs ADD COLUMN lat REAL DEFAULT 0',
      'ALTER TABLE access_logs ADD COLUMN lng REAL DEFAULT 0',
      "ALTER TABLE access_logs ADD COLUMN device TEXT DEFAULT ''",
      "ALTER TABLE access_logs ADD COLUMN locale TEXT DEFAULT ''",
      "ALTER TABLE access_logs ADD COLUMN referrer TEXT DEFAULT ''"
    ]) {
      try {
        this.db!.exec(ddl);
      } catch {
        /* coluna já existe */
      }
    }
    // Migrate: add lat/lng columns
    try {
      this.db!.exec("ALTER TABLE connections ADD COLUMN lat REAL DEFAULT 0");
    } catch { /* exists */ }
    try {
      this.db!.exec("ALTER TABLE connections ADD COLUMN lng REAL DEFAULT 0");
    } catch { /* exists */ }

    // Limpeza única (user_version 1): o geoip-lite antigo gravava país errado
    // sem coordenadas (ex.: faixa BR marcada como RW). País sem lat/lng não é
    // verificável nem mapeável — zera para não poluir os painéis.
    try {
      const version = (this.db!.pragma('user_version', { simple: true }) as number) ?? 0;
      if (version < 1) {
        this.db!.exec(`
          UPDATE access_logs SET country = '', region = '', city = '' WHERE lat = 0 AND lng = 0;
          UPDATE connections SET country = '', region = '', city = '' WHERE lat = 0 AND lng = 0;
          PRAGMA user_version = 1;
        `);
        console.log('[analytics] migração 1: geo sem coordenadas zerado');
      }
      // Migração 2 (histórica, 02/ago/2026): apagou os eventos por sala já
      // coletados. A decisão foi REVERTIDA no mesmo dia — premissa do produto
      // é que os filhos reportem o máximo de dados de uso e o master consuma
      // (/master/instances/:id/activity). A migração fica registrada porque
      // já rodou em produção; num banco novo ela roda vazia.
      if (version < 2) {
        this.db!.exec(`
          DELETE FROM instance_events;
          PRAGMA user_version = 2;
        `);
        console.log('[analytics] migração 2: eventos por sala descartados');
      }
      // Migração 3: bundles >= 1.2.3 reportam a versão do app no heartbeat —
      // o master passa a mostrar qual versão cada instalação roda.
      if (version < 3) {
        this.db!.exec(`
          ALTER TABLE instances ADD COLUMN app_version TEXT NOT NULL DEFAULT '';
          PRAGMA user_version = 3;
        `);
        console.log('[analytics] migração 3: coluna app_version em instances');
      }
      // Migração 4: geolocalização da INSTALAÇÃO (resolvida do IP público do
      // heartbeat) — mostra no mapa onde o produto está instalado.
      if (version < 4) {
        this.db!.exec(`
          ALTER TABLE instances ADD COLUMN country TEXT NOT NULL DEFAULT '';
          ALTER TABLE instances ADD COLUMN region TEXT NOT NULL DEFAULT '';
          ALTER TABLE instances ADD COLUMN city TEXT NOT NULL DEFAULT '';
          ALTER TABLE instances ADD COLUMN lat REAL NOT NULL DEFAULT 0;
          ALTER TABLE instances ADD COLUMN lng REAL NOT NULL DEFAULT 0;
          PRAGMA user_version = 4;
        `);
        console.log('[analytics] migração 4: geo da instalação em instances');
      }
      // Migração 5: salas abertas agora em cada instalação (JSON do último
      // heartbeat) — granularidade igual à do online no painel.
      if (version < 5) {
        this.db!.exec(`
          ALTER TABLE instances ADD COLUMN rooms_json TEXT NOT NULL DEFAULT '[]';
          PRAGMA user_version = 5;
        `);
        console.log('[analytics] migração 5: rooms_json em instances');
      }
      // Retenção: eventos por sala têm valor operacional por meses, não anos.
      // Limpa na inicialização para o banco não crescer sem limite.
      this.db!.exec(`DELETE FROM instance_events WHERE received_at < datetime('now', '-180 days')`);
    } catch (err) {
      console.error('[analytics] migração user_version falhou:', err);
    }
  }

  private resolveGeo(ip: string): GeoInfo {
    return lookupGeo(ip);
  }

  private hashPin(pin: string): string {
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  /** One-way hash of IP — keeps uniqueness counting without storing PII */
  private hashIp(ip: string): string {
    return crypto.createHash('sha256').update(ip + 'referee-lights-salt').digest('hex').slice(0, 16);
  }

  private periodToSql(period?: string): string {
    switch (period) {
      case 'today': return "date(connected_at) = date('now')";
      case '7d': return "connected_at >= datetime('now', '-7 days')";
      case 'all': return '1=1';
      default: return "connected_at >= datetime('now', '-30 days')";
    }
  }

  private periodToSqlCreated(period?: string): string {
    switch (period) {
      case 'today': return "date(created_at) = date('now')";
      case '7d': return "created_at >= datetime('now', '-7 days')";
      case 'all': return '1=1';
      default: return "created_at >= datetime('now', '-30 days')";
    }
  }

  logSessionCreated(roomId: string, adminPin: string): number | null {
    if (!this.db) return null;
    try {
      const stmt = this.db.prepare(
        'INSERT INTO sessions (room_id, admin_pin_hash) VALUES (?, ?)'
      );
      const result = stmt.run(roomId, this.hashPin(adminPin));
      return result.lastInsertRowid as number;
    } catch (err) {
      console.error('[analytics] logSessionCreated error:', err);
      return null;
    }
  }

  logConnection(
    sessionId: number | null,
    role: string,
    judgePosition: string | null,
    ip: string,
    host = ''
  ): number | null {
    if (!this.db) return null;
    try {
      const geo = this.resolveGeo(ip);
      const ipHash = this.hashIp(ip);
      const stmt = this.db.prepare(
        'INSERT INTO connections (session_id, role, judge_position, ip, country, region, city, host, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );
      const result = stmt.run(sessionId, role, judgePosition, ipHash, geo.country, geo.region, geo.city, host, geo.lat, geo.lng);
      return result.lastInsertRowid as number;
    } catch (err) {
      console.error('[analytics] logConnection error:', err);
      return null;
    }
  }

  logDisconnection(connectionId: number): void {
    if (!this.db) return;
    try {
      this.db
        .prepare("UPDATE connections SET disconnected_at = datetime('now') WHERE id = ?")
        .run(connectionId);
    } catch (err) {
      console.error('[analytics] logDisconnection error:', err);
    }
  }

  recordInstanceEvents(
    events: Array<{ instanceId: string; event: string; roomId?: string; data?: unknown; timestamp?: string }>
  ): number {
    if (!this.db) return 0;
    try {
      const stmt = this.db.prepare(
        'INSERT INTO instance_events (instance_id, event_type, room_id, payload, event_ts) VALUES (?, ?, ?, ?, ?)'
      );
      const insertAll = this.db.transaction(
        (batch: Array<{ instanceId: string; event: string; roomId?: string; data?: unknown; timestamp?: string }>) => {
          for (const ev of batch) {
            stmt.run(
              ev.instanceId,
              ev.event,
              ev.roomId ?? null,
              ev.data != null ? JSON.stringify(ev.data).slice(0, 2000) : null,
              ev.timestamp ?? null
            );
          }
        }
      );
      insertAll(events);
      return events.length;
    } catch (err) {
      console.error('[analytics] recordInstanceEvents error:', err);
      return 0;
    }
  }

  logAccess(
    eventType: string,
    roomId: string | null,
    ip: string,
    meta?: { device?: string; locale?: string; referrer?: string }
  ): void {
    if (!this.db) return;
    try {
      const geo = this.resolveGeo(ip);
      const ipHash = this.hashIp(ip);
      this.db
        .prepare(
          'INSERT INTO access_logs (event_type, room_id, ip, country, region, city, user_agent, lat, lng, device, locale, referrer) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          eventType,
          roomId,
          ipHash,
          geo.country,
          geo.region,
          geo.city,
          '',
          geo.lat,
          geo.lng,
          meta?.device ?? '',
          meta?.locale ?? '',
          meta?.referrer ?? ''
        );
    } catch (err) {
      console.error('[analytics] logAccess error:', err);
    }
  }

  findSessionByRoomId(roomId: string): number | null {
    if (!this.db) return null;
    try {
      const row = this.db
        .prepare('SELECT id FROM sessions WHERE room_id = ? ORDER BY id DESC LIMIT 1')
        .get(roomId) as { id: number } | undefined;
      return row?.id ?? null;
    } catch {
      return null;
    }
  }

  getStats(activeRoomCount: number, period?: string): StatsResult {
    if (!this.db) {
      return { totalSessions: 0, totalConnections: 0, uniqueIps: 0, activeRooms: activeRoomCount };
    }
    try {
      const whereSess = this.periodToSqlCreated(period);
      const whereConn = this.periodToSql(period);
      const sessions = this.db.prepare(`SELECT COUNT(*) as c FROM sessions WHERE ${whereSess}`).get() as { c: number };
      const connections = this.db.prepare(`SELECT COUNT(*) as c FROM connections WHERE ${whereConn}`).get() as { c: number };
      const ips = this.db
        .prepare(`SELECT COUNT(DISTINCT ip) as c FROM connections WHERE ip IS NOT NULL AND ip != '' AND ${whereConn}`)
        .get() as { c: number };
      return {
        totalSessions: sessions.c,
        totalConnections: connections.c,
        uniqueIps: ips.c,
        activeRooms: activeRoomCount
      };
    } catch (err) {
      console.error('[analytics] getStats error:', err);
      return { totalSessions: 0, totalConnections: 0, uniqueIps: 0, activeRooms: activeRoomCount };
    }
  }

  /** Marca a sessão como encerrada (sala arquivada por inatividade ou fim de uso). */
  closeSession(sessionId: number): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(`UPDATE sessions SET closed_at = datetime('now') WHERE id = ? AND closed_at IS NULL`)
        .run(sessionId);
    } catch (err) {
      console.error('[analytics] closeSession error:', err);
    }
  }

  getRecentSessions(limit: number, offset: number): SessionRow[] {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT
            s.id, s.room_id, s.created_at, s.closed_at,
            COUNT(c.id) as connection_count,
            (SELECT c2.country FROM connections c2 WHERE c2.session_id = s.id AND c2.country != '' GROUP BY c2.country ORDER BY COUNT(*) DESC LIMIT 1) as top_country
          FROM sessions s
          LEFT JOIN connections c ON c.session_id = s.id
          GROUP BY s.id
          ORDER BY s.id DESC
          LIMIT ? OFFSET ?`
        )
        .all(limit, offset) as SessionRow[];
    } catch (err) {
      console.error('[analytics] getRecentSessions error:', err);
      return [];
    }
  }

  getTimeline(period?: string): Array<{ date: string; sessions: number; connections: number; views: number }> {
    if (!this.db) return [];
    try {
      const whereSess = this.periodToSqlCreated(period);
      const whereConn = this.periodToSql(period);
      const whereLog = this.periodToSql(period).replaceAll('connected_at', 'timestamp');
      // União por dia: dias com só visitas (sem sessão) também aparecem
      return this.db.prepare(
        `SELECT date, SUM(sessions) as sessions, SUM(connections) as connections, SUM(views) as views FROM (
          SELECT date(created_at) as date, 1 as sessions, 0 as connections, 0 as views FROM sessions WHERE ${whereSess}
          UNION ALL
          SELECT date(connected_at), 0, 1, 0 FROM connections WHERE ${whereConn}
          UNION ALL
          SELECT date(timestamp), 0, 0, 1 FROM access_logs WHERE event_type = 'page_view' AND ${whereLog}
        )
        GROUP BY date
        ORDER BY date ASC`
      ).all() as Array<{ date: string; sessions: number; connections: number; views: number }>;
    } catch (err) {
      console.error('[analytics] getTimeline error:', err);
      return [];
    }
  }

  getHourlyDistribution(): Array<{ hour: number; count: number }> {
    if (!this.db) return [];
    try {
      const rows = this.db
        .prepare(
          `SELECT CAST(strftime('%H', connected_at) AS INTEGER) as hour, COUNT(*) as count
          FROM connections
          WHERE connected_at >= datetime('now', '-30 days')
          GROUP BY hour
          ORDER BY hour ASC`
        )
        .all() as Array<{ hour: number; count: number }>;
      // Fill missing hours with 0
      const map = new Map(rows.map((r) => [r.hour, r.count]));
      return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: map.get(i) ?? 0 }));
    } catch (err) {
      console.error('[analytics] getHourlyDistribution error:', err);
      return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    }
  }

  getRoleBreakdown(): Array<{ role: string; count: number }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT role, COUNT(*) as count FROM connections GROUP BY role ORDER BY count DESC`
        )
        .all() as Array<{ role: string; count: number }>;
    } catch (err) {
      console.error('[analytics] getRoleBreakdown error:', err);
      return [];
    }
  }

  getDurationStats(period?: string): { avgMinutes: number; maxMinutes: number; totalHours: number } {
    if (!this.db) return { avgMinutes: 0, maxMinutes: 0, totalHours: 0 };
    try {
      const where = this.periodToSql(period);
      const row = this.db.prepare(
        `SELECT
          AVG((julianday(COALESCE(disconnected_at, datetime('now'))) - julianday(connected_at)) * 1440) as avg_min,
          MAX((julianday(COALESCE(disconnected_at, datetime('now'))) - julianday(connected_at)) * 1440) as max_min,
          SUM((julianday(COALESCE(disconnected_at, datetime('now'))) - julianday(connected_at)) * 24) as total_hours
        FROM connections
        WHERE ${where}`
      ).get() as { avg_min: number | null; max_min: number | null; total_hours: number | null };
      return {
        avgMinutes: Math.round((row.avg_min ?? 0) * 10) / 10,
        maxMinutes: Math.round((row.max_min ?? 0) * 10) / 10,
        totalHours: Math.round((row.total_hours ?? 0) * 10) / 10
      };
    } catch (err) {
      console.error('[analytics] getDurationStats error:', err);
      return { avgMinutes: 0, maxMinutes: 0, totalHours: 0 };
    }
  }

  getRecentActivity(hours = 24): Array<{ minute: string; connections: number }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT
            strftime('%Y-%m-%dT%H:00', connected_at) as minute,
            COUNT(*) as connections
          FROM connections
          WHERE connected_at >= datetime('now', ?)
          GROUP BY minute
          ORDER BY minute ASC`
        )
        .all(`-${hours} hours`) as Array<{ minute: string; connections: number }>;
    } catch (err) {
      console.error('[analytics] getRecentActivity error:', err);
      return [];
    }
  }

  upsertHeartbeat(data: {
    instanceId: string;
    appVersion?: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    uptimeSeconds: number;
    stats: {
      activeRooms: number;
      totalSessions: number;
      totalConnections: number;
      uniqueIps: number;
      rooms?: Array<{ id: string; createdAt: number; connectedJudges: number; phase: string }>;
    } | null;
    /** Momento em que a amostra foi tirada na origem (pode chegar atrasada pela fila offline). */
    sampledAt?: string;
    /** IP público de origem do heartbeat — vira geo da instalação, nunca é gravado cru. */
    ip?: string;
  }): void {
    if (!this.db) return;
    try {
      // Amostra sem stats (payload degenerado ou remetente antigo) não pode
      // ZERAR os contadores já conhecidos — atualiza só metadados e uptime.
      if (data.stats) {
        this.db
          .prepare(
            `INSERT INTO instances (instance_id, app_version, platform, arch, node_version, uptime_seconds, active_rooms, total_sessions, total_connections, unique_ips, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(instance_id) DO UPDATE SET
              app_version = CASE WHEN excluded.app_version != '' THEN excluded.app_version ELSE instances.app_version END,
              platform = excluded.platform,
              arch = excluded.arch,
              node_version = excluded.node_version,
              uptime_seconds = excluded.uptime_seconds,
              active_rooms = excluded.active_rooms,
              total_sessions = excluded.total_sessions,
              total_connections = excluded.total_connections,
              unique_ips = excluded.unique_ips,
              last_seen = datetime('now')`
          )
          .run(
            data.instanceId,
            data.appVersion ?? '',
            data.platform,
            data.arch,
            data.nodeVersion,
            data.uptimeSeconds,
            data.stats.activeRooms ?? 0,
            data.stats.totalSessions ?? 0,
            data.stats.totalConnections ?? 0,
            data.stats.uniqueIps ?? 0
          );
      } else {
        this.db
          .prepare(
            `INSERT INTO instances (instance_id, app_version, platform, arch, node_version, uptime_seconds, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(instance_id) DO UPDATE SET
              app_version = CASE WHEN excluded.app_version != '' THEN excluded.app_version ELSE instances.app_version END,
              platform = excluded.platform,
              arch = excluded.arch,
              node_version = excluded.node_version,
              uptime_seconds = excluded.uptime_seconds,
              last_seen = datetime('now')`
          )
          .run(data.instanceId, data.appVersion ?? '', data.platform, data.arch, data.nodeVersion, data.uptimeSeconds);
      }

      // Salas abertas agora (estado atual, substitui o anterior a cada amostra)
      if (data.stats) {
        const rooms = Array.isArray(data.stats.rooms) ? data.stats.rooms.slice(0, 20) : [];
        this.db
          .prepare('UPDATE instances SET rooms_json = ? WHERE instance_id = ?')
          .run(JSON.stringify(rooms).slice(0, 4000), data.instanceId);
      }

      // Geo da instalação a partir do IP de origem (o IP em si não é gravado)
      if (data.ip) {
        const geo = this.resolveGeo(data.ip);
        if (geo.country && (geo.lat !== 0 || geo.lng !== 0)) {
          this.db
            .prepare('UPDATE instances SET country = ?, region = ?, city = ?, lat = ?, lng = ? WHERE instance_id = ?')
            .run(geo.country, geo.region, geo.city, geo.lat, geo.lng, data.instanceId);
        }
      }

      // A tabela `instances` é upsert: só guarda o estado atual. O histórico
      // vive aqui, e é o que permite responder "quanto esta instalação foi
      // usada ao longo do tempo" sem tocar em dado de competição alheia.
      this.db
        .prepare(
          `INSERT INTO instance_samples (instance_id, active_rooms, total_sessions, total_connections, unique_ips, uptime_seconds, sampled_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))`
        )
        .run(
          data.instanceId,
          data.stats?.activeRooms ?? 0,
          data.stats?.totalSessions ?? 0,
          data.stats?.totalConnections ?? 0,
          data.stats?.uniqueIps ?? 0,
          data.uptimeSeconds,
          data.sampledAt ?? null
        );
    } catch (err) {
      console.error('[analytics] upsertHeartbeat error:', err);
    }
  }

  /** Resumo agregado das instalações (bundles) — alimenta o split online × bundle. */
  getBundleSummary(excludeInstanceId = ''): {
    instances: number;
    onlineInstances: number;
    sessions: number;
    connections: number;
    decisions: number;
    errors: number;
  } {
    // excludeInstanceId = a instância do PRÓPRIO servidor central, que também
    // se reporta — sem excluir, as sessões online seriam contadas de novo
    // como "bundle".
    const zero = { instances: 0, onlineInstances: 0, sessions: 0, connections: 0, decisions: 0, errors: 0 };
    if (!this.db) return zero;
    try {
      const inst = this.db
        .prepare(
          `SELECT COUNT(*) AS instances,
                  COALESCE(SUM(CASE WHEN last_seen >= datetime('now', '-10 minutes') THEN 1 ELSE 0 END), 0) AS onlineInstances,
                  COALESCE(SUM(total_sessions), 0) AS sessions,
                  COALESCE(SUM(total_connections), 0) AS connections
           FROM instances WHERE instance_id != ?`
        )
        .get(excludeInstanceId) as { instances: number; onlineInstances: number; sessions: number; connections: number };
      const ev = this.db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN event_type = 'decision' THEN 1 ELSE 0 END), 0) AS decisions,
                  COALESCE(SUM(CASE WHEN event_type = 'error' THEN 1 ELSE 0 END), 0) AS errors
           FROM instance_events WHERE instance_id != ?`
        )
        .get(excludeInstanceId) as { decisions: number; errors: number };
      return { ...inst, ...ev };
    } catch (err) {
      console.error('[analytics] getBundleSummary error:', err);
      return zero;
    }
  }

  /** Instalações com heartbeat nos últimos 10 min — o "ao vivo" dos bundles. */
  getOnlineBundleInstances(excludeInstanceId = ''): Array<{
    instance_id: string;
    app_version: string;
    platform: string;
    active_rooms: number;
    country: string;
    city: string;
    last_seen: string;
    rooms: Array<{ id: string; createdAt: number; connectedJudges: number; phase: string }>;
  }> {
    if (!this.db) return [];
    try {
      const rows = this.db
        .prepare(
          `SELECT instance_id, app_version, platform, active_rooms, country, city, last_seen, rooms_json
           FROM instances WHERE last_seen >= datetime('now', '-10 minutes') AND instance_id != ?
           ORDER BY last_seen DESC`
        )
        .all(excludeInstanceId) as Array<Record<string, unknown>>;
      return rows.map((r) => {
        let rooms: Array<{ id: string; createdAt: number; connectedJudges: number; phase: string }> = [];
        try { rooms = JSON.parse(String(r.rooms_json ?? '[]')); } catch { /* json inválido: lista vazia */ }
        const rest = { ...r };
        delete rest.rooms_json;
        return { ...rest, rooms } as any;
      });
    } catch (err) {
      console.error('[analytics] getOnlineBundleInstances error:', err);
      return [];
    }
  }

  /** Sessões/conexões/decisões dos bundles por dia — série "bundle" da tendência. */
  getBundleTimeline(period?: string, excludeInstanceId = ''): Array<{ date: string; sessions: number; connections: number; decisions: number }> {
    if (!this.db) return [];
    try {
      const where = this.periodToSql(period).replaceAll('connected_at', 'received_at');
      return this.db
        .prepare(
          `SELECT date(received_at) AS date,
                  SUM(CASE WHEN event_type = 'session_created' THEN 1 ELSE 0 END) AS sessions,
                  SUM(CASE WHEN event_type = 'connection' THEN 1 ELSE 0 END) AS connections,
                  SUM(CASE WHEN event_type = 'decision' THEN 1 ELSE 0 END) AS decisions
           FROM instance_events WHERE instance_id != ? AND ${where}
           GROUP BY date ORDER BY date ASC`
        )
        .all(excludeInstanceId) as any[];
    } catch (err) {
      console.error('[analytics] getBundleTimeline error:', err);
      return [];
    }
  }

  /** Sessões criadas dentro dos bundles (com a instância de origem). */
  getBundleSessions(limit: number, excludeInstanceId = ''): Array<{ room_id: string | null; instance_id: string; created_at: string }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT room_id, instance_id, received_at AS created_at
           FROM instance_events WHERE event_type = 'session_created' AND instance_id != ?
           ORDER BY id DESC LIMIT ?`
        )
        .all(excludeInstanceId, Math.min(100, Math.max(1, limit))) as any[];
    } catch (err) {
      console.error('[analytics] getBundleSessions error:', err);
      return [];
    }
  }

  /** Instalações por cidade — marcadores "bundle" do mapa. */
  getInstanceMarkers(excludeInstanceId = ''): Array<{ city: string; country: string; lat: number; lng: number; count: number }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT city, country, AVG(lat) AS lat, AVG(lng) AS lng, COUNT(*) AS count
           FROM instances WHERE NOT (lat = 0 AND lng = 0) AND instance_id != ?
           GROUP BY country, city ORDER BY count DESC`
        )
        .all(excludeInstanceId) as any[];
    } catch (err) {
      console.error('[analytics] getInstanceMarkers error:', err);
      return [];
    }
  }

  /** Atividade de uma instância: eventos por sala + histórico de heartbeat. */
  getInstanceActivity(instanceId: string): {
    events: Array<{ event_type: string; room_id: string | null; event_ts: string | null; received_at: string }>;
    samples: Array<{ active_rooms: number; total_sessions: number; total_connections: number; unique_ips: number; uptime_seconds: number; sampled_at: string }>;
  } {
    if (!this.db) return { events: [], samples: [] };
    try {
      const events = this.db
        .prepare(
          `SELECT event_type, room_id, event_ts, received_at
           FROM instance_events WHERE instance_id = ?
           ORDER BY id DESC LIMIT 200`
        )
        .all(instanceId) as any[];
      const samples = this.db
        .prepare(
          `SELECT active_rooms, total_sessions, total_connections, unique_ips, uptime_seconds, sampled_at
           FROM instance_samples WHERE instance_id = ?
           ORDER BY id DESC LIMIT 288`
        )
        .all(instanceId) as any[];
      return { events, samples };
    } catch (err) {
      console.error('[analytics] getInstanceActivity error:', err);
      return { events: [], samples: [] };
    }
  }

  getInstances(): Array<{
    instance_id: string;
    app_version: string;
    platform: string;
    arch: string;
    node_version: string;
    uptime_seconds: number;
    active_rooms: number;
    total_sessions: number;
    total_connections: number;
    unique_ips: number;
    first_seen: string;
    last_seen: string;
  }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare('SELECT * FROM instances ORDER BY last_seen DESC')
        .all() as any[];
    } catch (err) {
      console.error('[analytics] getInstances error:', err);
      return [];
    }
  }

  /** Visitantes do site "ao vivo": page_views dos últimos N minutos, um por IP (hasheado). */
  getRecentSiteVisitors(windowMinutes = 5): Array<{ page: string; country: string; city: string; last_seen: string }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT room_id as page, country, city, MAX(timestamp) as last_seen
           FROM access_logs
           WHERE event_type = 'page_view'
             AND timestamp >= datetime('now', ?)
           GROUP BY ip
           ORDER BY last_seen DESC
           LIMIT 100`
        )
        .all(`-${windowMinutes} minutes`) as Array<{ page: string; country: string; city: string; last_seen: string }>;
    } catch (err) {
      console.error('[analytics] getRecentSiteVisitors error:', err);
      return [];
    }
  }

  getLinkClicks(): Array<{ url: string; count: number; last_click: string }> {
    if (!this.db) return [];
    try {
      return this.db
        .prepare(
          `SELECT room_id as url, COUNT(*) as count, MAX(timestamp) as last_click
          FROM access_logs
          WHERE event_type = 'link_click'
          GROUP BY room_id
          ORDER BY count DESC`
        )
        .all() as Array<{ url: string; count: number; last_click: string }>;
    } catch (err) {
      console.error('[analytics] getLinkClicks error:', err);
      return [];
    }
  }

  getGeoDistribution(period?: string): GeoDistribution {
    if (!this.db) return { countries: [], cities: [] };
    try {
      const whereConn = this.periodToSql(period);
      const whereLog = this.periodToSql(period).replaceAll('connected_at', 'timestamp');
      const unionSql = `
        SELECT country, city FROM connections WHERE ${whereConn}
        UNION ALL
        SELECT country, city FROM access_logs WHERE event_type = 'page_view' AND ${whereLog}`;
      const countries = this.db.prepare(
        `SELECT country, COUNT(*) as count FROM (${unionSql}) WHERE country != '' GROUP BY country ORDER BY count DESC LIMIT 30`
      ).all() as Array<{ country: string; count: number }>;
      const cities = this.db.prepare(
        `SELECT city, country, COUNT(*) as count FROM (${unionSql}) WHERE city != '' GROUP BY city, country ORDER BY count DESC LIMIT 30`
      ).all() as Array<{ city: string; country: string; count: number }>;
      return { countries, cities };
    } catch (err) {
      console.error('[analytics] getGeoDistribution error:', err);
      return { countries: [], cities: [] };
    }
  }

  getGeoMarkers(
    period?: string
  ): Array<{ city: string; country: string; lat: number; lng: number; count: number; users: number; visitors: number }> {
    if (!this.db) return [];
    try {
      const whereConn = this.periodToSql(period);
      const whereLog = this.periodToSql(period).replaceAll('connected_at', 'timestamp');
      // União de usuários de sala (connections) e visitantes do site
      // (page_view), clusterizada por região: lat/lng arredondados a 1 casa
      // (~11km) — mesmo IP ou vizinhança viram UM ponto com contagens por tipo.
      // Sem exigir city != '': o geoip raramente resolve cidade, só país+coord.
      return this.db.prepare(
        `SELECT
          MAX(city) as city, MAX(country) as country,
          ROUND(AVG(lat), 4) as lat, ROUND(AVG(lng), 4) as lng,
          SUM(CASE WHEN src = 'user' THEN 1 ELSE 0 END) as users,
          SUM(CASE WHEN src = 'visitor' THEN 1 ELSE 0 END) as visitors,
          COUNT(*) as count
        FROM (
          SELECT lat, lng, city, country, 'user' as src
          FROM connections WHERE lat != 0 AND lng != 0 AND ${whereConn}
          UNION ALL
          SELECT lat, lng, city, country, 'visitor' as src
          FROM access_logs WHERE event_type = 'page_view' AND lat != 0 AND lng != 0 AND ${whereLog}
        )
        GROUP BY ROUND(lat, 1), ROUND(lng, 1)
        ORDER BY count DESC
        LIMIT 100`
      ).all() as Array<{ city: string; country: string; lat: number; lng: number; count: number; users: number; visitors: number }>;
    } catch (err) {
      console.error('[analytics] getGeoMarkers error:', err);
      return [];
    }
  }

  /** Agregado simples de uma coluna dos page_views (device, locale, referrer). */
  private pageViewFacet(column: 'device' | 'locale' | 'referrer', period?: string): Array<{ value: string; count: number }> {
    if (!this.db) return [];
    try {
      const where = this.periodToSql(period).replaceAll('connected_at', 'timestamp');
      return this.db
        .prepare(
          `SELECT ${column} as value, COUNT(*) as count
           FROM access_logs
           WHERE event_type = 'page_view' AND ${column} != '' AND ${where}
           GROUP BY ${column}
           ORDER BY count DESC
           LIMIT 20`
        )
        .all() as Array<{ value: string; count: number }>;
    } catch (err) {
      console.error(`[analytics] pageViewFacet(${column}) error:`, err);
      return [];
    }
  }

  getDevices(period?: string) {
    return this.pageViewFacet('device', period);
  }

  getLocales(period?: string) {
    return this.pageViewFacet('locale', period);
  }

  getReferrers(period?: string) {
    return this.pageViewFacet('referrer', period);
  }

  getPages(period?: string): Array<{ page: string; count: number }> {
    if (!this.db) return [];
    try {
      const whereConn = this.periodToSql(period);
      const whereLog = this.periodToSql(period).replaceAll('connected_at', 'timestamp');
      // Une os page_view reais do site (access_logs, beacon do frontend) com
      // as telas de app derivadas das conexões de socket — antes só as
      // segundas existiam e o tráfego da landing/windows era invisível.
      return this.db.prepare(
        `SELECT page, SUM(count) as count FROM (
          SELECT room_id as page, COUNT(*) as count
          FROM access_logs
          WHERE event_type = 'page_view' AND room_id IS NOT NULL AND ${whereLog}
          GROUP BY room_id
          UNION ALL
          SELECT
            CASE
              WHEN role IN ('left','center','right') THEN '/ref/' || role
              WHEN role = 'admin' THEN '/admin'
              WHEN role = 'display' THEN '/display'
              ELSE '/'
            END as page,
            COUNT(*) as count
          FROM connections
          WHERE ${whereConn}
          GROUP BY page
        )
        GROUP BY page
        ORDER BY count DESC`
      ).all() as Array<{ page: string; count: number }>;
    } catch (err) {
      console.error('[analytics] getPages error:', err);
      return [];
    }
  }

  getHosts(period?: string): Array<{ host: string; count: number }> {
    if (!this.db) return [];
    try {
      const where = this.periodToSql(period);
      return this.db.prepare(
        `SELECT host, COUNT(*) as count
        FROM connections
        WHERE host != '' AND ${where}
        GROUP BY host
        ORDER BY count DESC`
      ).all() as Array<{ host: string; count: number }>;
    } catch (err) {
      console.error('[analytics] getHosts error:', err);
      return [];
    }
  }
}
