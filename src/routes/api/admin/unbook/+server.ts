import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const { seatId } = await request.json();
  if (!seatId || typeof seatId !== 'number') {
    return json({ error: 'seatId required' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'UPDATE seats SET booked_by = NULL WHERE id = ?'
  ).run(seatId);

  if (result.changes === 0) {
    return json({ error: 'Seat not found' }, { status: 404 });
  }

  return json({ ok: true });
};
