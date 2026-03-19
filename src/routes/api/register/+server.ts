import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db.js';
import { createSession } from '$lib/server/session.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!name) return json({ error: 'Name required' }, { status: 400 });
  if (!email) return json({ error: 'Email required' }, { status: 400 });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return json({ error: 'Email already registered' }, { status: 409 });

  const result = db.prepare('INSERT INTO users (name, email) VALUES (?, ?)').run(name, email);
  const userId = result.lastInsertRowid as number;
  createSession(userId, cookies);

  const user = db
    .prepare('SELECT id, name, email, is_admin FROM users WHERE id = ?')
    .get(userId);
  return json(user);
};
