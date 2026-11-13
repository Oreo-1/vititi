<script>
  // Turn order, HSR style: the top entry is acting now, and Next sends it to the back.
  // The DM can drag an entry up or down (action advance / delay); players just watch.
  import { flip } from 'svelte/animate';
  import { isDM } from '../lib/auth.svelte.js';
  import { game, initiativeOrder, nextTurn, moveInitiative, removeFromInitiative, addToInitiative, clearInitiative, sortByName } from '../lib/game.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { fileUrl } from '../lib/pb.js';

  let dm = $derived(isDM());

  // Each entry with its live token, when that token is loaded (it's on the map being viewed).
  let entries = $derived(initiativeOrder().map((e) => ({ ...e, t: game.tokens.find((t) => t.id === e.token) || null })));
  // Players only see tokens they could see on the map.
  let shown = $derived(dm ? entries : entries.filter((e) => e.t && !e.t.hidden));
  // in the same A–Z order as the sidebar's token list
  let addable = $derived(sortByName(game.tokens.filter((t) => !entries.some((e) => e.token === t.id))));

  // ---- drag to reorder (DM only). Pointer events rather than HTML drag and drop, so it
  // works on touch and never reaches the map's file drop.
  let drag = $state(null); // { from, to, startY, mids, moved }
  let dragEndedAt = 0;

  let rows = $derived.by(() => {
    if (!drag?.moved) return shown;
    const list = [...shown];
    const [moved] = list.splice(drag.from, 1);
    list.splice(drag.to, 0, moved);
    return list;
  });

  // Moves and the release are followed on the window: the rows get reordered in the page
  // while dragging, and a moved element loses any pointer capture.
  function onRowDown(e, i) {
    if (!dm || e.button !== 0) return;
    const mids = [...e.currentTarget.parentElement.children].map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    drag = { from: i, to: i, startY: e.clientY, mids, moved: false, pointerId: e.pointerId };
    window.addEventListener('pointermove', onRowMove);
    window.addEventListener('pointerup', onRowUp);
    window.addEventListener('pointercancel', cancelDrag);
  }

  function stopFollowing() {
    window.removeEventListener('pointermove', onRowMove);
    window.removeEventListener('pointerup', onRowUp);
    window.removeEventListener('pointercancel', cancelDrag);
  }

  function cancelDrag() {
    drag = null;
    stopFollowing();
  }

  function onRowMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    if (!drag.moved && Math.abs(e.clientY - drag.startY) < 4) return; // a plain click still selects
    drag.moved = true;
    // new position = how many of the other rows are above the pointer
    drag.to = drag.mids.filter((m, j) => j !== drag.from && e.clientY > m).length;
  }

  function onRowUp(e) {
    if (drag && e.pointerId !== drag.pointerId) return;
    const d = drag;
    cancelDrag();
    if (!d?.moved) return;
    dragEndedAt = performance.now();
    if (d.to !== d.from) moveInitiative(d.from, d.to).catch(report);
  }

  function select(entry) {
    if (performance.now() - dragEndedAt < 300) return; // the click that ends a drag
    if (!entry.t) return;
    ui.selectedTokenId = entry.t.id;
    ui.selectedDrawingId = '';
  }

  function report(err) {
    alert('Could not update the turn order: ' + (err?.message || err));
  }

  function onKey(e) {
    if (e.key === 'Escape' && drag) cancelDrag();
  }

  $effect(() => stopFollowing); // unmounting mid-drag
</script>

<svelte:window onkeydown={onKey} />

