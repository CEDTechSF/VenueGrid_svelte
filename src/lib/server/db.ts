import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'fs';
import { join } from 'path';

const DB_FILE =
  process.env.VENUEGRID_DB_FILE ??
  process.env.DB_FILE ??
  join(process.cwd(), 'data', 'venuegrid.db');

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    mkdirSync(join(process.cwd(), 'data'), { recursive: true });
    _db = new DatabaseSync(DB_FILE);
    _db.exec('PRAGMA journal_mode = WAL');
    _db.exec('PRAGMA foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      is_admin INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS invites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      created_by INTEGER,
      used_by INTEGER,
      layout_id INTEGER,
      used_at TEXT,
      kind TEXT DEFAULT 'booking',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(created_by) REFERENCES users(id),
      FOREIGN KEY(used_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS layouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rows INTEGER NOT NULL,
      cols INTEGER NOT NULL,
      max_per_user INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      base TEXT,
      num INTEGER,
      prefix TEXT,
      data TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(layout_id) REFERENCES layouts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS seats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      layout_id INTEGER NOT NULL,
      row INTEGER NOT NULL,
      col INTEGER NOT NULL,
      label TEXT,
      booked_by INTEGER,
      group_id INTEGER,
      group_label TEXT,
      FOREIGN KEY(layout_id) REFERENCES layouts(id),
      FOREIGN KEY(booked_by) REFERENCES users(id),
      FOREIGN KEY(group_id) REFERENCES groups(id) ON DELETE SET NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_layout_name ON groups(layout_id, name);
    CREATE INDEX IF NOT EXISTS idx_groups_layout_base_num ON groups(layout_id, base, num);
    CREATE INDEX IF NOT EXISTS idx_seats_layout ON seats(layout_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
  `);

  // Migrate existing DBs: add columns that may be missing
  runMigrations(db);
}

function runMigrations(db: DatabaseSync): void {
  // Add seats.group_label if missing (migration from legacy schema)
  try {
    db.prepare('SELECT group_label FROM seats LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE seats ADD COLUMN group_label TEXT');
  }
  // Add invites.kind if missing
  try {
    db.prepare('SELECT kind FROM invites LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE invites ADD COLUMN kind TEXT DEFAULT 'booking'");
  }
  // Add layouts.created_at if missing
  try {
    db.prepare('SELECT created_at FROM layouts LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE layouts ADD COLUMN created_at TEXT DEFAULT (datetime('now'))");
  }
}

/**
 * Execute a function within a database transaction.
 * Automatically handles BEGIN/COMMIT/ROLLBACK.
 */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
