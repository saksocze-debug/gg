// memoryManager.js — Kısa ve uzun süreli hafıza yönetimi
const { v4: uuidv4 } = require('uuid');

class MemoryManager {
  constructor(db) {
    this.db = db;
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id         TEXT PRIMARY KEY,
        title      TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL,
        role            TEXT NOT NULL,         -- user | assistant | system
        content         TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);

      CREATE TABLE IF NOT EXISTS long_memory (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        key        TEXT NOT NULL,
        value      TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_long_memory_key ON long_memory(key);
    `);
  }

  // ─── Konuşmalar ─────────────────────────────────────────
  createConversation(title = 'Yeni Konuşma') {
    const id = uuidv4();
    this.db.prepare(
      'INSERT INTO conversations (id, title, created_at) VALUES (?, ?, ?)'
    ).run(id, title, Date.now());
    return { id, title };
  }

  listConversations() {
    return this.db.prepare(
      'SELECT * FROM conversations ORDER BY created_at DESC'
    ).all();
  }

  deleteConversation(id) {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(id);
  }

  // ─── Kısa süreli (mesajlar) ─────────────────────────────
  addMessage(conversationId, role, content) {
    this.db.prepare(`
      INSERT INTO messages (conversation_id, role, content, created_at)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, role, content, Date.now());
  }

  getRecentMessages(conversationId, limit = 20) {
    const rows = this.db.prepare(`
      SELECT role, content, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(conversationId, limit);
    return rows.reverse();
  }

  clearConversation(conversationId) {
    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?')
      .run(conversationId);
  }

  // ─── Uzun süreli hafıza ─────────────────────────────────
  remember(key, value) {
    this.db.prepare(`
      INSERT INTO long_memory (key, value, created_at) VALUES (?, ?, ?)
    `).run(key.toLowerCase(), value, Date.now());
  }

  // Basit anahtar kelime tabanlı arama (vektör DB yerine pragmatik çözüm)
  searchMemory(query, limit = 5) {
    if (!query || query.trim().length < 2) return [];
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter(t => t.length > 2);

    if (tokens.length === 0) return [];

    const likeClauses = tokens.map(() => '(LOWER(key) LIKE ? OR LOWER(value) LIKE ?)').join(' OR ');
    const params = tokens.flatMap(t => [`%${t}%`, `%${t}%`]);

    return this.db.prepare(`
      SELECT key, value, created_at
      FROM long_memory
      WHERE ${likeClauses}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit);
  }

  listMemory() {
    return this.db.prepare('SELECT * FROM long_memory ORDER BY created_at DESC').all();
  }

  clearLongMemory() {
    this.db.exec('DELETE FROM long_memory');
  }

  exportAll() {
    return {
      conversations: this.listConversations(),
      messages: this.db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all(),
      long_memory: this.listMemory()
    };
  }
}

module.exports = MemoryManager;
