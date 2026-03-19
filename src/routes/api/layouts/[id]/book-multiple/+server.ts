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

const SEAT_QUERY = `
  SELECT seats.id, seats.row, seats.col, seats.label, seats.booked_by,
         users.name as booked_name,
         groups.id as grp_id, groups.name as grp_name, groups.base as grp_base,
         groups.num as grp_num, groups.prefix as grp_prefix, groups.data as grp_data
  FROM seats
  LEFT JOIN users ON seats.booked_by = users.id
  LEFT JOIN groups ON seats.group_id = groups.id
  WHERE seats.id IN
`;

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const layoutId = params.id;
  const body = await request.json().catch(() => ({}));
  const { seatIds } = body as { seatIds?: number[] };
  const userId = locals.user?.id;

  if (!userId) return json({ error: 'Authentication required' }, { status: 401 });
  if (!Array.isArray(seatIds) || seatIds.length === 0)
    return json({ error: 'seatIds array required' }, { status: 400 });

  const db = getDb();

  try {
    const results = withTransaction(() => {
      const bookResults: {
        seatId: number;
        status: string;
        booked_by?: number;
        seat?: unknown;
      }[] = [];
      const bookedIds: number[] = [];

      for (const seatId of seatIds) {
        const layout = db
          .prepare('SELECT max_per_user FROM layouts WHERE id = ?')
          .get(layoutId) as { max_per_user: number | null } | undefined;
        if (!layout) { bookResults.push({ seatId, status: 'not_found' }); continue; }

        if (layout.max_per_user !== null) {
          const { cnt } = db
            .prepare('SELECT COUNT(*) as cnt FROM seats WHERE layout_id = ? AND booked_by = ?')
            .get(layoutId, userId) as { cnt: number };
          if (cnt >= layout.max_per_user) {
            bookResults.push({ seatId, status: 'limit_reached' });
            continue;
          }
        }

        const changes = db
          .prepare('UPDATE seats SET booked_by = ? WHERE id = ? AND layout_id = ? AND booked_by IS NULL')
          .run(userId, seatId, layoutId).changes;

        if (changes === 0) {
          const existing = db
            .prepare('SELECT booked_by FROM seats WHERE id = ? AND layout_id = ?')
            .get(seatId, layoutId) as { booked_by: number | null } | undefined;
          if (!existing) bookResults.push({ seatId, status: 'not_found' });
          else bookResults.push({ seatId, status: 'already_booked', booked_by: existing.booked_by ?? undefined });
        } else {
          bookResults.push({ seatId, status: 'booked' });
          bookedIds.push(seatId);
        }
      }

      if (bookedIds.length > 0) {
        const placeholders = bookedIds.map(() => '?').join(',');
        const seatRows = db
          .prepare(`${SEAT_QUERY}(${placeholders})`)
          .all(...bookedIds) as Record<string, unknown>[];
        const seatMap = new Map(seatRows.map((s) => [s.id as number, mapSeatRow(s)]));
        return bookResults.map((r) =>
          r.status === 'booked' && seatMap.has(r.seatId)
            ? { ...r, seat: seatMap.get(r.seatId) }
            : r
        );
      }

      return bookResults;
    });
    return json({ results });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : 'Booking failed' }, { status: 500 });
  }
};
