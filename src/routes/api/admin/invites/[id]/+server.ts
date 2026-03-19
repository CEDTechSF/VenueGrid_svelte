import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, { status: 400 });

  const db = getDb();
  const result = db.prepare('DELETE FROM invites WHERE id = ?').run(id);

  if (result.changes === 0) return json({ error: 'Not found' }, { status: 404 });
  return json({ ok: true });
};
