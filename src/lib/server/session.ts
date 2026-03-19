import { randomBytes } from 'crypto';
import type { Cookies } from '@sveltejs/kit';
import { getDb } from './db.js';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const COOKIE_NAME = 'sid';

export function createSession(userId: number, cookies: Cookies): string {
  const db = getDb();
  const id = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + SESSION_DURATION_MS;
  db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(
    id,
    userId,
    expiresAt
  );
  cookies.set(COOKIE_NAME, id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DURATION_MS / 1000,
    path: '/'
  });
  return id;
}

export function destroySession(sessionId: string, cookies: Cookies): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
  cookies.delete(COOKIE_NAME, { path: '/' });
}

export function cleanupExpiredSessions(): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}
