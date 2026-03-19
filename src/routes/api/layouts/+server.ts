import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, withTransaction } from '$lib/server/db.js';
import { requireAdmin } from '$lib/server/auth.js';
import { extractGroupName } from '$lib/utils/group.js';
import type { EditorCell } from '$lib/types.js';

// GET /api/layouts — list public layouts
export const GET: RequestHandler = async () => {
  const db = getDb();
  const layouts = db.prepare('SELECT id, name, rows, cols FROM layouts').all();
  return json(layouts);
};

// POST /api/layouts — create layout (admin only)
export const POST: RequestHandler = async ({ request, locals }) => {
  const adminError = requireAdmin(locals);
  if (adminError) return adminError;

  const body = await request.json().catch(() => ({}));
  const { name, rows, cols, labels, maxPerUser } = body as {
    name?: string;
    rows?: number;
    cols?: number;
    labels?: (EditorCell | string | null)[];
    maxPerUser?: number | null;
  };

  if (!name || !rows || !cols)
    return json({ error: 'name, rows and cols required' }, { status: 400 });

  const db = getDb();

  try {
    const id = withTransaction(() => {
      const result = db
        .prepare('INSERT INTO layouts (name, rows, cols, max_per_user) VALUES (?, ?, ?, ?)')
        .run(name, rows, cols, maxPerUser ?? null);
      const layoutId = result.lastInsertRowid as number;

      if (Array.isArray(labels) && labels.length > 0) {
        if (labels.length !== rows * cols)
          throw new Error(`labels length ${labels.length} does not match rows*cols (${rows * cols})`);

        const groupNames = new Set<string>();
        for (const v of labels) {
          if (v && typeof v === 'object') {
            const gn = extractGroupName((v as EditorCell).group);
            if (gn) groupNames.add(gn);
          }
        }

        const groupMap: Record<string, number> = {};
        for (const gName of groupNames) {
          const r = db
            .prepare('INSERT INTO groups (layout_id, name) VALUES (?, ?)')
            .run(layoutId, gName);
          groupMap[gName] = r.lastInsertRowid as number;
        }

        const insertSeat = db.prepare(
          'INSERT INTO seats (layout_id, row, col, label, group_label, group_id) VALUES (?, ?, ?, ?, ?, ?)'
        );
        let seatNum = 1;
        for (let r = 1; r <= rows; r++) {
          for (let c = 1; c <= cols; c++) {
            const idx = (r - 1) * cols + (c - 1);
            const v = labels[idx];
            let label: string | null = null;
            let group: string | null = null;
            let gid: number | null = null;
            if (v && typeof v === 'object') {
              label = (v as EditorCell).label ?? String(seatNum);
              const gn = extractGroupName((v as EditorCell).group);
              if (gn) { group = gn; gid = groupMap[gn] ?? null; }
            } else if (v) {
              label = String(v);
            } else {
              label = String(seatNum);
            }
            insertSeat.run(layoutId, r, c, label, group, gid);
            seatNum++;
          }
        }
      }

      return layoutId;
    });

    return json({ id, name, rows, cols });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : 'Database error' }, { status: 500 });
  }
};
