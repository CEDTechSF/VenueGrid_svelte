import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db.js';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { userId, secret } = body as { userId?: number; secret?: string };
  const adminSecret = process.env.ADMIN_SECRET;

  if (!adminSecret) return json({ error: 'Admin secret not configured' }, { status: 403 });
  if (!secret || secret !== adminSecret)
    return json({ error: 'Invalid admin secret' }, { status: 403 });
  if (!userId) return json({ error: 'userId required' }, { status: 400 });

  const db = getDb();
  const result = db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
  if (result.changes === 0) return json({ error: 'User not found' }, { status: 404 });
  return json({ success: true });
};
