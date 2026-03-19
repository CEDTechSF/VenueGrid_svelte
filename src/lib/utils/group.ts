import type { EditorCellGroup, GroupMeta, EditorState } from '$lib/types.js';

const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getGroupName(g: string | EditorCellGroup | null | undefined): string | null {
  if (!g) return null;
  if (typeof g === 'string') return g;
  return g.name ? String(g.name) : null;
}

export function groupColor(name: string): string {
  if (!name) return '#999';
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) % 360;
  }
  return `hsl(${h},60%,40%)`;
}

export function nextGroupNumber(base: string, editor: EditorState): number {
  const used = new Set<number>();
  const baseLower = base.toLowerCase();
  for (const [, gm] of Object.entries(editor.groupMeta)) {
    if (gm.num && gm.base && gm.base.toLowerCase() === baseLower) {
      used.add(gm.num);
    }
  }
  let i = 1;
  while (used.has(i)) i++;
  return i;
}

/** Extract a canonical group name from any supported input type. */
export function extractGroupName(g: unknown): string | null {
  if (!g) return null;
  if (typeof g === 'string') return g;
  if (typeof g === 'object' && g !== null) {
    const obj = g as Record<string, unknown>;
    if (obj.name) return String(obj.name);
    if (typeof obj.id === 'number') return String(obj.id);
    if (obj.base) return String(obj.base) + (typeof obj.num === 'number' ? obj.num : '');
  }
  return null;
}

export function isTempName(name: string, gm?: GroupMeta): boolean {
  if (!name) return false;
  if (String(name).startsWith('Table_auto_')) return true;
  if (UUID_LIKE_RE.test(String(name))) return true;
  if (gm?.temp === true) return true;
  return false;
}

/** Convert an internal group key to a user-facing label. */
export function getGroupDisplayName(name: string, groupMeta: Record<string, GroupMeta>): string {
  const gm = groupMeta[name];
  if (gm?.base && gm?.num && gm.base.toLowerCase() === 'table') return `${gm.base} ${gm.num}`;
  if (gm?.base) return gm.base;
  if (!isTempName(name, gm)) return name;
  return 'Table';
}

/** Resolve a display label or internal key to the exact key in groupMeta. */
export function resolveInternalGroupKey(
  name: string,
  groupMeta: Record<string, GroupMeta>
): string {
  if (!name) return name;
  // Exact key match
  if (Object.prototype.hasOwnProperty.call(groupMeta, name)) return name;

  const normalize = (s: string) => String(s).replace(/\s+/g, '').toLowerCase();
  const target = normalize(name);
  const keys = Object.keys(groupMeta);

  // Normalized exact key match (handles case/whitespace in key names)
  for (const k of keys) {
    if (normalize(k) === target) return k;
  }

  // Match by base+num (allow optional space)
  for (const k of keys) {
    const gm = groupMeta[k] ?? {};
    const base = gm.base ?? k;
    const num = gm.num ?? null;
    const cand1 = String(base) + (num !== null ? String(num) : '');
    const cand2 = String(base) + ' ' + (num !== null ? String(num) : '');
    if (normalize(cand1) === target || normalize(cand2) === target) return k;
  }

  return name;
}
