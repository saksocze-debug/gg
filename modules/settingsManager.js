// settingsManager.js — Kimlik, kişilik, dil ve diğer kullanıcı ayarları
class SettingsManager {
  constructor(db) {
    this.db = db;
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Varsayılan değerleri yerleştir (yoksa)
    const defaults = {
      ai_name: 'JARVIS',
      personality: 'Profesyonel',         // Profesyonel | Sorumlu | Yaratıcı | Analitik
      language: 'tr',                     // tr | en | multi
      voice_enabled: 'true',
      wake_word: 'hey jarvis'
    };

    const insertIfMissing = this.db.prepare(
      'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    );
    const now = Date.now();
    for (const [k, v] of Object.entries(defaults)) {
      insertIfMissing.run(k, v, now);
    }
  }

  getAll() {
    const rows = this.db.prepare('SELECT key, value FROM settings').all();
    return rows.reduce((acc, r) => ((acc[r.key] = r.value), acc), {});
  }

  get(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  }

  set(key, value) {
    this.db
      .prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `)
      .run(key, String(value), Date.now());
    return this.get(key);
  }

  setMany(obj = {}) {
    const tx = this.db.transaction((entries) => {
      for (const [k, v] of Object.entries(entries)) {
        this.set(k, v);
      }
    });
    tx(obj);
    return this.getAll();
  }
}

module.exports = SettingsManager;
