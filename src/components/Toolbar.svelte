<script>
  import { auth, isDM, logout } from '../lib/auth.svelte.js';
  import { game } from '../lib/game.svelte.js';
  import { ui, TOOLS } from '../lib/ui.svelte.js';

  let activeMapName = $derived(game.maps.find((m) => m.id === game.state?.active_map)?.name || '—');
  let tools = $derived(TOOLS.filter((t) => !t.dmOnly || isDM()));
</script>

<nav class="navbar navbar-expand bg-body-tertiary border-bottom px-2 gap-2 flex-wrap">
  <span class="navbar-brand">Vititi</span>

  <div class="btn-group btn-group-sm" role="group" aria-label="Tools">
    {#each tools as t}
      <input type="radio" class="btn-check" name="tool" id="tool-{t.id}" value={t.id} bind:group={ui.tool} autocomplete="off" />
      <label class="btn btn-outline-primary" for="tool-{t.id}">{t.label}</label>
    {/each}
  </div>

  {#if ui.tool === 'aoe'}
    <select class="form-select form-select-sm w-auto" bind:value={ui.aoeShape} title="AoE shape">
      <option value="circle">Full circle</option>
      <option value="half">Half circle</option>
      <option value="quarter">Quarter circle</option>
      <option value="rect">Rectangle</option>
    </select>
  {/if}

  {#if ui.tool === 'measure'}
    <select class="form-select form-select-sm w-auto" bind:value={ui.measureRule} title="Diagonal rule">
      <option value="euclid">Euclidean</option>
      <option value="5e">Diagonals = 5 ft (5e)</option>
      <option value="alt">Diagonals 5/10/5</option>
    </select>
  {/if}

  {#if ui.tool === 'aoe'}
    <input type="color" class="form-control form-control-sm form-control-color" bind:value={ui.color} title="Color" />
  {/if}

  <div class="form-check form-switch mb-0">
    <input class="form-check-input" type="checkbox" id="snap" bind:checked={ui.snap} />
    <label class="form-check-label" for="snap">Snap to grid</label>
  </div>

  <span class="ms-auto small">
    Players on: <strong>{activeMapName}</strong>
    | {auth.user?.name} ({isDM() ? 'DM' : 'Player'})
  </span>
  <button class="btn btn-sm btn-outline-secondary" onclick={logout}>Logout</button>
</nav>
