import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import fs from 'fs';
import paths, { ensureDataDirs } from './config/paths.js';

if (fs.existsSync(paths.envFile)) {
  dotenv.config({ path: paths.envFile });
} else {
  dotenv.config();
}

ensureDataDirs();

const dbPath = paths.databaseFile;
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'processing',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    page_num INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    chunk_id UNINDEXED,
    document_id UNINDEXED
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    provider TEXT CHECK(provider IN ('local', 'groq')) NOT NULL DEFAULT 'local',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    conversation_id TEXT NOT NULL DEFAULT 'default',
    role TEXT CHECK(role IN ('user', 'assistant')) NOT NULL,
    content TEXT NOT NULL,
    model_used TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
  );
`);

// Ensure default guest user exists with ID 9999
try {
  const guestUser = db.prepare('SELECT id FROM users WHERE id = ?').get(9999);
  if (!guestUser) {
    db.prepare('INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)')
      .run(9999, 'guest', '$2a$10$dummyhashguestaccountplaceholderstring');
  }
} catch (e) {
  console.error('Failed to seed guest user:', e.message);
}


// Migration for existing databases: add conversation_id column to messages table if not exists
try {
  db.exec("ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'default'");
} catch (e) {
  // Column already exists, ignore
}

// Migration for existing databases: add error_message column to documents table if not exists
try {
  db.exec("ALTER TABLE documents ADD COLUMN error_message TEXT");
} catch (e) {
  // Column already exists, ignore
}

// Create index after column is guaranteed to exist
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id);
`);

export default db;
