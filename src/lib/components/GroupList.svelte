<script lang="ts">
  import { editor } from '$lib/stores/editor';
  import { addToast } from '$lib/stores/ui';
  import { apiDelete } from '$lib/api/client';
  import { groupColor, getGroupDisplayName } from '$lib/utils/group';

  export let layoutId: number;

  interface GroupSummary {
    key: string;
    label: string;
    count: number;
  }

  let renamingKey: string | null = null;
  let renameValue = '';

  $: groups = computeGroups($editor.cells, $editor.groupMeta);

  function computeGroups(
    cells: typeof $editor.cells,
    groupMeta: typeof $editor.groupMeta
  ): GroupSummary[] {
    const counts = new Map<string, number>();
    for (const cell of cells) {
      if (cell?.group?.name) {
        counts.set(cell.group.name, (counts.get(cell.group.name) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([key, count]) => ({ key, label: getGroupDisplayName(key, groupMeta), count }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  async function deleteGroup(name: string) {
    // Optimistic update
    const snapshot = JSON.stringify($editor);
    editor.deleteGroupLocally(name);

    try {
      await apiDelete(`/api/admin/layouts/${layoutId}/groups/${encodeURIComponent(name)}`);
    } catch (err) {
      // Rollback: reload page to restore consistent state
      addToast(`Failed to delete group — please reload`, 'error');
      console.error(err);
    }
  }

  function selectGroup(name: string) {
    editor.selectGroup(name);
  }

  function startRename(g: GroupSummary) {
    renamingKey = g.key;
    renameValue = g.label;
  }

  function cancelRename() {
    renamingKey = null;
    renameValue = '';
  }

  function commitRename(key: string) {
    const next = renameValue.trim();
    if (!next) {
      addToast('Group name cannot be empty', 'error');
      return;
    }
    editor.renameGroupDisplayName(key, next);
    cancelRename();
    addToast('Group name updated', 'success');
  }
</script>

<div class="group-list">
  <h3 class="group-list__title">Groups ({groups.length})</h3>

  {#if groups.length === 0}
    <p class="group-list__empty">No groups yet.<br/>Drag to select cells, then assign a group.</p>
  {:else}
    <ul class="group-list__items">
      {#each groups as g (g.key)}
        <li
          class="group-item"
          class:group-item--active={$editor.pendingSelection?.groupName === g.key}
        >
          <button
            class="group-item__swatch"
            style="background:{groupColor(g.key)}"
            title="Select group"
            on:click={() => selectGroup(g.key)}
          ></button>
          {#if renamingKey === g.key}
            <input
              class="group-item__input"
              bind:value={renameValue}
              on:click|stopPropagation
              on:keydown={(e) => {
                if (e.key === 'Enter') commitRename(g.key);
                if (e.key === 'Escape') cancelRename();
              }}
              on:blur={() => commitRename(g.key)}
            />
          {:else}
            <button class="group-item__name" on:click={() => selectGroup(g.key)} title={g.label}>
              {g.label}
            </button>
          {/if}
          <span class="group-item__count">{g.count}</span>
          <button
            class="group-item__edit"
            title="Rename group"
            on:click={() => startRename(g)}
          >✎</button>
          <button
            class="group-item__del"
            title="Delete group"
            on:click={() => deleteGroup(g.key)}
          >×</button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .group-list { display: flex; flex-direction: column; gap: 0.5rem; }
  .group-list__title { margin: 0; font-size: 0.88rem; font-weight: 600; color: #444; }
  .group-list__empty { font-size: 0.8rem; color: #888; margin: 0; line-height: 1.5; }

  .group-list__items {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-height: 400px;
    overflow-y: auto;
  }

  .group-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 6px;
    border-radius: 5px;
    background: #f5f5f5;
    border: 1px solid transparent;
  }
  .group-item--active {
    border-color: #2196f3;
    background: #e3f2fd;
  }

  .group-item__swatch {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    border: 1px solid rgba(0,0,0,0.15);
    flex-shrink: 0;
    cursor: pointer;
    padding: 0;
  }

  .group-item__name {
    flex: 1;
    text-align: left;
    font-size: 0.8rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .group-item__input {
    flex: 1;
    min-width: 0;
    font-size: 0.8rem;
    border: 1px solid #90caf9;
    border-radius: 4px;
    padding: 0.15rem 0.35rem;
    background: #fff;
  }

  .group-item__count {
    font-size: 0.72rem;
    color: #888;
    flex-shrink: 0;
  }

  .group-item__edit {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.9rem;
    color: #555;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
    opacity: 0.7;
  }
  .group-item__edit:hover { opacity: 1; }

  .group-item__del {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    color: #c62828;
    line-height: 1;
    padding: 0 2px;
    flex-shrink: 0;
    opacity: 0.6;
  }
  .group-item__del:hover { opacity: 1; }
</style>
