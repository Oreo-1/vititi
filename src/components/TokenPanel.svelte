<script>
  import { isDM } from '../lib/auth.svelte.js';
  import { game, currentMap, createToken, updateToken, deleteToken } from '../lib/game.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { snapToken } from '../lib/geometry.js';

  let map = $derived(currentMap());
  let dm = $derived(isDM());
  let list = $derived(game.tokens.filter((t) => dm || !t.hidden));
  let selected = $derived(list.find((t) => t.id === ui.selectedTokenId) || null);

  // ---- new token form ----
  let nt = $state({ name: '', size: 1, hidden: false, dm_only: false });
  let fileInput = $state();
  let busy = $state(false);

  async function add(e) {
    e.preventDefault();
    if (!map) return;
    busy = true;
    try {
      const c = snapToken(map, (map.width || 1000) / 2, (map.height || 1000) / 2, nt.size);
      const rec = await createToken({ ...nt, file: fileInput.files[0], x: c.x, y: c.y, mapId: map.id });
      ui.selectedTokenId = rec.id;
      nt = { name: '', size: 1, hidden: false, dm_only: false };
      fileInput.value = '';
    } catch (err) {
      alert(err?.message || err);
    } finally {
      busy = false;
    }
  }

  function patch(data) {
    updateToken(selected.id, data).catch((e) => alert(e?.message || e));
  }

  async function moveToMap(mapId) {
    const target = game.maps.find((m) => m.id === mapId);
    if (!target) return;
    const c = snapToken(target, (target.width || 1000) / 2, (target.height || 1000) / 2, selected.size || 1);
    const id = selected.id;
    ui.selectedTokenId = '';
    await updateToken(id, { map: mapId, x: c.x, y: c.y });
  }

  async function remove() {
    if (confirm(`Delete token "${selected.name}"?`)) {
      const id = selected.id;
      ui.selectedTokenId = '';
      await deleteToken(id);
    }
  }
</script>

<section class="mb-3">
  <h2 class="h6">Tokens</h2>

  {#if selected}
    <div class="card card-body p-2 mb-2">
      {#if dm}
        <div class="mb-1">
          <label class="form-label small mb-0" for="tname">Name</label>
          <input id="tname" class="form-control form-control-sm" value={selected.name} onchange={(e) => patch({ name: e.currentTarget.value })} />
        </div>
        <div class="mb-1">
          <label class="form-label small mb-0" for="tsize">Size (cells)</label>
          <input id="tsize" type="number" min="0.25" step="0.25" class="form-control form-control-sm" value={selected.size}
            onchange={(e) => patch({ size: Number(e.currentTarget.value) || 1 })} />
        </div>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="thid" checked={selected.hidden} onchange={(e) => patch({ hidden: e.currentTarget.checked })} />
          <label class="form-check-label" for="thid">👻 Hidden from players</label>
        </div>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="tdm" checked={selected.dm_only} onchange={(e) => patch({ dm_only: e.currentTarget.checked })} />
          <label class="form-check-label" for="tdm">🔒 Only DM can move</label>
        </div>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="tdead" checked={selected.deceased} onchange={(e) => patch({ deceased: e.currentTarget.checked })} />
          <label class="form-check-label" for="tdead">💀 Fallen</label>
        </div>
        <div class="mb-1">
          <label class="form-label small mb-0" for="tmap">Move to map</label>
          <select id="tmap" class="form-select form-select-sm" value="" onchange={(e) => moveToMap(e.currentTarget.value)}>
            <option value="" disabled>Choose…</option>
            {#each game.maps.filter((m) => m.id !== selected.map) as m (m.id)}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </div>
        <div class="mb-1">
          <label class="form-label small mb-0" for="timg">Replace image</label>
          <input id="timg" type="file" accept="image/*" class="form-control form-control-sm"
            onchange={(e) => { const f = e.currentTarget.files[0]; if (f) { const fd = new FormData(); fd.append('image', f); patch(fd); } }} />
        </div>
        <button class="btn btn-sm btn-outline-danger" onclick={remove}>Delete token</button>
      {:else}
        <strong>{selected.deceased ? '💀 ' : ''}{selected.name}</strong>
        <div class="small text-muted">{selected.dm_only ? 'Only the DM can move this token.' : 'Drag to move.'}</div>
      {/if}
    </div>
  {/if}

  <ul class="list-group list-group-flush mb-2">
    {#each list as t (t.id)}
      <li class="list-group-item list-group-item-action px-1 py-1 small" class:active={ui.selectedTokenId === t.id}>
        <button class="btn btn-link btn-sm p-0 text-reset text-decoration-none" onclick={() => (ui.selectedTokenId = t.id)}>
          {t.hidden ? '👻 ' : ''}{t.dm_only ? '🔒 ' : ''}{t.deceased ? '💀 ' : ''}{t.name || '(unnamed)'}
        </button>
      </li>
    {:else}
      <li class="list-group-item small text-muted px-1">No tokens on this map.</li>
    {/each}
  </ul>

  {#if dm && map}
    <form class="card card-body p-2" onsubmit={add}>
      <div class="small fw-bold mb-1">Add token <span class="fw-normal text-muted">(or drop images onto the map)</span></div>
      <input class="form-control form-control-sm mb-1" placeholder="Name" bind:value={nt.name} required />
      <input class="form-control form-control-sm mb-1" type="file" accept="image/*" bind:this={fileInput} />
      <div class="input-group input-group-sm mb-1">
        <span class="input-group-text">Size</span>
        <input type="number" min="0.25" step="0.25" class="form-control" bind:value={nt.size} />
        <span class="input-group-text">cells</span>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="nthid" bind:checked={nt.hidden} />
        <label class="form-check-label small" for="nthid">Hidden</label>
      </div>
      <div class="form-check mb-1">
        <input class="form-check-input" type="checkbox" id="ntdm" bind:checked={nt.dm_only} />
        <label class="form-check-label small" for="ntdm">Only DM can move</label>
      </div>
      <button class="btn btn-sm btn-primary" disabled={busy}>Add to map</button>
    </form>
  {/if}
</section>
