<script>
  import { isDM } from '../lib/auth.svelte.js';
  import { game, currentMap, createToken, cloneToken, updateToken, deleteToken, initiativeOrder, addToInitiative, removeFromInitiative, sortByName, canMoveToken, canRestyleToken } from '../lib/game.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { snapToken } from '../lib/geometry.js';

  let map = $derived(currentMap());
  let dm = $derived(isDM());
  let list = $derived(sortByName(game.tokens.filter((t) => dm || !t.hidden)));
  let selected = $derived(list.find((t) => t.id === ui.selectedTokenId) || null);
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
      ui.selectedTokenId = rec.id;
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
    ui.selectedTokenId = '';
    await updateToken(id, { map: mapId, x: c.x, y: c.y });
  }

  let cloning = $state(false);

  async function clone() {
    cloning = true;
    try {
      const rec = await cloneToken(selected);
      ui.selectedTokenId = rec.id;
    } catch (err) {
      alert(err?.message || err);
    } finally {
      cloning = false;
    }
  }

  async function remove() {
    if (confirm(`Delete token "${selected.name}"?`)) {
      const id = selected.id;
      ui.selectedTokenId = '';
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
  {/if}

  <ul class="list-group list-group-flush mb-2">
    {#each list as t (t.id)}
      <li class="list-group-item list-group-item-action px-1 py-1 small" class:active={ui.selectedTokenId === t.id}>
        <button class="btn btn-link btn-sm p-0 text-reset text-decoration-none" onclick={() => (ui.selectedTokenId = t.id)}>
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
