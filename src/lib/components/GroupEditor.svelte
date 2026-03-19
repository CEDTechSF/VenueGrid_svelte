<script lang="ts">
  import { editor } from '$lib/stores/editor';
  import { isTempName } from '$lib/utils/group';

  // Resolved display name for the group currently being edited
  $: pending = $editor.pendingSelection;
  $: existingGroupName = pending?.groupName ?? null;
  $: meta = existingGroupName ? ($editor.groupMeta[existingGroupName] ?? null) : null;

  let displayLabel = '';
  let prefix = '';
  let startNum = 1;

  // Populate form when selection changes
  $: if (pending) {
    displayLabel = meta?.base ?? (existingGroupName && !isTempName(existingGroupName) ? existingGroupName : '');
    prefix = meta?.prefix ?? '';
    startNum = meta?.num ?? 1;
  }

  function apply() {
    if (!displayLabel.trim()) return;
    editor.applyGroupEditor(existingGroupName ?? '', displayLabel.trim(), prefix.trim(), startNum);
  }

  function cancel() {
    editor.closePendingSelection();
  }
</script>

{#if pending}
  <div class="group-editor">
    <h3 class="group-editor__title">
      {existingGroupName ? 'Edit Group' : 'New Group'}
    </h3>

    <label class="field">
      <span>Group name</span>
      <input type="text" bind:value={displayLabel} placeholder="e.g. Table" />
    </label>

    <label class="field">
      <span>Seat prefix</span>
      <input type="text" bind:value={prefix} placeholder="e.g. T" />
    </label>

    <label class="field">
      <span>Start number</span>
      <input type="number" bind:value={startNum} min="1" />
    </label>

    <p class="group-editor__preview">
      Preview: {prefix}{startNum}, {prefix}{startNum + 1} …
    </p>

    <div class="group-editor__actions">
      <button class="btn btn--primary" on:click={apply} disabled={!displayLabel.trim()}>
        Apply
      </button>
      <button class="btn" on:click={cancel}>Cancel</button>
    </div>
  </div>
{/if}

<style>
  .group-editor {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }
  .group-editor__title {
    margin: 0 0 0.25rem;
    font-size: 0.95rem;
    font-weight: 600;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .field span { font-size: 0.78rem; color: #555; }
  .field input {
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 0.3rem 0.5rem;
    font-size: 0.88rem;
  }
  .group-editor__preview {
    font-size: 0.78rem;
    color: #777;
    margin: 0;
  }
  .group-editor__actions { display: flex; gap: 0.5rem; }
  .btn {
    padding: 0.35rem 0.8rem;
    border: 1px solid #bbb;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.84rem;
    background: #f5f5f5;
  }
  .btn--primary {
    background: #3b82f6;
    color: #fff;
    border-color: #2563eb;
  }
  .btn--primary:disabled { opacity: 0.5; cursor: default; }
</style>
