import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db.js';
import { createSession } from '$lib/server/session.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!email) return json({ error: 'Email required' }, { status: 400 });

  const db = getDb();
  const user = db
    .prepare('SELECT id, name, email, is_admin FROM users WHERE email = ?')
    .get(email);
  if (!user) return json({ error: 'User not found' }, { status: 404 });

  createSession((user as { id: number }).id, cookies);
  return json(user);
};
