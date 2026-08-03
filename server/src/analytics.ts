import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import geoip from 'geoip-lite';

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

      -- Estado vivo das salas para recuperação pós-restart (PIN e tokens em
      -- claro DE PROPÓSITO: são credenciais efêmeras de sala, o banco é local
      -- ao servidor, e sem elas a sala não volta com os mesmos QR codes).
      CREATE TABLE IF NOT EXISTS rooms_state (
        room_id TEXT PRIMARY KEY,
        admin_pin TEXT NOT NULL,
        referee_tokens_json TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        last_activity_ms INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_room_id ON sessions(room_id);
      CREATE INDEX IF NOT EXISTS idx_connections_session_id ON connections(session_id);
      CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_instances_last_seen ON instances(last_seen);
    `);

    // Migrate: add host column
    try {
      this.db!.exec("ALTER TABLE connections ADD COLUMN host TEXT DEFAULT ''");
    } catch {
      // column already exists
    }
    // Migrate: add lat/lng columns
    try {
      this.db!.exec("ALTER TABLE connections ADD COLUMN lat REAL DEFAULT 0");
    } catch { /* exists */ }
    try {
      this.db!.exec("ALTER TABLE connections ADD COLUMN lng REAL DEFAULT 0");
    } catch { /* exists */ }
  }

  private resolveGeo(ip: string): GeoInfo {
    try {
      const result = geoip.lookup(ip);
      if (!result) return { country: '', region: '', city: '', lat: 0, lng: 0 };
      return {
        country: result.country ?? '',
        region: typeof result.region === 'string' ? result.region : '',
        city: result.city ?? '',
        lat: result.ll?.[0] ?? 0,
        lng: result.ll?.[1] ?? 0
      };
    } catch {
      return { country: '', region: '', city: '', lat: 0, lng: 0 };
    }
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

  logAccess(eventType: string, roomId: string | null, ip: string): void {
    if (!this.db) return;
    try {
      const geo = this.resolveGeo(ip);
      const ipHash = this.hashIp(ip);
      this.db
        .prepare(
          'INSERT INTO access_logs (event_type, room_id, ip, country, region, city, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(eventType, roomId, ipHash, geo.country, geo.region, geo.city, '');
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

  /* ─── Recuperação de salas (restart não pode matar uma competição) ─── */

  saveRoomState(room: {
    roomId: string;
    adminPin: string;
    refereeTokens: Record<string, string>;
    createdAt: number;
    lastActivityAt: number;
  }): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO rooms_state (room_id, admin_pin, referee_tokens_json, created_at_ms, last_activity_ms)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(room.roomId, room.adminPin, JSON.stringify(room.refereeTokens), room.createdAt, room.lastActivityAt);
    } catch (err) {
      console.error('[analytics] saveRoomState error:', err);
    }
  }

  touchRoomState(roomId: string, lastActivityMs: number): void {
    if (!this.db) return;
    try {
      this.db.prepare('UPDATE rooms_state SET last_activity_ms = ? WHERE room_id = ?').run(lastActivityMs, roomId);
    } catch (err) {
      console.error('[analytics] touchRoomState error:', err);
    }
  }

  deleteRoomState(roomId: string): void {
    if (!this.db) return;
    try {
      this.db.prepare('DELETE FROM rooms_state WHERE room_id = ?').run(roomId);
    } catch (err) {
      console.error('[analytics] deleteRoomState error:', err);
    }
  }

  /** Salas com atividade dentro da janela — as que voltam após um restart. */
  loadRoomStates(maxAgeMs: number): Array<{
    roomId: string;
    adminPin: string;
    refereeTokens: Record<string, string>;
    createdAt: number;
    lastActivityAt: number;
  }> {
    if (!this.db) return [];
    try {
      const cutoff = Date.now() - maxAgeMs;
      this.db.prepare('DELETE FROM rooms_state WHERE last_activity_ms < ?').run(cutoff);
      return (this.db.prepare('SELECT * FROM rooms_state').all() as Array<Record<string, unknown>>).map((r) => ({
        roomId: String(r.room_id),
        adminPin: String(r.admin_pin),
        refereeTokens: JSON.parse(String(r.referee_tokens_json)),
        createdAt: Number(r.created_at_ms),
        lastActivityAt: Number(r.last_activity_ms)
      }));
    } catch (err) {
      console.error('[analytics] loadRoomStates error:', err);
      return [];
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

  getTimeline(period?: string): Array<{ date: string; sessions: number; connections: number }> {
    if (!this.db) return [];
    try {
      const whereSess = this.periodToSqlCreated(period);
      return this.db.prepare(
        `SELECT
          date(created_at) as date,
          COUNT(*) as sessions,
          (SELECT COUNT(*) FROM connections WHERE date(connected_at) = date(s.created_at)) as connections
        FROM sessions s
        WHERE ${whereSess}
        GROUP BY date(created_at)
        ORDER BY date ASC`
      ).all() as Array<{ date: string; sessions: number; connections: number }>;
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
    platform: string;
    arch: string;
    nodeVersion: string;
    uptimeSeconds: number;
    stats: { activeRooms: number; totalSessions: number; totalConnections: number; uniqueIps: number } | null;
  }): void {
    if (!this.db) return;
    try {
      this.db
        .prepare(
          `INSERT INTO instances (instance_id, platform, arch, node_version, uptime_seconds, active_rooms, total_sessions, total_connections, unique_ips, first_seen, last_seen)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(instance_id) DO UPDATE SET
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
          data.platform,
          data.arch,
          data.nodeVersion,
          data.uptimeSeconds,
          data.stats?.activeRooms ?? 0,
          data.stats?.totalSessions ?? 0,
          data.stats?.totalConnections ?? 0,
          data.stats?.uniqueIps ?? 0
        );
    } catch (err) {
      console.error('[analytics] upsertHeartbeat error:', err);
    }
  }

  getInstances(): Array<{
    instance_id: string;
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
      const where = this.periodToSql(period);
      const countries = this.db.prepare(
        `SELECT country, COUNT(*) as count FROM connections WHERE country != '' AND ${where} GROUP BY country ORDER BY count DESC LIMIT 30`
      ).all() as Array<{ country: string; count: number }>;
      const cities = this.db.prepare(
        `SELECT city, country, COUNT(*) as count FROM connections WHERE city != '' AND ${where} GROUP BY city, country ORDER BY count DESC LIMIT 30`
      ).all() as Array<{ city: string; country: string; count: number }>;
      return { countries, cities };
    } catch (err) {
      console.error('[analytics] getGeoDistribution error:', err);
      return { countries: [], cities: [] };
    }
  }

  getGeoMarkers(period?: string): Array<{ city: string; country: string; lat: number; lng: number; count: number }> {
    if (!this.db) return [];
    try {
      const where = this.periodToSql(period);
      return this.db.prepare(
        `SELECT city, country, ROUND(AVG(lat), 4) as lat, ROUND(AVG(lng), 4) as lng, COUNT(*) as count
        FROM connections
        WHERE city != '' AND lat != 0 AND lng != 0 AND ${where}
        GROUP BY city, country
        ORDER BY count DESC
        LIMIT 50`
      ).all() as Array<{ city: string; country: string; lat: number; lng: number; count: number }>;
    } catch (err) {
      console.error('[analytics] getGeoMarkers error:', err);
      return [];
    }
  }

  getPages(period?: string): Array<{ page: string; count: number }> {
    if (!this.db) return [];
    try {
      const where = this.periodToSql(period);
      return this.db.prepare(
        `SELECT
          CASE
            WHEN role IN ('left','center','right') THEN '/ref/' || role
            WHEN role = 'admin' THEN '/admin'
            WHEN role = 'display' THEN '/display'
            ELSE '/'
          END as page,
          COUNT(*) as count
        FROM connections
        WHERE ${where}
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
