// Shared TypeScript types for VenueGrid v2

export interface User {
  id: number;
  name: string;
  email: string;
  is_admin: number; // 0 or 1
}

export interface Group {
  id: number;
  name: string;
  base: string | null;
  num: number | null;
  prefix: string | null;
  data: Record<string, unknown> | null;
}

export interface Seat {
  id: number;
  layout_id?: number;
  row: number;
  col: number;
  label: string | null;
  booked_by: number | null;
  booked_name?: string | null;
  group: Group | null;
}

export interface Layout {
  id: number;
  name: string;
  rows: number;
  cols: number;
  max_per_user: number | null;
}

export interface EditorCellGroup {
  id?: number;
  name: string;
  base?: string | null;
  num?: number | null;
  prefix?: string | null;
  data?: Record<string, unknown> | null;
}

export interface EditorCell {
  label: string | null;
  group: EditorCellGroup | null;
}

export interface GroupMeta {
  id?: number;
  base?: string;
  num?: number;
  prefix?: string;
  data?: Record<string, unknown> | null;
  temp?: boolean;
}

export interface PendingSelection {
  aR: number;
  bR: number;
  aC: number;
  bC: number;
  groupName?: string | null;
  memberIndices?: number[];
  single?: boolean;
  opts?: { allowAutoName?: boolean };
}

export interface EditorState {
  rows: number;
  cols: number;
  cells: (EditorCell | null)[];
  groupMeta: Record<string, GroupMeta>;
  history: (EditorCell | null)[][];
  histIndex: number;
  hasUnsavedRename: boolean;
  dragging: boolean;
  dragStart: number | null;
  dragEnd: number | null;
  previewOn: boolean;
  pendingSelection: PendingSelection | null;
}

export interface NameMapping {
  [origName: string]: { name: string; id: number };
}

export interface BookingResult {
  seatId: number;
  status: 'booked' | 'already_booked' | 'not_found' | 'error' | 'limit_reached';
  seat?: Seat;
  booked_by?: number;
  error?: string;
}

export interface Invite {
  id: number;
  token: string;
  created_by: number | null;
  used_by: number | null;
  used_at: string | null;
  created_at: string;
  layout_id: number | null;
  layout_name: string | null;
  kind: string;
}

export interface AdminBooking {
  seat_id: number;
  layout_id: number;
  layout_name: string;
  row: number;
  col: number;
  label: string | null;
  group_label: string | null;
  booked_by: number;
  booked_name: string;
}
