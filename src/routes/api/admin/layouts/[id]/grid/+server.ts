import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireAdmin } from '$lib/server/auth';
import { getDb, withTransaction } from '$lib/server/db';
import { randomUUID } from 'crypto';

interface CellPayload {
  row: number;
  col: number;
  label: string;
  group: string | null;
  group_label?: string | null;
}

interface GroupMetaPayload {
  base?: string;
  num?: number;
  prefix?: string;
  data?: string;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
  const deny = requireAdmin(locals);
  if (deny) return deny;

  const id = Number(params.id);
  if (!Number.isInteger(id)) return json({ error: 'Invalid id' }, { status: 400 });

  const body = await request.json() as {
    rows: number;
    cols: number;
    cells: CellPayload[];
    groupMeta: Record<string, GroupMetaPayload>;
  };

  const { rows, cols, cells, groupMeta = {} } = body;

  if (
    !Number.isInteger(rows) || rows < 1 || rows > 500 ||
    !Number.isInteger(cols) || cols < 1 || cols > 500
  ) {
    return json({ error: 'rows/cols must be integers between 1 and 500' }, { status: 400 });
  }
  if (!Array.isArray(cells)) {
    return json({ error: 'cells must be an array' }, { status: 400 });
  }

  const db = getDb();

  const layout = db.prepare('SELECT id FROM layouts WHERE id = ?').get(id);
  if (!layout) return json({ error: 'Layout not found' }, { status: 404 });

  try {
    const nameMapping = withTransaction(() => {
      db.prepare('UPDATE layouts SET rows = ?, cols = ? WHERE id = ?').run(rows, cols, id);

      // Collect all unique group names from cells + groupMeta
      const allGroupNames = new Set<string>();
      for (const cell of cells) {
        if (cell.group) allGroupNames.add(cell.group);
      }
      for (const name of Object.keys(groupMeta)) {
        allGroupNames.add(name);
      }

      // Load existing groups for this layout
      const existingGroups = db.prepare(
        'SELECT id, name, base, num, prefix FROM groups WHERE layout_id = ?'
      ).all(id) as Array<{ id: number; name: string; base: string | null; num: number | null; prefix: string | null }>;

      const existingByName = new Map(existingGroups.map(g => [g.name, g]));

      // Maps old (temp/incoming) group name → final DB group name
      const nameMap: Record<string, string> = {};

      // Upsert groups
      const groupIdMap = new Map<string, number>(); // finalName → DB id

      for (const incomingName of allGroupNames) {
        const meta = groupMeta[incomingName] ?? {};
        let finalName = incomingName;

        // If it's a temp UUID name, generate a real permanent name
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(incomingName)) {
          // Generate unique group name based on base + num
          const base = meta.base ?? 'Group';
          let num = meta.num ?? 1;
          // Find an available name
          while (existingByName.has(`${base} ${num}`) && existingByName.get(`${base} ${num}`)!.name !== incomingName) {
            num++;
          }
          finalName = `${base} ${num}`;
        }

        const existing = existingByName.get(finalName);
        if (existing) {
          // Update meta if provided
          db.prepare(
            'UPDATE groups SET base = ?, num = ?, prefix = ?, data = ? WHERE id = ?'
          ).run(
            meta.base ?? existing.base,
            meta.num ?? existing.num,
            meta.prefix ?? existing.prefix,
            meta.data ?? null,
            existing.id
          );
          groupIdMap.set(incomingName, existing.id);
          groupIdMap.set(finalName, existing.id);
        } else {
          const result = db.prepare(
            'INSERT INTO groups (layout_id, name, base, num, prefix, data) VALUES (?, ?, ?, ?, ?, ?)'
          ).run(id, finalName, meta.base ?? null, meta.num ?? null, meta.prefix ?? null, meta.data ?? null);
          const newId = result.lastInsertRowid as number;
          groupIdMap.set(incomingName, newId);
          groupIdMap.set(finalName, newId);
          // Track in existingByName to avoid future duplicates in this same transaction
          existingByName.set(finalName, { id: newId, name: finalName, base: meta.base ?? null, num: meta.num ?? null, prefix: meta.prefix ?? null });
        }

        if (finalName !== incomingName) {
          nameMap[incomingName] = finalName;
        }
      }

      // Delete groups that are no longer referenced
      for (const existing of existingGroups) {
        if (!groupIdMap.has(existing.name)) {
          db.prepare('DELETE FROM groups WHERE id = ?').run(existing.id);
        }
      }

      // Replace all seats
      db.prepare('DELETE FROM seats WHERE layout_id = ?').run(id);

      const insertSeat = db.prepare(
        'INSERT INTO seats (layout_id, row, col, label, group_id, group_label) VALUES (?, ?, ?, ?, ?, ?)'
      );

      for (const cell of cells) {
        const groupId = cell.group ? (groupIdMap.get(cell.group) ?? null) : null;
        insertSeat.run(id, cell.row, cell.col, cell.label, groupId, cell.group_label ?? null);
      }

      return nameMap;
    });

    return json({ ok: true, nameMapping });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    return json({ error: e.message ?? 'Save failed' }, { status: e.status ?? 500 });
  }
};
