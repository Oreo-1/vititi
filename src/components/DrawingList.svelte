<script>
  import { auth, isDM } from '../lib/auth.svelte.js';
  import { game, canEditDrawing, canDeleteDrawing, updateDrawing, deleteDrawing, clearDrawings, currentMap } from '../lib/game.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { pxToFt, rectFromPoints } from '../lib/geometry.js';

  let map = $derived(currentMap());

  function describe(d) {
    if (d.kind === 'aoe') {
      const ft = Math.round(pxToFt(map, Math.hypot(d.x2 - d.x1, d.y2 - d.y1)));
      return `AoE ${d.shape} ${ft} ft`;
    }
    const r = rectFromPoints(d.x1, d.y1, d.x2, d.y2);
    return `Highlight ${Math.round(pxToFt(map, r.w))}×${Math.round(pxToFt(map, r.h))} ft`;
  }

  function label(d) {
    return d.name ? `${d.name} · ${describe(d)}` : describe(d);
  }

  let renamingId = $state('');
  let newName = $state('');

  function startRename(d) {
    renamingId = d.id;
    newName = d.name || '';
  }

  // Names are optional, so saving a blank name clears it.
  async function commitRename() {
    const id = renamingId;
    if (!id) return; // already handled: removing the focused input fires blur too
    renamingId = '';
    const d = game.drawings.find((d) => d.id === id);
    const name = newName.trim();
    if (!d || name === (d.name || '')) return; // deleted meanwhile, or unchanged
    try {
      await updateDrawing(id, { name });
    } catch (e) {
      alert('Could not rename: ' + (e?.message || e));
    }
  }

  function onRenameKey(e) {
    if (e.key === 'Enter') commitRename();
    else if (e.key === 'Escape') renamingId = '';
  }

  function focusAndSelect(input) {
    input.focus();
    input.select();
  }
</script>

{#if map}
  <section class="mb-3">
    <h2 class="h6">Areas &amp; highlights</h2>
    <ul class="list-group list-group-flush mb-2">
      {#each game.drawings as d (d.id)}
        <li class="list-group-item px-1 py-1 small d-flex align-items-center gap-1" class:active={ui.selectedDrawingId === d.id}>
          <span class="flex-shrink-0" style="display:inline-block;width:12px;height:12px;background:{d.color}"></span>
          {#if renamingId === d.id}
            <input class="form-control form-control-sm w-auto flex-grow-1" style="min-width:0" aria-label="Area name" maxlength="50" placeholder={describe(d)}
              bind:value={newName} use:focusAndSelect onkeydown={onRenameKey} onblur={commitRename} />
          {:else}
            <button class="btn btn-link btn-sm p-0 text-reset text-decoration-none flex-grow-1 text-start text-truncate" style="min-width:0" title={label(d)}
              onclick={() => { ui.tool = 'select'; ui.selectedDrawingId = d.id; }}>{label(d)}</button>
            {#if canEditDrawing(d)}
              <button class="btn btn-sm p-0 border-0" title="Rename" aria-label="Rename {label(d)}" onclick={() => startRename(d)}>✏️</button>
            {/if}
          {/if}
          {#if canDeleteDrawing(d)}
            <button class="btn btn-sm btn-outline-danger py-0" onclick={() => deleteDrawing(d.id)}>×</button>
          {/if}
        </li>
      {:else}
        <li class="list-group-item small text-muted px-1">None. Use the AoE / Highlight tools.</li>
      {/each}
    </ul>
    <div class="btn-group btn-group-sm">
      <button class="btn btn-outline-secondary" onclick={() => clearDrawings({ onlyMine: true })}>Clear mine</button>
      {#if isDM()}
        <button class="btn btn-outline-danger" onclick={() => confirm('Remove all areas on this map?') && clearDrawings({ onlyMine: false })}>Clear all</button>
      {/if}
    </div>
  </section>
{/if}