{#if dm || shown.length}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="vtt-initiative card position-absolute bottom-0 start-0 m-2 shadow-sm"
    onpointerdown={(e) => e.stopPropagation()}
    onwheel={(e) => e.stopPropagation()}
  >
    <div class="card-header d-flex align-items-center gap-2 px-2 py-1">
      <strong class="small flex-grow-1">Initiative</strong>
      <button class="btn btn-sm p-0 border-0 lh-1" title={ui.initiativeOpen ? 'Collapse' : 'Expand'} aria-label={ui.initiativeOpen ? 'Collapse' : 'Expand'} aria-expanded={ui.initiativeOpen}
        onclick={() => (ui.initiativeOpen = !ui.initiativeOpen)}>{ui.initiativeOpen ? '▾' : '▸'}</button>
    </div>

    {#if ui.initiativeOpen}
      <ul class="list-group list-group-flush vtt-initiative-list">
        {#each rows as entry, i (entry.token)}
          {@const t = entry.t}
          <!-- dragging is a pointer-only extra; selecting works from the keyboard through the button -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="list-group-item d-flex align-items-center gap-2 px-2 py-1 small"
            class:vtt-initiative-current={i === 0}
            class:vtt-initiative-dragging={drag?.moved && entry === shown[drag.from]}
            class:token-hidden={t?.hidden}
            class:token-deceased={t?.deceased}
            style:cursor={dm ? 'grab' : null}
            animate:flip={{ duration: 150 }}
            onpointerdown={(e) => onRowDown(e, i)}
          >
            <span class="vtt-initiative-marker">{i === 0 ? '▶' : ''}</span>
            <button class="btn btn-link btn-sm p-0 text-reset text-decoration-none d-flex align-items-center gap-2 flex-grow-1 text-start" style="min-width:0" style:cursor={dm ? 'inherit' : t ? 'pointer' : 'default'}
              title={t ? null : 'Not on this map'} onclick={() => select(entry)}>
              <span class="vtt-initiative-portrait vtt-token-body flex-shrink-0">
                {#if t?.image}
                  <img src={fileUrl(t, t.image)} alt="" draggable="false" />
                {:else}
                  {((t?.name ?? entry.name) || '?')[0]}
                {/if}
              </span>
              <span class="text-truncate" class:text-muted={!t}>
                {t?.hidden ? '👻 ' : ''}{t?.deceased ? '💀 ' : ''}{(t?.name ?? entry.name) || '(unnamed)'}
              </span>
            </button>
            {#if dm}
              <button class="btn btn-sm p-0 border-0 lh-1 text-danger" title="Remove from initiative" aria-label="Remove {(t?.name ?? entry.name) || 'token'} from initiative"
                onpointerdown={(e) => e.stopPropagation()}
                onclick={(e) => { e.stopPropagation(); removeFromInitiative(entry.token).catch(report); }}>×</button>
            {/if}
          </li>
        {:else}
          <li class="list-group-item small text-muted px-2 py-1">Empty. Add tokens to start.</li>
        {/each}
      </ul>

      {#if dm}
        <div class="card-footer d-flex gap-1 px-2 py-1 text-nowrap">
          <button class="btn btn-sm btn-primary py-0" disabled={!entries.length} onclick={() => nextTurn().catch(report)}>Next ▶</button>
          <button class="btn btn-sm btn-outline-secondary py-0" disabled={!addable.length} title="Add every token on this map"
            onclick={() => addToInitiative(addable).catch(report)}>+ Add all</button>
          <button class="btn btn-sm btn-outline-danger py-0 ms-auto" disabled={!entries.length}
            onclick={() => confirm('Clear the turn order?') && clearInitiative().catch(report)}>Clear</button>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .vtt-initiative {
    width: 240px;
    max-height: calc(100% - 4rem); /* stays clear of the Fit map button */
    display: flex;
    flex-direction: column;
    opacity: 1;
    touch-action: none;
    cursor: default; /* don't inherit the map's pan / tool cursor */
  }
  .vtt-initiative-list {
    overflow-y: auto;
    min-height: 0;
  }
  .vtt-initiative-current {
    background: var(--bs-primary-bg-subtle);
    font-weight: 600;
  }
  .vtt-initiative-dragging {
    box-shadow: 0 0 0 2px var(--bs-primary) inset;
    z-index: 1;
  }
  .vtt-initiative-marker {
    width: 0.8em;
    color: var(--bs-primary);
  }
  .vtt-initiative-portrait {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    overflow: hidden;
    background: #6c757d;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1rem;
  }
  .vtt-initiative-portrait img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>
