import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db.js';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const layoutId = params.id;
  const body = await request.json().catch(() => ({}));
  const { seatId } = body as { seatId?: number };
  const userId = locals.user?.id;

  if (!userId) return json({ error: 'Authentication required' }, { status: 401 });
  if (!seatId) return json({ error: 'seatId required' }, { status: 400 });

  const db = getDb();
  const seat = db
    .prepare('SELECT booked_by FROM seats WHERE id = ? AND layout_id = ?')
    .get(seatId, layoutId) as { booked_by: number | null } | undefined;

  if (!seat) return json({ error: 'Seat not found' }, { status: 404 });
  if (seat.booked_by !== userId)
    return json({ error: 'You can only unbook your own seats' }, { status: 403 });

  db.prepare('UPDATE seats SET booked_by = NULL WHERE id = ? AND layout_id = ?').run(
    seatId, layoutId
  );
  return json({ success: true, seatId });
};
