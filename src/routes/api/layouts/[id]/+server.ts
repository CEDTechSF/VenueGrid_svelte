import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db.js';

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

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  const db = getDb();

  const layout = db.prepare('SELECT id, name, rows, cols FROM layouts WHERE id = ?').get(id);
  if (!layout) return json({ error: 'Layout not found' }, { status: 404 });

  const seats = db.prepare(`
    SELECT seats.id, seats.row, seats.col, seats.label, seats.booked_by,
           users.name as booked_name,
           groups.id as grp_id, groups.name as grp_name, groups.base as grp_base,
           groups.num as grp_num, groups.prefix as grp_prefix, groups.data as grp_data
    FROM seats
    LEFT JOIN users ON seats.booked_by = users.id
    LEFT JOIN groups ON seats.group_id = groups.id
    WHERE seats.layout_id = ?
    ORDER BY seats.row, seats.col
  `).all(id) as Record<string, unknown>[];

  return json({ layout, seats: seats.map(mapSeatRow) });
};
