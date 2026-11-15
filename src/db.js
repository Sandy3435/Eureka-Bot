const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const dbPath = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  jid TEXT PRIMARY KEY,
  phone TEXT,
  name TEXT,
  state TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  jid TEXT NOT NULL,
  direction TEXT NOT NULL, -- in | out
  text TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

const now = () => Date.now();

const contacts = {
  get(jid) {
    return db.prepare('SELECT * FROM contacts WHERE jid = ?').get(jid);
  },
  upsert(jid, patch = {}) {
    const existing = this.get(jid);
    if (existing) {
      const fields = [];
      const vals = [];
      for (const [k, v] of Object.entries(patch)) {
        fields.push(`${k} = ?`);
        vals.push(v);
      }
      fields.push('updated_at = ?');
      vals.push(now());
      vals.push(jid);
      db.prepare(`UPDATE contacts SET ${fields.join(', ')} WHERE jid = ?`).run(...vals);
      return this.get(jid);
    }
    const phone = jid.split('@')[0];
    db.prepare(
      'INSERT INTO contacts (jid, phone, name, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(jid, phone, patch.name || null, patch.state || 'new', now(), now());
    return this.get(jid);
  },
  setState(jid, state) {
    return this.upsert(jid, { state });
  },
};

const messages = {
  seen(id) {
    return !!db.prepare('SELECT 1 FROM messages WHERE id = ?').get(id);
  },
  log(jid, direction, text, id) {
    const mid = id || `${direction}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      db.prepare('INSERT INTO messages (id, jid, direction, text, created_at) VALUES (?, ?, ?, ?, ?)').run(
        mid, jid, direction, text, now()
      );
    } catch (e) {
      // ignore duplicate
    }
    return mid;
  },
  recent(jid, limit = 8) {
    return db
      .prepare('SELECT direction, text, created_at FROM messages WHERE jid = ? ORDER BY created_at DESC LIMIT ?')
      .all(jid, limit)
      .reverse();
  },
};

const kv = {
  get(key) {
    const r = db.prepare('SELECT value FROM kv WHERE key = ?').get(key);
    return r ? r.value : null;
  },
  set(key, value) {
    db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
      key, String(value)
    );
  },
};

module.exports = { db, contacts, messages, kv, now };