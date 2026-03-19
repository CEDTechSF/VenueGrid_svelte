<script lang="ts">
  import Toast from '$lib/components/Toast.svelte';
  import Spinner from '$lib/components/Spinner.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;
</script>

<slot />
<Toast />
<Spinner />
