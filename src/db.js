const Database = require('better-sqlite3');
const { dirname } = require('node:path');
const { mkdirSync } = require('node:fs');

function createDatabase(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      content_format TEXT NOT NULL CHECK (content_format IN ('markdown', 'html')),
      summary TEXT NOT NULL DEFAULT '',
      cover_image TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'scheduled')),
      share_token TEXT UNIQUE,
      published_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, tag_id)
    );
  `);

  // 如果已有数据库缺少 share_token 列，自动补充
  const columns = db.prepare("PRAGMA table_info(posts)").all();
  if (!columns.find(col => col.name === 'share_token')) {
    db.exec("ALTER TABLE posts ADD COLUMN share_token TEXT");
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_share_token ON posts(share_token)");
  }
  return db;
}

module.exports = { createDatabase };
