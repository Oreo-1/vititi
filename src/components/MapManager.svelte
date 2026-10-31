<script>
  import { game, createMap, deleteMap, setActiveMap, setViewMap } from '../lib/game.svelte.js';
  import { fileUrl } from '../lib/pb.js';

  let over = $state(false);
  let busy = $state(false);
  let error = $state('');

  async function upload(files) {
    error = '';
    busy = true;
    try {
      for (const f of files) if (f.type.startsWith('image/')) await createMap(f);
    } catch (e) {
      error = e?.message || String(e);
    } finally {
      busy = false;
    }
  }

  function onDrop(e) {
    e.preventDefault();
    over = false;
    upload([...e.dataTransfer.files]);
  }

  async function remove(m) {
    if (confirm(`Delete map "${m.name}" and all its tokens and drawings?`)) await deleteMap(m.id);
  }
</script>

<section class="mb-3">
  <h2 class="h6">Maps</h2>

  <div
    class="drop-zone mb-2"
    class:over
    role="region"
    aria-label="Drop map images here"
    ondragover={(e) => { e.preventDefault(); over = true; }}
    ondragleave={() => (over = false)}
    ondrop={onDrop}
  >
    <div class="small mb-1">Drop map image(s) here or</div>
    <input type="file" accept="image/*" multiple class="form-control form-control-sm" disabled={busy}
      onchange={(e) => { upload([...e.currentTarget.files]); e.currentTarget.value = ''; }} />
    {#if busy}<div class="small mt-1">Uploading…</div>{/if}
  </div>
  {#if error}<div class="alert alert-danger py-1 small">{error}</div>{/if}

  <ul class="list-group list-group-flush">
    {#each game.maps as m (m.id)}
      <li class="list-group-item px-1" class:active={game.viewMapId === m.id}>
        <div class="d-flex align-items-center gap-2">
          <img src={fileUrl(m, m.image, '100x100')} alt="" width="40" height="40" style="object-fit:cover" />
          <div class="flex-grow-1 text-truncate">
            {m.name}
            {#if game.state?.active_map === m.id}<span class="badge text-bg-success ms-1">Players</span>{/if}
          </div>
        </div>
        <div class="btn-group btn-group-sm mt-1">
          <button class="btn btn-outline-secondary" onclick={() => setViewMap(m.id)} disabled={game.viewMapId === m.id}>View</button>
          <button class="btn btn-outline-success" onclick={() => setActiveMap(m.id)} disabled={game.state?.active_map === m.id}>Move players here</button>
          <button class="btn btn-outline-danger" onclick={() => remove(m)}>Delete</button>
        </div>
      </li>
    {:else}
      <li class="list-group-item small text-muted">No maps yet.</li>
    {/each}
  </ul>
</section>
