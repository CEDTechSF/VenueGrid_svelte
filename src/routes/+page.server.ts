import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb();
  const layouts = db.prepare(
    'SELECT id, name, rows, cols, max_per_user, created_at FROM layouts ORDER BY created_at DESC'
  ).all() as Array<{ id: number; name: string; rows: number; cols: number; max_per_user: number | null; created_at: string }>;

  return {
    user: locals.user ?? null,
    layouts
  };
};
