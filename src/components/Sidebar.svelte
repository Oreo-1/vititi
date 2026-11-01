<script>
  import { isDM } from '../lib/auth.svelte.js';
  import { game } from '../lib/game.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import MapManager from './MapManager.svelte';
  import MapSettings from './MapSettings.svelte';
  import TokenPanel from './TokenPanel.svelte';
  import DrawingList from './DrawingList.svelte';
</script>

<aside id="vtt-sidebar" class="vtt-sidebar p-2" class:d-none={!ui.sidebarOpen}>
  {#if !game.ready && !game.error}
    <div class="text-muted small">Connecting…</div>
  {/if}
  {#if isDM()}
    <MapManager />
    <MapSettings />
  {/if}
  <TokenPanel />
  <DrawingList />
</aside>
