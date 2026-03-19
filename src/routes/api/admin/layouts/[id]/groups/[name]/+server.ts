import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb, withTransaction } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const layoutId = Number(params.id);
  const groupName = params.name;
  if (!Number.isInteger(layoutId) || !groupName) {
    return json({ error: 'Invalid params' }, { status: 400 });
  }

  const db = getDb();

  try {
    const found = withTransaction(() => {
      const group = db.prepare(
        'SELECT id FROM groups WHERE layout_id = ? AND name = ?'
      ).get(layoutId, groupName) as { id: number } | undefined;

      if (!group) return false;

      db.prepare('DELETE FROM seats WHERE group_id = ? AND layout_id = ?').run(group.id, layoutId);
      db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
      return true;
    });

    if (!found) return json({ error: 'Group not found' }, { status: 404 });
    return json({ ok: true });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Delete failed' }, { status: e.status ?? 500 });
  }
};
