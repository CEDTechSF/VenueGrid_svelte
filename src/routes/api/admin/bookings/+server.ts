import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const db = getDb();
  const rows = db.prepare(`
    SELECT seats.id, seats.row, seats.col, seats.label, seats.layout_id,
           layouts.name as layout_name,
           users.id as user_id, users.name as user_name, users.email as user_email
    FROM seats
    INNER JOIN layouts ON seats.layout_id = layouts.id
    INNER JOIN users ON seats.booked_by = users.id
    ORDER BY layouts.name, seats.row, seats.col
  `).all();

  return json(rows);
};
