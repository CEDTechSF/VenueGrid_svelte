import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const db = getDb();
  const layouts = db.prepare(
    'SELECT id, name, rows, cols, max_per_user, created_at FROM layouts ORDER BY created_at DESC'
  ).all();

  return json(layouts);
};
