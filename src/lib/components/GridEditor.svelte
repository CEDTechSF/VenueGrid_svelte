<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { editor } from '$lib/stores/editor';
  import { groupColor, getGroupDisplayName } from '$lib/utils/group';
  import GroupEditor from './GroupEditor.svelte';
  import GroupList from './GroupList.svelte';
  import type { EditorCell } from '$lib/types';

  // layoutId is used for localStorage draft key
  export let layoutId: number;

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let isDragging = false;
  let dragStartIdx: number | null = null;
  let dragMoved = false;

  function handleMouseDown(e: MouseEvent, idx: number) {
    e.preventDefault();
    isDragging = true;
    dragStartIdx = idx;
    dragMoved = false;
    editor.startDrag(idx);
  }

  function handleMouseEnter(idx: number) {
    if (!isDragging) return;
    if (dragStartIdx !== null && idx !== dragStartIdx) dragMoved = true;
    editor.updateDrag(idx);
  }

  function handleMouseUp() {
    if (isDragging) {
      const wasClick = !dragMoved;
      const clickedIdx = dragStartIdx;
      isDragging = false;
      dragStartIdx = null;
      dragMoved = false;
      editor.endDrag();
      if (wasClick && clickedIdx !== null) {
        editor.openSingleCell(clickedIdx);
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z') { e.preventDefault(); editor.undo(); }
      if (e.key === 'y') { e.preventDefault(); editor.redo(); }
      if (e.shiftKey && e.key === 'Z') { e.preventDefault(); editor.redo(); }
    }
  }

  function isPendingIndex(idx: number, state: typeof $editor): boolean {
    const ps = state.pendingSelection;
    if (!ps) return false;
    if (ps.memberIndices?.length) return ps.memberIndices.includes(idx);
    const r = Math.floor(idx / state.cols);
    const c = idx % state.cols;
    return r >= ps.aR && r <= ps.bR && c >= ps.aC && c <= ps.bC;
  }

  function isInDragRange(idx: number, state: typeof $editor): boolean {
    if (!state.dragging || state.dragStart === null || state.dragEnd === null) return false;
    const startR = Math.floor(state.dragStart / state.cols);
    const startC = state.dragStart % state.cols;
    const endR = Math.floor(state.dragEnd / state.cols);
    const endC = state.dragEnd % state.cols;
    const aR = Math.min(startR, endR);
    const bR = Math.max(startR, endR);
    const aC = Math.min(startC, endC);
    const bC = Math.max(startC, endC);
    const r = Math.floor(idx / state.cols);
    const c = idx % state.cols;
    return r >= aR && r <= bR && c >= aC && c <= bC;
  }

  function cellClass(cell: EditorCell | null, idx: number, state: typeof $editor) {
    const classes = ['cell'];
    if (!cell) classes.push('cell--null');

    if (isPendingIndex(idx, state)) classes.push('cell--pending');
    else if (isInDragRange(idx, state)) classes.push('cell--dragging');
    else if (cell?.group) classes.push('cell--grouped');
    else classes.push('cell--ungrouped');

    return classes.join(' ');
  }

  function cellStyle(cell: EditorCell | null, idx: number, state: typeof $editor) {
    if (!cell?.group) return '';
    if (isPendingIndex(idx, state)) return '';
    return `background-color: ${groupColor(cell.group.name)};`;
  }

  function cellTitle(cell: EditorCell | null, state: typeof $editor): string {
    if (!cell) return '(empty)';
    if (!cell.group) return cell.label ?? '';
    return `${cell.label ?? ''} - ${getGroupDisplayName(cell.group.name, state.groupMeta)}`.trim();
  }

  // Debounced localStorage autosave
  function scheduleSave(state: typeof $editor) {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      const key = `venuegrid.editor.draft.${layoutId}`;
      try {
        localStorage.setItem(key, JSON.stringify({
          cells: state.cells,
          groupMeta: state.groupMeta,
          rows: state.rows,
          cols: state.cols,
          savedAt: Date.now()
        }));
      } catch { /* ignore quota errors */ }
    }, 1200);
  }

  $: if ($editor.cells.length > 0) scheduleSave($editor);

  onMount(() => {
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
  });

  onDestroy(() => {
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('keydown', handleKeyDown);
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
  });
