<script>
  import { auth } from './lib/auth.svelte.js';
  import { game, startSync, stopSync } from './lib/game.svelte.js';
  import Login from './components/Login.svelte';
  import Toolbar from './components/Toolbar.svelte';
  import Table from './components/Table.svelte';
  import Sidebar from './components/Sidebar.svelte';

  // Start/stop realtime sync whenever the logged-in user changes.
  let userId = $derived(auth.user?.id);
  $effect(() => {
    if (!userId) return;
    startSync();
    return () => stopSync();
  });
</script>

{#if !auth.user}
  <Login />
{:else}
  <div class="vtt-root">
    <Toolbar />
    {#if game.error}
      <div class="alert alert-danger m-2">PocketBase error: {game.error}</div>
    {/if}
    <div class="vtt-main">
      <Table />
      <Sidebar />
    </div>
  </div>
{/if}
