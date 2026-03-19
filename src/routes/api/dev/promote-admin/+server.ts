import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
  if (process.env.NODE_ENV === 'production') {
    return json({ error: 'Not available in production' }, { status: 403 });
  }

  const { email } = await request.json() as { email?: string };
  if (!email || typeof email !== 'string') {
    return json({ error: 'email required' }, { status: 400 });
  }

  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim()) as { id: number } | undefined;
  if (!user) return json({ error: 'User not found' }, { status: 404 });

  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
  return json({ ok: true, userId: user.id });
};
