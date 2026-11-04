<script>
  import { currentMap, updateMap, fogOf, setFog } from '../lib/game.svelte.js';

  let map = $derived(currentMap());
  let fog = $derived(fogOf(map));

  // Local editable copy of the grid settings for the viewed map.
  let form = $state({});
  let formFor = '';
  $effect(() => {
    if (map && map.id !== formFor) {
      formFor = map.id;
      form = {
        grid_type: map.grid_type || 'square',
        grid_size: map.grid_size || 70,
        grid_offset_x: map.grid_offset_x || 0,
        grid_offset_y: map.grid_offset_y || 0,
        grid_visible: !!map.grid_visible,
      };
    }
  });

  // Save shortly after edits stop, so the grid updates live for everybody.
  let timer;
  function save() {
    clearTimeout(timer);
    const id = map.id;
    timer = setTimeout(() => {
      if (formFor === id) updateMap(id, { ...form }).catch(console.error);
    }, 300);
  }
</script>

{#if map}
  <section class="mb-3">
    <h2 class="h6">Map settings</h2>
    <div class="form-check form-switch">
      <input class="form-check-input" type="checkbox" id="gridvis" bind:checked={form.grid_visible} onchange={save} />
      <label class="form-check-label" for="gridvis">Show grid</label>
    </div>
    <div class="row g-1 mb-2">
      <div class="col-6">
        <label class="form-label small mb-0" for="gtype">Grid type</label>
        <select id="gtype" class="form-select form-select-sm" bind:value={form.grid_type} onchange={save}>
          <option value="square">Square</option>
          <option value="hex">Hex</option>
        </select>
      </div>
      <div class="col-6">
        <label class="form-label small mb-0" for="gsize">Cell size (px = 5 ft)</label>
        <input id="gsize" type="number" min="4" step="0.5" class="form-control form-control-sm" bind:value={form.grid_size} oninput={save} />
      </div>
      <div class="col-6">
        <label class="form-label small mb-0" for="gox">Offset X</label>
        <input id="gox" type="number" step="0.5" class="form-control form-control-sm" bind:value={form.grid_offset_x} oninput={save} />
      </div>
      <div class="col-6">
        <label class="form-label small mb-0" for="goy">Offset Y</label>
        <input id="goy" type="number" step="0.5" class="form-control form-control-sm" bind:value={form.grid_offset_y} oninput={save} />
      </div>
    </div>
    <div class="small text-muted mb-2">Map size: {map.width} × {map.height}px</div>

    <h2 class="h6">Fog of war</h2>
    <div class="form-check form-switch">
      <input class="form-check-input" type="checkbox" id="fogon" checked={fog.enabled}
        onchange={(e) => setFog(map, { ...fog, enabled: e.currentTarget.checked })} />
      <label class="form-check-label" for="fogon">Enable fog</label>
    </div>
    <div class="btn-group btn-group-sm mt-1">
      <button class="btn btn-outline-dark" onclick={() => setFog(map, { ...fog, ops: [] })}>Cover all</button>
      <button class="btn btn-outline-secondary"
        onclick={() => setFog(map, { ...fog, ops: [{ type: 'reveal', x: 0, y: 0, w: map.width, h: map.height }] })}>Reveal all</button>
    </div>
    <div class="form-text">Use the Reveal Fog / Hide Fog tools and drag rectangles on the map.</div>
  </section>
{/if}
