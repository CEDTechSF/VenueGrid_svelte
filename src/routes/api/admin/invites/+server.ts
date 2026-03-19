import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { randomBytes } from 'crypto';

export const GET: RequestHandler = async ({ locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const db = getDb();
  const invites = db.prepare(
    'SELECT id, token, kind, (used_by IS NOT NULL) as used, created_at FROM invites ORDER BY created_at DESC'
  ).all();

  return json(invites);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const { kind } = await request.json() as { kind?: string };
  const inviteKind = kind === 'admin' ? 'admin' : 'user';

  const token = randomBytes(8).toString('hex');
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO invites (token, kind) VALUES (?, ?)"
  ).run(token, inviteKind);

  const invite = db.prepare('SELECT id, token, kind, (used_by IS NOT NULL) as used, created_at FROM invites WHERE id = ?').get(result.lastInsertRowid);
  return json(invite, { status: 201 });
};
