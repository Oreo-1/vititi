<script>
  import { isDM } from '../lib/auth.svelte.js';
  import { game, currentMap, createToken, cloneToken, updateToken, deleteToken, initiativeOrder, addToInitiative, removeFromInitiative, sortByName, canMoveToken, canRestyleToken } from '../lib/game.svelte.js';
  import { ui, selectOnly, clearSelection, isSelected, pick } from '../lib/ui.svelte.js';
  import { snapToken, cellSize } from '../lib/geometry.js';

  let map = $derived(currentMap());
  let dm = $derived(isDM());
  let list = $derived(sortByName(game.tokens.filter((t) => dm || !t.hidden)));
  let chosen = $derived(list.filter((t) => isSelected('tokens', t.id)));
  let selected = $derived(chosen.length === 1 ? chosen[0] : null); // one token: the full editor
  let several = $derived(chosen.length > 1); // more: shared toggles only
  let inInitiative = $derived(!!selected && initiativeOrder().some((e) => e.token === selected.id));

  function toggleInitiative() {
    const job = inInitiative ? removeFromInitiative(selected.id) : addToInitiative([selected]);
    job.catch((e) => alert('Could not update the turn order: ' + (e?.message || e)));
  }

  // ---- new token form ----
  let nt = $state({ name: '', size: 1, hidden: false, anyone_can_move: false });
  let fileInput = $state();
  let busy = $state(false);

  async function add(e) {
    e.preventDefault();
    if (!map) return;
    busy = true;
    try {
      const c = snapToken(map, (map.width || 1000) / 2, (map.height || 1000) / 2, nt.size);
      const rec = await createToken({ ...nt, file: fileInput.files[0], x: c.x, y: c.y, mapId: map.id });
      selectOnly({ tokens: [rec.id] });
      nt = { name: '', size: 1, hidden: false, anyone_can_move: false };
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

  function replaceImage(e) {
    const f = e.currentTarget.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('image', f);
    patch(fd);
  }

  // ---- assigned players: they (and the DM) can move the token; nobody assigned = only the DM,
  // unless "Anyone can move" is on
  let owners = $derived(selected?.owners || []);
  let ownerNames = $derived(game.players.filter((p) => owners.includes(p.id)).map((p) => p.name).join(', '));

  function setOwner(userId, on) {
    // add/remove just this one on the server, so quick clicks can't undo each other
    patch({ [on ? 'owners+' : 'owners-']: userId });
  }

  async function moveToMap(mapId) {
    const target = game.maps.find((m) => m.id === mapId);
    if (!target) return;
    const c = snapToken(target, (target.width || 1000) / 2, (target.height || 1000) / 2, selected.size || 1);
    const id = selected.id;
    clearSelection();
    await updateToken(id, { map: mapId, x: c.x, y: c.y });
  }

  let cloning = $state(false);

  async function clone() {
    cloning = true;
    try {
      const rec = await cloneToken(selected);
      selectOnly({ tokens: [rec.id] });
    } catch (err) {
      alert(err?.message || err);
    } finally {
      cloning = false;
    }
  }

  // ---- several tokens selected: tick a toggle for all of them at once ----
  const FLAGS = [
    { key: 'hidden', label: '👻 Hidden from players' },
    { key: 'anyone_can_move', label: '🔓 Anyone can move' },
    { key: 'deceased', label: '💀 Fallen' },
  ];

  // how many of the selected tokens have it on: all = ticked, some = a dash (mixed)
  const countOn = (has) => chosen.filter(has).length;

  // A mixed box turns on when clicked. Only tokens that differ are sent.
  function patchAll(tokens, data) {
    Promise.all(tokens.map((t) => updateToken(t.id, data))).catch((e) => alert(e?.message || e));
  }
  function setFlagAll(key, on) {
    patchAll(chosen.filter((t) => !!t[key] !== on), { [key]: on });
  }
  function setOwnerAll(userId, on) {
    const has = (t) => (t.owners || []).includes(userId);
    patchAll(chosen.filter((t) => has(t) !== on), { [on ? 'owners+' : 'owners-']: userId });
  }

  // The group lands in the middle of the other map, keeping its layout counted in cells
  // (so it isn't squashed or spread out when the two maps' grids differ), each token snapped
  // to a cell and kept on the map.
  async function moveAllToMap(mapId) {
    const target = game.maps.find((m) => m.id === mapId);
    if (!target || !map) return;
    const tokens = [...chosen];
    const xs = tokens.map((t) => t.x), ys = tokens.map((t) => t.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const k = cellSize(target) / cellSize(map);
    const W = target.width || 1000, H = target.height || 1000;
    // whole token on the map (a group too big for it bunches up at the edges)
    const clamp = (v, r, max) => Math.min(Math.max(v, Math.min(r, max / 2)), Math.max(max - r, max / 2));
    clearSelection();
    try {
      await Promise.all(tokens.map((t) => {
        const size = Number(t.size) || 1;
        const r = (size * cellSize(target)) / 2;
        const c = snapToken(target, W / 2 + (t.x - cx) * k, H / 2 + (t.y - cy) * k, size);
        return updateToken(t.id, { map: mapId, x: clamp(c.x, r, W), y: clamp(c.y, r, H) });
      }));
    } catch (e) {
      alert('Could not move them: ' + (e?.message || e));
    }
  }

  function addAllToInitiative() {
    addToInitiative(chosen).catch((e) => alert('Could not update the turn order: ' + (e?.message || e)));
  }

  async function removeAll() {
    const ids = chosen.map((t) => t.id);
    if (!confirm(`Delete ${ids.length} tokens?`)) return;
    clearSelection();
    try {
      await Promise.all(ids.map((id) => deleteToken(id)));
    } catch (e) {
      alert('Could not delete: ' + (e?.message || e));
    }
  }

  // `indeterminate` is a property only (there's no HTML attribute for it)
  function mixed(node, on) {
    node.indeterminate = on;
    return { update(v) { node.indeterminate = v; } };
  }

  async function remove() {
    if (confirm(`Delete token "${selected.name}"?`)) {
      const id = selected.id;
      clearSelection();
      await deleteToken(id);
    }
  }
</script>

<!-- shared by the DM and the token's assigned players -->
{#snippet nameField()}
  <div class="mb-1">
    <label class="form-label small mb-0" for="tname">Name</label>
    <input id="tname" class="form-control form-control-sm" value={selected.name} onchange={(e) => patch({ name: e.currentTarget.value })} />
  </div>
{/snippet}
{#snippet imageField()}
  <div class="mb-1">
    <label class="form-label small mb-0" for="timg">Replace image</label>
    <input id="timg" type="file" accept="image/*" class="form-control form-control-sm" onchange={replaceImage} />
  </div>
{/snippet}

<section class="mb-3">
  <h2 class="h6">Tokens</h2>

  {#if selected}
    <div class="card card-body p-2 mb-2">
      {#if dm}
        {@render nameField()}
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
          <input class="form-check-input" type="checkbox" id="tanyone" checked={!!selected.anyone_can_move} onchange={(e) => patch({ anyone_can_move: e.currentTarget.checked })} />
          <label class="form-check-label" for="tanyone">🔓 Anyone can move</label>
        </div>
        <div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" id="tdead" checked={selected.deceased} onchange={(e) => patch({ deceased: e.currentTarget.checked })} />
          <label class="form-check-label" for="tdead">💀 Fallen</label>
        </div>
        <div class="mb-1">
          <div class="form-label small mb-0">👤 Assigned players</div>
          {#if game.players.length}
            <div class="border rounded px-2 py-1" style="max-height: 9rem; overflow-y: auto">
              {#each game.players as p (p.id)}
                <div class="form-check mb-0">
                  <input class="form-check-input" type="checkbox" id="towner-{p.id}" checked={owners.includes(p.id)}
                    onchange={(e) => setOwner(p.id, e.currentTarget.checked)} />
                  <label class="form-check-label small" for="towner-{p.id}">{p.name || '(unnamed)'}</label>
                </div>
              {/each}
            </div>
            <div class="form-text mt-0">
              {#if selected.anyone_can_move && ownerNames}🔓 Any player can move it. Only {ownerNames} can rename it and change its image.
              {:else if selected.anyone_can_move}🔓 Any player can move it.
              {:else if ownerNames}Only {ownerNames} (and you) can move it, rename it or change its image.
              {:else}Nobody assigned: only you can move it.{/if}
            </div>
          {:else}
            <div class="small text-muted">No player accounts yet.</div>
          {/if}
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
        {@render imageField()}
        <div class="d-flex flex-wrap gap-1">
          <button class="btn btn-sm btn-outline-secondary" onclick={clone} disabled={cloning}>Clone token</button>
          <button class="btn btn-sm btn-outline-danger" onclick={remove}>Delete token</button>
          <button class="btn btn-sm btn-outline-primary" onclick={toggleInitiative}>{inInitiative ? 'Remove from initiative' : 'Add to initiative'}</button>
        </div>
      {:else if canRestyleToken(selected)}
        <!-- an assigned player: their own character, so they can rename it and change its picture -->
        {@render nameField()}
        {@render imageField()}
        <div class="small text-muted">{selected.deceased ? '💀 Fallen. ' : ''}Drag to move.</div>
      {:else}
        <strong>{selected.deceased ? '💀 ' : ''}{selected.name}</strong>
        <div class="small text-muted">{canMoveToken(selected) ? 'Drag to move.' : ownerNames ? `Only ${ownerNames} (& the DM) can move this token.` : 'Only the DM can move this token.'}</div>
      {/if}
    </div>
  {:else if several}
    <div class="card card-body p-2 mb-2">
      <div class="small fw-bold mb-1">{chosen.length} tokens selected</div>
      {#if dm}
        <!-- plain checkboxes, not switches: Bootstrap's switch has no look for "mixed" -->
        {#each FLAGS as f (f.key)}
          {@const n = countOn((t) => !!t[f.key])}
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="tm-{f.key}" checked={n === chosen.length} use:mixed={n > 0 && n < chosen.length}
              onchange={(e) => setFlagAll(f.key, e.currentTarget.checked)} />
            <label class="form-check-label" for="tm-{f.key}">{f.label}{#if n > 0 && n < chosen.length}<span class="text-muted small ms-1">({n} of {chosen.length})</span>{/if}</label>
          </div>
        {/each}
        {#if game.players.length}
          <div class="mb-1">
            <div class="form-label small mb-0">👤 Assigned players</div>
            <div class="border rounded px-2 py-1" style="max-height: 9rem; overflow-y: auto">
              {#each game.players as p (p.id)}
                {@const n = countOn((t) => (t.owners || []).includes(p.id))}
                <div class="form-check mb-0">
                  <input class="form-check-input" type="checkbox" id="tmowner-{p.id}" checked={n === chosen.length} use:mixed={n > 0 && n < chosen.length}
                    onchange={(e) => setOwnerAll(p.id, e.currentTarget.checked)} />
                  <label class="form-check-label small" for="tmowner-{p.id}">{p.name || '(unnamed)'}{#if n > 0 && n < chosen.length}<span class="text-muted ms-1">({n} of {chosen.length})</span>{/if}</label>
                </div>
              {/each}
            </div>
          </div>
        {/if}
        <div class="form-text mt-0 mb-1">A dash means only some of them have it. Clicking it ticks it for all.</div>
        <div class="mb-1">
          <label class="form-label small mb-0" for="tmmap">Move all to map</label>
          <select id="tmmap" class="form-select form-select-sm" value="" onchange={(e) => moveAllToMap(e.currentTarget.value)}>
            <option value="" disabled>Choose…</option>
            {#each game.maps.filter((m) => m.id !== map?.id) as m (m.id)}
              <option value={m.id}>{m.name}</option>
            {/each}
          </select>
        </div>
        <div class="d-flex flex-wrap gap-1">
          <button class="btn btn-sm btn-outline-danger" onclick={removeAll}>Delete {chosen.length} tokens</button>
          <button class="btn btn-sm btn-outline-primary" onclick={addAllToInitiative}>Add to initiative</button>
        </div>
      {:else}
        <div class="small text-muted">Drag one to move them together (the ones you can move).</div>
      {/if}
    </div>
  {/if}

  <ul class="list-group list-group-flush mb-2">
    {#each list as t (t.id)}
      <li class="list-group-item list-group-item-action px-1 py-1 small" class:active={isSelected('tokens', t.id)}>
        <button class="btn btn-link btn-sm p-0 text-reset text-decoration-none" title="Shift+click to select several" onclick={(e) => pick('tokens', t.id, e)}>
          {t.hidden ? '👻 ' : ''}{t.anyone_can_move ? '🔓 ' : ''}{dm && t.owners?.length ? '👤 ' : ''}{t.deceased ? '💀 ' : ''}{t.name || '(unnamed)'}
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
        <input class="form-check-input" type="checkbox" id="ntanyone" bind:checked={nt.anyone_can_move} />
        <label class="form-check-label small" for="ntanyone">Anyone can move</label>
      </div>
      <button class="btn btn-sm btn-primary" disabled={busy}>Add to map</button>
    </form>
  {/if}
</section>
