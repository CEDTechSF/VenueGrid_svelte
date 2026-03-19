import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, withTransaction } from '$lib/server/db.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const { token } = body as { token?: string };
  const userId = locals.user?.id;

  if (!token) return json({ error: 'token required' }, { status: 400 });
  if (!userId) return json({ error: 'Login required to claim invite' }, { status: 401 });

  const db = getDb();
  const invite = db
    .prepare('SELECT id, used_by, kind FROM invites WHERE token = ?')
    .get(token) as { id: number; used_by: number | null; kind: string } | undefined;

  if (!invite) return json({ error: 'Invite not found' }, { status: 404 });
  if (invite.used_by) return json({ error: 'Invite already used' }, { status: 409 });

  try {
    const result = withTransaction(() => {
      db.prepare("UPDATE invites SET used_by = ?, used_at = datetime('now') WHERE id = ?").run(
        userId, invite.id
      );
      if (invite.kind === 'admin') {
        db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(userId);
        return { success: true, promoted: true };
      }
      return { success: true, promoted: false };
    });
    return json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Failed to claim invite' }, { status: e.status ?? 500 });
  }
};
