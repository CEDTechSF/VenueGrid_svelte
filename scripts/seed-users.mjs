import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = value;
  }
}

function resolveDbFile(cwd) {
  loadDotEnv(join(cwd, '.env'));
  const fromEnv = process.env.VENUEGRID_DB_FILE ?? process.env.DB_FILE ?? 'data/venuegrid.db';
  return isAbsolute(fromEnv) ? fromEnv : join(cwd, fromEnv);
}

function validateSeedUsers(value) {
  if (!Array.isArray(value)) {
    throw new Error('users seed file must contain a JSON array');
  }

  return value.map((u, i) => {
    const name = typeof u?.name === 'string' ? u.name.trim() : '';
    const email = typeof u?.email === 'string' ? u.email.trim().toLowerCase() : '';
    const is_admin = Boolean(u?.is_admin);

    if (!name) throw new Error(`seed user at index ${i} is missing a valid name`);
    if (!email) throw new Error(`seed user at index ${i} is missing a valid email`);

    return { name, email, is_admin };
  });
}

function ensureUsersTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      is_admin INTEGER DEFAULT 0
    );
  `);
}

function main() {
  if (process.env.NODE_ENV === 'production' && process.env.FORCE_SEED_USERS !== 'true') {
    throw new Error('Refusing to seed users in production. Set FORCE_SEED_USERS=true to override.');
  }

  const cwd = process.cwd();
  const seedArg = process.argv[2] || 'users.seed.json';
  const seedPath = isAbsolute(seedArg) ? seedArg : join(cwd, seedArg);

  if (!existsSync(seedPath)) {
    throw new Error(`Seed file not found: ${seedPath}`);
  }

  const dbFile = resolveDbFile(cwd);
  mkdirSync(dirname(dbFile), { recursive: true });

  const raw = readFileSync(seedPath, 'utf8');
  const users = validateSeedUsers(JSON.parse(raw));

  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA foreign_keys = ON');
  ensureUsersTable(db);

  const findByEmail = db.prepare('SELECT id FROM users WHERE email = ?');
  const insertUser = db.prepare('INSERT INTO users (name, email, is_admin) VALUES (?, ?, ?)');
  const updateUser = db.prepare('UPDATE users SET name = ?, is_admin = ? WHERE email = ?');

  let inserted = 0;
  let updated = 0;

  db.exec('BEGIN');
  try {
    for (const user of users) {
      const existing = findByEmail.get(user.email);
      if (existing) {
        updateUser.run(user.name, user.is_admin ? 1 : 0, user.email);
        updated++;
      } else {
        insertUser.run(user.name, user.email, user.is_admin ? 1 : 0);
        inserted++;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  console.log(`Seed complete. Inserted: ${inserted}, Updated: ${updated}, Total input: ${users.length}`);
  console.log(`Database: ${dbFile}`);
}

main();
