// deviceManager.js — Bağlı cihazların izlenmesi
class DeviceManager {
  constructor(db, io) {
    this.db = db;
    this.io = io;
    this.HEARTBEAT_TIMEOUT_MS = 45_000;
    this.init();
    this.startWatcher();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS devices (
        socket_id   TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        type        TEXT NOT NULL,
        status      TEXT NOT NULL,         -- online | lost | offline
        last_seen   INTEGER NOT NULL,
        connected_at INTEGER NOT NULL
      );
    `);
  }

  register(socketId, info = {}) {
    const now = Date.now();
    const name = info.name || 'Bilinmeyen Cihaz';
    const type = info.type || 'web';
    this.db.prepare(`
      INSERT INTO devices (socket_id, name, type, status, last_seen, connected_at)
      VALUES (?, ?, ?, 'online', ?, ?)
      ON CONFLICT(socket_id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        status = 'online',
        last_seen = excluded.last_seen
    `).run(socketId, name, type, now, now);

    this.broadcast();
  }

  heartbeat(socketId) {
    const r = this.db.prepare(`
      UPDATE devices SET last_seen = ?, status = 'online' WHERE socket_id = ?
    `).run(Date.now(), socketId);
    if (r.changes > 0) this.broadcast();
  }

  disconnect(socketId) {
    this.db.prepare(`
      UPDATE devices SET status = 'offline', last_seen = ? WHERE socket_id = ?
    `).run(Date.now(), socketId);
    this.broadcast();
  }

  rename(socketId, newName) {
    this.db.prepare('UPDATE devices SET name = ? WHERE socket_id = ?')
      .run(newName, socketId);
    this.broadcast();
    return this.list();
  }

  list() {
    return this.db.prepare(`
      SELECT * FROM devices ORDER BY
        CASE status WHEN 'online' THEN 0 WHEN 'lost' THEN 1 ELSE 2 END,
        last_seen DESC
    `).all();
  }

  startWatcher() {
    setInterval(() => {
      const cutoff = Date.now() - this.HEARTBEAT_TIMEOUT_MS;
      const r = this.db.prepare(`
        UPDATE devices SET status = 'lost'
        WHERE status = 'online' AND last_seen < ?
      `).run(cutoff);
      if (r.changes > 0) this.broadcast();
    }, 15_000);
  }

  broadcast() {
    if (this.io) {
      this.io.emit('devices:update', this.list());
    }
  }
}

module.exports = DeviceManager;
