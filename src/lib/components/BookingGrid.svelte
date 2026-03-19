<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { groupColor } from '$lib/utils/group';
  import type { Layout } from '$lib/types';

  export let layout: Layout;
  export let seats: Array<{
    id: number;
    row: number;
    col: number;
    label: string;
    booked_by: number | null;
    grp_name: string | null;
  }>;
  export let userId: number | null = null;
  export let selection: Set<number> = new Set();

  const dispatch = createEventDispatcher<{ toggle: number }>();

  $: seatMap = new Map(seats.map(s => [`${s.row},${s.col}`, s]));

  function cellClass(seat: typeof seats[0] | undefined) {
    if (!seat) return 'cell cell--empty';
    if (selection.has(seat.id)) return 'cell cell--selected';
    if (seat.booked_by === userId) return 'cell cell--mine';
    if (seat.booked_by !== null) return 'cell cell--taken';
    return 'cell cell--free';
  }

  function cellStyle(seat: typeof seats[0] | undefined) {
    if (seat?.grp_name) {
      return `background-color: ${groupColor(seat.grp_name)};`;
    }
    return '';
  }
</script>

<div
  class="grid"
  style="--cols: {layout.cols};"
  role="grid"
  aria-label="Seat map for {layout.name}"
>
  {#each Array(layout.rows) as _, ri}
    {#each Array(layout.cols) as _, ci}
      {@const seat = seatMap.get(`${ri + 1},${ci + 1}`)}
      <button
        class={cellClass(seat)}
        style={cellStyle(seat)}
        disabled={!seat || (seat.booked_by !== null && seat.booked_by !== userId)}
        title={seat ? `${seat.label}${seat.booked_by ? ' (taken)' : ''}` : ''}
        on:click={() => seat && dispatch('toggle', seat.id)}
        aria-label={seat ? seat.label : 'empty cell'}
      >
        {#if seat}
          <span class="cell-label">{seat.label}</span>
        {/if}
      </button>
    {/each}
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), 1fr);
    gap: 4px;
    max-width: 100%;
  }
  .cell {
    aspect-ratio: 1;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.7rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e8f5e9;
    transition: filter 0.1s;
    padding: 0;
    min-width: 28px;
    min-height: 28px;
  }
  .cell:hover:not(:disabled) { filter: brightness(0.9); }
  .cell--empty {
    background: #f5f5f5;
    border-color: #e0e0e0;
    cursor: default;
    pointer-events: none;
  }
  .cell--free   { background: #e8f5e9; }
  .cell--taken  { background: #ffebee; cursor: not-allowed; }
  .cell--mine   { background: #e3f2fd; border-color: #2196f3; border-width: 2px; }
  .cell--selected { background: #fff9c4; border-color: #f9a825; border-width: 2px; }
  .cell-label { pointer-events: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 90%; }
</style>
