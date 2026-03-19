import { writable, get } from 'svelte/store';
import type { EditorCell, EditorState, GroupMeta, NameMapping, PendingSelection } from '$lib/types.js';
import { getGroupName, isTempName, nextGroupNumber } from '$lib/utils/group.js';

const INITIAL_STATE: EditorState = {
  rows: 0,
  cols: 0,
  cells: [],
  groupMeta: {},
  history: [],
  histIndex: -1,
  hasUnsavedRename: false,
  dragging: false,
  dragStart: null,
  dragEnd: null,
  previewOn: true,
  pendingSelection: null
};

function createTempGroupKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `temp-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function createEditorStore() {
  const { subscribe, set, update } = writable<EditorState>(INITIAL_STATE);

  return {
    subscribe,
    set,
    update,

    /** Initialise editor with data loaded from the server. */
    init(
      rows: number,
      cols: number,
      cells: (EditorCell | null)[],
      groupMeta: Record<string, GroupMeta>
    ) {
      const initialCells = [...cells];
      set({
        ...INITIAL_STATE,
        rows,
        cols,
        cells: initialCells,
        groupMeta,
        history: [initialCells],
        histIndex: 0
      });
    },

    /** Push a new cells snapshot onto the undo history. */
    pushHistory(cells: (EditorCell | null)[]) {
      update((s) => {
        const newCells = [...cells];
        const newHistory = s.history.slice(0, s.histIndex + 1);
        newHistory.push(newCells);
        return { ...s, cells: newCells, history: newHistory, histIndex: newHistory.length - 1 };
      });
    },

    undo() {
      update((s) => {
        if (s.histIndex <= 0) return s;
        const idx = s.histIndex - 1;
        return { ...s, histIndex: idx, cells: [...s.history[idx]] };
      });
    },

    redo() {
      update((s) => {
        if (s.histIndex >= s.history.length - 1) return s;
        const idx = s.histIndex + 1;
        return { ...s, histIndex: idx, cells: [...s.history[idx]] };
      });
    },

    startDrag(idx: number) {
      update((s) => ({ ...s, dragging: true, dragStart: idx, dragEnd: idx }));
    },

    updateDrag(idx: number) {
      update((s) => (s.dragging ? { ...s, dragEnd: idx } : s));
    },

    /** End a drag: clear selection or assign temp group. Returns selected bounds. */
    endDrag(): { aR: number; bR: number; aC: number; bC: number } | null {
      const s = get({ subscribe });
      if (!s.dragging || s.dragStart === null || s.dragEnd === null) {
        update((st) => ({ ...st, dragging: false }));
        return null;
      }

      update((st) => ({ ...st, dragging: false }));

      const { cols } = s;
      const startR = Math.floor(s.dragStart / cols);
      const startC = s.dragStart % cols;
      const endR = Math.floor(s.dragEnd / cols);
      const endC = s.dragEnd % cols;
      const aR = Math.min(startR, endR);
      const bR = Math.max(startR, endR);
      const aC = Math.min(startC, endC);
      const bC = Math.max(startC, endC);

      // Single-cell drag — handled by onClick instead
      if (s.dragStart === s.dragEnd) return null;

      // If all cells in selection are already filled, clear them (toggle off)
      let allFilled = true;
      for (let r = aR; r <= bR && allFilled; r++) {
        for (let c = aC; c <= bC && allFilled; c++) {
          if (!s.cells[r * cols + c]?.label) allFilled = false;
        }
      }

      if (allFilled) {
        const newCells = [...s.cells];
        for (let r = aR; r <= bR; r++) {
          for (let c = aC; c <= bC; c++) {
            newCells[r * cols + c] = null;
          }
        }
        update((st) => ({
          ...st,
          cells: newCells,
          history: [...st.history.slice(0, st.histIndex + 1), [...newCells]],
          histIndex: st.histIndex + 1
        }));
        return null;
      }

      // Assign new temp group to selection
      const nextNum = nextGroupNumber('Table', s);
      const grpKey = createTempGroupKey();
      const newCells = [...s.cells];
      let counter = 1;
      for (let r = aR; r <= bR; r++) {
        for (let c = aC; c <= bC; c++) {
          newCells[r * cols + c] = { label: String(counter++), group: { name: grpKey } };
        }
      }

      update((st) => {
        const newHistory = [...st.history.slice(0, st.histIndex + 1), [...newCells]];
        return {
          ...st,
          cells: newCells,
          history: newHistory,
          histIndex: newHistory.length - 1,
          groupMeta: { ...st.groupMeta, [grpKey]: { base: 'Table', num: nextNum } },
          pendingSelection: { aR, bR, aC, bC, groupName: grpKey, opts: { allowAutoName: true } }
        };
      });
      return { aR, bR, aC, bC };
    },

    openSingleCell(idx: number) {
      update((s) => {
        const r = Math.floor(idx / s.cols);
        const c = idx % s.cols;
        return {
          ...s,
          pendingSelection: {
            aR: r, bR: r, aC: c, bC: c,
            single: true,
            groupName: getGroupName(s.cells[idx]?.group ?? null),
            opts: { allowAutoName: true }
          }
        };
      });
    },

    closePendingSelection() {
      update((s) => ({ ...s, pendingSelection: null }));
    },

    /** Apply group editor settings to the pending selection. Returns error string or null on success. */
    applyGroupEditor(
      groupInternalName: string,
      displayName: string,
      prefix: string,
      startNum: number
    ): string | null {
      const s = get({ subscribe });
      const ps = s.pendingSelection;
      if (!ps) return null;

      const displayBase = displayName.trim() || 'Table';

      let grpKey = groupInternalName;
      if (!grpKey && ps.opts?.allowAutoName) {
        const nextNum = nextGroupNumber(displayBase, s);
        grpKey = createTempGroupKey();
        update((st) => ({
          ...st,
          groupMeta: { ...st.groupMeta, [grpKey]: { base: displayBase, num: nextNum } }
        }));
      }

      const currentState = get({ subscribe });
      const existingMeta = grpKey ? (currentState.groupMeta[grpKey] ?? {}) : {};
      const { aR, bR, aC, bC } = ps;

      // Resolve target indices
      let targetIndices: number[];
      if (ps.memberIndices?.length) {
        targetIndices = [...ps.memberIndices].sort((a, b) => a - b);
      } else {
        targetIndices = [];
        for (let r = aR; r <= bR; r++) {
          for (let c = aC; c <= bC; c++) {
            targetIndices.push(r * currentState.cols + c);
          }
        }
      }

      // Build label→indices map
      const assigned: Record<string, number[]> = {};
      targetIndices.forEach((idx, ti) => {
        const lab = prefix ? `${prefix}${startNum + ti}` : String(startNum + ti);
        (assigned[lab] = assigned[lab] ?? []).push(idx);
      });

      // Conflict check: other group members outside this selection that share a label
      if (grpKey) {
        const targetSet = new Set(targetIndices);
        for (let i = 0; i < currentState.cells.length; i++) {
          const cell = currentState.cells[i];
          if (!cell?.group || getGroupName(cell.group) !== grpKey) continue;
          if (targetSet.has(i)) continue;
          if (cell.label && assigned[cell.label]) {
            return 'Duplicate label(s) would collide with existing group members — choose a different start # or prefix';
          }
        }
      }

      const newCells = [...currentState.cells];
      targetIndices.forEach((idx, ti) => {
        const lab = prefix ? `${prefix}${startNum + ti}` : String(startNum + ti);
        newCells[idx] = {
          label: lab,
          group: grpKey ? { name: grpKey } : null
        };
      });

      const newGroupMeta = { ...currentState.groupMeta };
      if (grpKey) {
        newGroupMeta[grpKey] = {
          ...existingMeta,
          base: displayBase,
          num: existingMeta.num ?? nextGroupNumber(displayBase, currentState),
          prefix: prefix || undefined
        };
      }

      update((st) => {
        const newHistory = [...st.history.slice(0, st.histIndex + 1), [...newCells]];
        return {
          ...st,
          cells: newCells,
          groupMeta: newGroupMeta,
          history: newHistory,
          histIndex: newHistory.length - 1,
          pendingSelection: null
        };
      });
      return null;
    },

    /** Remove a single cell from its group, renumbering remaining members. */
    removeSeatFromGroup(idx: number) {
      update((s) => {
        const cell = s.cells[idx];
        if (!cell?.group) return s;
        const groupName = getGroupName(cell.group);
        const newCells = [...s.cells];
        newCells[idx] = null;

        // Renumber remaining members sequentially
        if (groupName) {
          const remaining = newCells
            .map((c, i) => ({ i, c }))
            .filter(({ c }) => c?.group && getGroupName(c.group) === groupName)
            .sort((a, b) => a.i - b.i);

          remaining.forEach(({ i }, ti) => {
            const c = newCells[i]!;
            const prefix = s.groupMeta[groupName]?.prefix ?? '';
            newCells[i] = { ...c, label: prefix ? `${prefix}${ti + 1}` : String(ti + 1) };
          });

          // If no members left, remove groupMeta entry
          if (remaining.length === 0) {
            const newMeta = { ...s.groupMeta };
            delete newMeta[groupName];
            const newHistory = [...s.history.slice(0, s.histIndex + 1), [...newCells]];
            return {
              ...s,
              cells: newCells,
              groupMeta: newMeta,
              history: newHistory,
              histIndex: newHistory.length - 1,
              pendingSelection: null
            };
          }
        }

        const newHistory = [...s.history.slice(0, s.histIndex + 1), [...newCells]];
        return {
          ...s,
          cells: newCells,
          history: newHistory,
          histIndex: newHistory.length - 1,
          pendingSelection: null
        };
      });
    },

    /** Select all members of a group (sets pendingSelection with memberIndices). */
    selectGroup(groupName: string) {
      update((s) => {
        const memberIndices = s.cells
          .map((c, i) => ({ c, i }))
          .filter(({ c }) => c?.group && getGroupName(c.group) === groupName)
          .map(({ i }) => i)
          .sort((a, b) => a - b);

        if (!memberIndices.length) return s;

        const rows = memberIndices.map((i) => Math.floor(i / s.cols));
        const cols = memberIndices.map((i) => i % s.cols);
        const aR = Math.min(...rows), bR = Math.max(...rows);
        const aC = Math.min(...cols), bC = Math.max(...cols);

        return {
          ...s,
          pendingSelection: { aR, bR, aC, bC, groupName, memberIndices, opts: { allowAutoName: false } }
        };
      });
    },

    /** Delete group from local editor state (does not call server). */
    deleteGroupLocally(groupName: string) {
      update((s) => {
        const newCells = s.cells.map((c) =>
          c?.group && getGroupName(c.group) === groupName ? null : c
        );
        const newMeta = { ...s.groupMeta };
        delete newMeta[groupName];
        const newHistory = [...s.history.slice(0, s.histIndex + 1), [...newCells]];
        return {
          ...s,
          cells: newCells,
          groupMeta: newMeta,
          history: newHistory,
          histIndex: newHistory.length - 1,
          pendingSelection: null
        };
      });
    },

    /** Rename user-facing display label for a group while keeping internal key unchanged. */
    renameGroupDisplayName(groupName: string, displayName: string) {
      const base = displayName.trim();
      if (!groupName || !base) return;
      update((s) => {
        const current = s.groupMeta[groupName] ?? {};
        return {
          ...s,
          hasUnsavedRename: true,
          groupMeta: {
            ...s.groupMeta,
            [groupName]: {
              ...current,
              base
            }
          }
        };
      });
    },

    /** Clear transient unsaved rename marker after a successful save. */
    clearUnsavedRenameFlag() {
      update((s) => ({ ...s, hasUnsavedRename: false }));
    },

    /** Apply name mapping returned by the grid save endpoint. */
    applyNameMapping(mapping: NameMapping) {
      update((s) => {
        const newMeta = { ...s.groupMeta };
        const newCells = [...s.cells];

        for (const [orig, { name: persisted, id }] of Object.entries(mapping)) {
          if (orig === persisted) {
            newMeta[orig] = { ...(newMeta[orig] ?? {}), id };
          } else {
            newMeta[persisted] = { ...(newMeta[orig] ?? newMeta[persisted] ?? {}), id };
            delete newMeta[orig];
          }

          for (let i = 0; i < newCells.length; i++) {
            const c = newCells[i];
            if (c?.group && getGroupName(c.group) === orig) {
              newCells[i] = { ...c, group: { ...(c.group as object), name: persisted, id } as EditorCell['group'] };
            }
          }
        }

        const newHistory = [...s.history.slice(0, s.histIndex + 1), [...newCells]];
        return {
          ...s,
          cells: newCells,
          groupMeta: newMeta,
          history: newHistory,
          histIndex: newHistory.length - 1
        };
      });
    },

    /** Resize the grid, preserving as many cells as possible. */
    resize(newRows: number, newCols: number) {
      update((s) => {
        const { rows: oldRows, cols: oldCols } = s;
        const newCells: (EditorCell | null)[] = Array(newRows * newCols).fill(null);
        const copyRows = Math.min(oldRows, newRows);
        const copyCols = Math.min(oldCols, newCols);
        for (let r = 0; r < copyRows; r++) {
          for (let c = 0; c < copyCols; c++) {
            newCells[r * newCols + c] = s.cells[r * oldCols + c] ?? null;
          }
        }
        const newHistory = [...s.history.slice(0, s.histIndex + 1), [...newCells]];
        return {
          ...s,
          rows: newRows,
          cols: newCols,
          cells: newCells,
          history: newHistory,
          histIndex: newHistory.length - 1
        };
      });
    }
  };
}

export const editor = createEditorStore();
