<script lang="ts">
  import { spinner } from '$lib/stores/ui';
  import { fade } from 'svelte/transition';
</script>

{#if $spinner}
  <div class="spinner-overlay" transition:fade={{ duration: 150 }}>
    <div class="spinner-box">
      <div class="spinner-ring"></div>
      <p class="spinner-label">{$spinner}</p>
    </div>
  </div>
{/if}

<style>
  .spinner-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9000;
  }
  .spinner-box {
    background: #fff;
    border-radius: 10px;
    padding: 2rem 2.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    box-shadow: 0 8px 30px rgba(0,0,0,0.2);
  }
  .spinner-ring {
    width: 40px;
    height: 40px;
    border: 4px solid #ddd;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.75s linear infinite;
  }
  .spinner-label {
    margin: 0;
    font-size: 0.95rem;
    color: #555;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
