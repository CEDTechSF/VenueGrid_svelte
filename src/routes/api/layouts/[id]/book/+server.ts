import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, withTransaction } from '$lib/server/db.js';

function mapSeatRow(s: Record<string, unknown>) {
  let data: unknown = null;
  try { data = s.grp_data ? JSON.parse(s.grp_data as string) : null; } catch { data = null; }
  return {
    id: s.id, row: s.row, col: s.col, label: s.label,
    booked_by: s.booked_by, booked_name: s.booked_name ?? null,
    group: s.grp_id ? {
      id: s.grp_id, name: s.grp_name, base: s.grp_base ?? null,
      num: typeof s.grp_num === 'number' ? s.grp_num : (s.grp_num ? Number(s.grp_num) : null),
      prefix: s.grp_prefix ?? null, data
    } : null
  };
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const layoutId = params.id;
  const body = await request.json().catch(() => ({}));
  const { seatId } = body as { seatId?: number };
  const userId = locals.user?.id;

  if (!userId) return json({ error: 'Authentication required' }, { status: 401 });
  if (!seatId) return json({ error: 'seatId required' }, { status: 400 });

  const db = getDb();

  try {
    const seatRow = withTransaction(() => {
      const layout = db
        .prepare('SELECT max_per_user FROM layouts WHERE id = ?')
        .get(layoutId) as { max_per_user: number | null } | undefined;
      if (!layout) throw Object.assign(new Error('Layout not found'), { status: 404 });

      if (layout.max_per_user !== null) {
        const { cnt } = db
          .prepare('SELECT COUNT(*) as cnt FROM seats WHERE layout_id = ? AND booked_by = ?')
          .get(layoutId, userId) as { cnt: number };
        if (cnt >= layout.max_per_user)
          throw Object.assign(new Error('Per-user seat limit reached'), { status: 403 });
      }

      const seat = db
        .prepare('SELECT booked_by FROM seats WHERE id = ? AND layout_id = ?')
        .get(seatId, layoutId) as { booked_by: number | null } | undefined;
      if (!seat) throw Object.assign(new Error('Seat not found'), { status: 404 });
      if (seat.booked_by !== null)
        throw Object.assign(new Error('Seat already booked'), { status: 409 });

      db.prepare('UPDATE seats SET booked_by = ? WHERE id = ? AND layout_id = ?').run(
        userId, seatId, layoutId
      );

      return db.prepare(`
        SELECT seats.id, seats.row, seats.col, seats.label, seats.booked_by,
               users.name as booked_name,
               groups.id as grp_id, groups.name as grp_name, groups.base as grp_base,
               groups.num as grp_num, groups.prefix as grp_prefix, groups.data as grp_data
        FROM seats
        LEFT JOIN users ON seats.booked_by = users.id
        LEFT JOIN groups ON seats.group_id = groups.id
        WHERE seats.id = ?
      `).get(seatId);
    }) as Record<string, unknown>;
    return json({ success: true, seat: mapSeatRow(seatRow) });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Booking failed' }, { status: e.status ?? 500 });
  }
};