</script>

<div class="editor-root">
  <div class="editor-toolbar">
    <button on:click={() => editor.undo()} disabled={$editor.histIndex <= 0}>↩ Undo</button>
    <button on:click={() => editor.redo()} disabled={$editor.histIndex >= $editor.history.length - 1}>↪ Redo</button>
    <span class="editor-toolbar__sep"></span>
    <button on:click={() => editor.resize($editor.rows - 1, $editor.cols)}>− Row</button>
    <button on:click={() => editor.resize($editor.rows + 1, $editor.cols)}>+ Row</button>
    <button on:click={() => editor.resize($editor.rows, $editor.cols - 1)}>− Col</button>
    <button on:click={() => editor.resize($editor.rows, $editor.cols + 1)}>+ Col</button>
    <span class="editor-toolbar__dim">{$editor.rows} × {$editor.cols}</span>
  </div>

  <div class="editor-body">
    <div class="editor-grid-wrap">
      <div
        class="editor-grid"
        style="--cols: {$editor.cols};"
        role="grid"
        on:mouseleave={handleMouseUp}
      >
        {#each $editor.cells as cell, idx}
          <div
            role="gridcell"
            class={cellClass(cell, idx, $editor)}
            style={cellStyle(cell, idx, $editor)}
            on:mousedown={(e) => handleMouseDown(e, idx)}
            on:mouseenter={() => handleMouseEnter(idx)}
            title={cellTitle(cell, $editor)}
          >
            {#if cell}
              <span class="cell-label">{cell.label}</span>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <div class="editor-sidebar">
      {#if $editor.pendingSelection}
        <GroupEditor />
      {:else}
        <GroupList {layoutId} />
      {/if}
    </div>
  </div>
</div>

<style>
  .editor-root { display: flex; flex-direction: column; gap: 0.75rem; }
  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex-wrap: wrap;
  }
  .editor-toolbar button {
    padding: 0.3rem 0.65rem;
    font-size: 0.82rem;
    cursor: pointer;
    border: 1px solid #bbb;
    border-radius: 4px;
    background: #f5f5f5;
  }
  .editor-toolbar button:disabled { opacity: 0.4; cursor: default; }
  .editor-toolbar__sep { width: 1px; height: 20px; background: #ccc; margin: 0 0.2rem; }
  .editor-toolbar__dim { font-size: 0.8rem; color: #777; margin-left: 0.4rem; }

  .editor-body { display: flex; gap: 1rem; align-items: flex-start; }
  .editor-grid-wrap { flex: 1; min-width: 0; overflow: auto; }

  .editor-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 3px;
    user-select: none;
  }

  .cell {
    aspect-ratio: 1;
    border: 1px solid #ccc;
    border-radius: 3px;
    cursor: pointer;
    font-size: 0.65rem;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    min-height: 24px;
    transition: filter 0.08s;
  }
  .cell:hover { filter: brightness(0.88); }
  .cell--null   { background: #f5f5f5; border-color: #e0e0e0; cursor: default; }
  .cell--ungrouped { background: #fff; border-color: #bbb; }
  .cell--grouped { background: #e3f2fd; }
  .cell--dragging { background: #fff8b3 !important; border-color: #e0a800 !important; border-width: 2px; }
  .cell--pending { background: #fff176 !important; border-color: #f9a825 !important; border-width: 2px; }
  .cell--selected-group { background: #b3e5fc !important; border-color: #039be5 !important; border-width: 2px; }
  .cell-label { pointer-events: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90%; }

  .editor-sidebar { width: 230px; flex-shrink: 0; }
</style>
