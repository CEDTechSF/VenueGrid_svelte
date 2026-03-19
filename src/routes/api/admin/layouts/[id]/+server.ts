import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb, withTransaction } from '$lib/server/db';

export const GET: RequestHandler = async ({ params, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, { status: 400 });

  const db = getDb();
  const layout = db.prepare(
    'SELECT id, name, rows, cols, max_per_user, created_at FROM layouts WHERE id = ?'
  ).get(id) as { id: number; name: string; rows: number; cols: number; max_per_user: number | null; created_at: string } | undefined;

  if (!layout) return json({ error: 'Not found' }, { status: 404 });

  const seats = db.prepare(`
    SELECT seats.id, seats.row, seats.col, seats.label, seats.booked_by,
           seats.group_id, seats.group_label,
           groups.name as grp_name, groups.base as grp_base,
           groups.num as grp_num, groups.prefix as grp_prefix, groups.data as grp_data,
           users.name as booked_name
    FROM seats
    LEFT JOIN groups ON seats.group_id = groups.id
    LEFT JOIN users ON seats.booked_by = users.id
    WHERE seats.layout_id = ?
    ORDER BY seats.row, seats.col
  `).all(id) as Array<Record<string, unknown>>;

  const groups = db.prepare(
    'SELECT id, name, base, num, prefix, data FROM groups WHERE layout_id = ? ORDER BY num'
  ).all(id) as Array<Record<string, unknown>>;

  return json({ layout, seats, groups });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, { status: 400 });

  const { name, max_per_user } = await request.json() as { name?: string; max_per_user?: number | null };
  if (!name || typeof name !== 'string' || !name.trim()) {
    return json({ error: 'name required' }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare(
    'UPDATE layouts SET name = ?, max_per_user = ? WHERE id = ?'
  ).run(name.trim(), max_per_user ?? null, id);

  if (result.changes === 0) return json({ error: 'Not found' }, { status: 404 });
  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, { status: 400 });

  const db = getDb();
  
  try {
    withTransaction(() => {
      db.prepare('DELETE FROM seats WHERE layout_id = ?').run(id);
      db.prepare('DELETE FROM groups WHERE layout_id = ?').run(id);
      const r = db.prepare('DELETE FROM layouts WHERE id = ?').run(id);
      if (r.changes === 0) throw Object.assign(new Error('Not found'), { status: 404 });
    });
    return json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Delete failed' }, { status: e.status ?? 500 });
  }
};
