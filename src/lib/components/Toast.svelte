<script lang="ts">
  import { toasts } from '$lib/stores/ui';
  import { fly, fade } from 'svelte/transition';
</script>

{#if $toasts.length > 0}
  <div class="toast-container" aria-live="polite">
    {#each $toasts as t (t.id)}
      <div
        class="toast toast--{t.type}"
        role="alert"
        in:fly={{ y: 20, duration: 250 }}
        out:fade={{ duration: 200 }}
      >
        {t.message}
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    align-items: center;
    z-index: 9999;
    pointer-events: none;
  }
  .toast {
    padding: 0.65rem 1.25rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    color: #fff;
    background: #333;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
    max-width: 400px;
    text-align: center;
  }
  .toast--success { background: #2d8a4e; }
  .toast--error   { background: #c0392b; }
  .toast--warning { background: #c07d0a; }
  .toast--info    { background: #2470a8; }
</style>
