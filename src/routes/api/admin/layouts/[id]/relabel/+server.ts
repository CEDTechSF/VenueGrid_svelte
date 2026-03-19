import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, { status: 400 });

  const { relabels } = await request.json() as { relabels: Array<{ seatId: number; label: string }> };
  if (!Array.isArray(relabels)) return json({ error: 'relabels array required' }, { status: 400 });

  const db = getDb();
  const layout = db.prepare('SELECT id FROM layouts WHERE id = ?').get(id);
  if (!layout) return json({ error: 'Layout not found' }, { status: 404 });

  const relabel = db.transaction(() => {
    const stmt = db.prepare('UPDATE seats SET label = ? WHERE id = ? AND layout_id = ?');
    for (const { seatId, label } of relabels) {
      if (typeof seatId !== 'number' || typeof label !== 'string') continue;
      stmt.run(label, seatId, id);
    }
  });

  relabel();
  return json({ ok: true });
};
