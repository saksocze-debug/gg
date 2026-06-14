// notesManager.js — Profesyonel not sistemi
class NotesManager {
  constructor(db) {
    this.db = db;
    this.init();
  }

  init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL,
        category   TEXT NOT NULL DEFAULT 'Genel',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);
    `);
  }

  create({ title, content, category = 'Genel' }) {
    if (!title || !content) {
      throw new Error('Başlık ve içerik zorunludur.');
    }
    const now = Date.now();
    const r = this.db.prepare(`
      INSERT INTO notes (title, content, category, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(title, content, category, now, now);
    return this.get(r.lastInsertRowid);
  }

  get(id) {
    return this.db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  }

  update(id, fields = {}) {
    const note = this.get(id);
    if (!note) return null;

    const next = {
      title: fields.title ?? note.title,
      content: fields.content ?? note.content,
      category: fields.category ?? note.category
    };
    this.db.prepare(`
      UPDATE notes SET title = ?, content = ?, category = ?, updated_at = ?
      WHERE id = ?
    `).run(next.title, next.content, next.category, Date.now(), id);
    return this.get(id);
  }

  delete(id) {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    return { deleted: id };
  }

  list({ category, search } = {}) {
    let sql = 'SELECT * FROM notes WHERE 1=1';
    const params = [];

    if (category && category !== 'Tümü') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)';
      const q = `%${search.toLowerCase()}%`;
      params.push(q, q);
    }
    sql += ' ORDER BY updated_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  categories() {
    const rows = this.db.prepare(
      'SELECT DISTINCT category FROM notes ORDER BY category'
    ).all();
    return rows.map(r => r.category);
  }
}

module.exports = NotesManager;
