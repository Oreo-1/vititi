<script>
  // Turn order, HSR style: the bottom entry is acting now, and Next sends it to the back of
  // the queue, which is the top of the list. The DM can drag an entry up or down (action
  // advance / delay); players just watch. The stored order is unchanged (index 0 = acting
  // now); only the display is reversed.
  import { untrack } from 'svelte';
  import { flip } from 'svelte/animate';
  import { cubicIn, cubicOut } from 'svelte/easing';
  import { isDM } from '../lib/auth.svelte.js';
  import { game, initiativeOrder, nextTurn, moveInitiative, removeFromInitiative, addToInitiative, clearInitiative, sortByName } from '../lib/game.svelte.js';
  import { ui, selectOnly } from '../lib/ui.svelte.js';
  import { fileUrl } from '../lib/pb.js';

  let dm = $derived(isDM());

  // ---- Next animation. When the order changes by exactly one Next (the first entry moved to
  // the end), here or on the DM's screen, that token gets a new key: its old card swipes out
  // to the left and fades, then a new card comes in at the top while the rest slide down.
  const SWIPE_MS = 250;
  let gens = {}; // token id → how many times it went round (part of its key)
  let prevIds = [];
  let skipIds = null; // an order we set by dragging, which shouldn't count as a Next
  let rotatedAt = -Infinity;

  function isRotation(a, b) {
    return a.length > 1 && a.length === b.length && b[b.length - 1] === a[0] && a.every((id, i) => i === 0 || b[i - 1] === id);
  }

  // Each entry with its live token, when that token is loaded (it's on the map being viewed).
  let entries = $derived.by(() => {
    const order = initiativeOrder();
    const ids = order.map((e) => e.token);
    const joined = ids.join();
    if (joined !== prevIds.join()) {
      if (joined !== skipIds && isRotation(prevIds, ids)) {
        gens[prevIds[0]] = (gens[prevIds[0]] || 0) + 1;
        rotatedAt = performance.now();
      }
      skipIds = null;
      prevIds = ids;
    }
    return order.map((e) => ({ ...e, key: `${e.token}#${gens[e.token] || 0}`, t: game.tokens.find((t) => t.id === e.token) || null }));
  });
  // Players only see tokens they could see on the map. Shown bottom-up: the last row acts now.
  let shown = $derived((dm ? entries : entries.filter((e) => e.t && !e.t.hidden)).slice().reverse());

  // the parts of a Next wait for the swipe out; other changes (drag, add, remove) don't
  const afterSwipe = () => (performance.now() - rotatedAt < 100 ? SWIPE_MS : 0);

  function swipeOut(node) {
    if (ghost) node.classList.remove('vtt-initiative-current'); // the ghost carries the highlight away
    return { duration: SWIPE_MS, easing: cubicIn, css: (t, u) => `translate: ${-u * 100}% 0; opacity: ${t}` };
  }
  function swipeIn() {
    return { delay: afterSwipe(), duration: SWIPE_MS, easing: cubicOut, css: (t, u) => `translate: ${-u * 100}% 0; opacity: ${t}` };
  }
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
    if (d.to === d.from) return;
    // rows are shown reversed, so count positions from the other end of the stored order
    const n = shown.length;
    const from = n - 1 - d.from, to = n - 1 - d.to;
    const ids = initiativeOrder().map((e) => e.token);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    skipIds = ids.join(); // dragging the acting token to the top is a move, not a Next
    moveInitiative(from, to).catch(report);
  }

  function select(entry) {
    if (performance.now() - dragEndedAt < 300) return; // the click that ends a drag
    if (!entry.t) return;
    selectOnly({ tokens: [entry.t.id] });
  }

  function report(err) {
    alert('Could not update the turn order: ' + (err?.message || err));
  }

  function onKey(e) {
    if (e.key === 'Escape' && drag) cancelDrag();
  }

  $effect(() => stopFollowing); // unmounting mid-drag

  // keep the acting token (the bottom row) in view when the list scrolls
  let listEl = $state();

  // ---- On a Next the highlight moves up from the leaving row to the next token while the
  // leaving card swipes out; then the rows slide down, taking it to the bottom. A "ghost"
  // highlight drawn behind the rows does the move; the next row gets its own highlight when
  // the ghost arrives, which is when the rows start sliding.
  let ghost = $state(null); // { top, height, dy, height2 } in list px
  let lateCurrent = $state(null); // key of the row whose highlight waits for the ghost
  let prevLastKey = null;

  // runs before the DOM updates, so the rows are still where they were
  $effect.pre(() => {
    const lastKey = shown[shown.length - 1]?.key;
    untrack(() => {
      const old = prevLastKey;
      prevLastKey = lastKey;
      if (!listEl || !old || !lastKey || lastKey === old || !afterSwipe()) return;
      if (shown.some((e) => e.key === old)) return; // the old current row is still here: not a Next
      const from = listEl.querySelector(`:scope > li[data-key="${old}"]`);
      const to = listEl.querySelector(`:scope > li[data-key="${lastKey}"]`);
      if (!from || !to) return;
      ghost = { top: from.offsetTop, height: from.offsetHeight, dy: to.offsetTop - from.offsetTop, height2: to.offsetHeight };
      lateCurrent = lastKey;
    });
  });

  function slideGhost(el, g) {
    const a = el.animate(
      [{ translate: '0 0', height: `${g.height}px` }, { translate: `0 ${g.dy}px`, height: `${g.height2}px` }],
      { duration: SWIPE_MS, easing: 'ease-in-out', fill: 'forwards' }
    );
    a.onfinish = () => {
      ghost = null;
      lateCurrent = null;
    };
    return () => a.cancel();
  }
  $effect(() => {
    shown[shown.length - 1]?.key; // whenever someone else is up
    if (listEl && !untrack(() => drag)) listEl.scrollTop = listEl.scrollHeight;
  });
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
      <ul class="list-group list-group-flush vtt-initiative-list" class:vtt-initiative-ghosting={ghost} bind:this={listEl}>
        {#if ghost}
          {@const g = ghost}
          <li class="vtt-initiative-ghost" aria-hidden="true" style:top="{g.top}px" style:height="{g.height}px" {@attach (el) => slideGhost(el, g)}></li>
        {/if}
        {#each rows as entry, i (entry.key)}
          {@const t = entry.t}
          {@const current = i === rows.length - 1 && entry.key !== lateCurrent}
          <!-- dragging is a pointer-only extra; selecting works from the keyboard through the button -->
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <li
            class="list-group-item d-flex align-items-center gap-2 px-2 py-1 small"
            data-key={entry.key}
            class:vtt-initiative-current={current}
            class:vtt-initiative-dragging={drag?.moved && entry === shown[drag.from]}
            class:token-hidden={t?.hidden}
            class:token-deceased={t?.deceased}
            style:cursor={dm ? 'grab' : null}
            animate:flip={{ duration: 150, delay: afterSwipe() }}
            in:swipeIn
            out:swipeOut
            onpointerdown={(e) => onRowDown(e, i)}
          >
            <span class="vtt-initiative-marker">{current ? '▶' : ''}</span>
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
    position: relative; /* a card swiping out is laid over the list */
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }
  /* while the ghost highlight moves, rows are see-through so it shows behind them (only
     then: otherwise rows sliding past each other would show through one another) */
  .vtt-initiative-list.vtt-initiative-ghosting > li {
    background-color: transparent;
  }
  .vtt-initiative-list > li {
    /* Separators are drawn as a shadow, not Bootstrap's border (which the last row
       doesn't get): a card swiping out is still the last element for a moment, and a
       border would change the rows' heights mid-animation and make the list jump. */
    border-width: 0;
  }
  .vtt-initiative-list > li:not(:last-child, .vtt-initiative-ghost) {
    box-shadow: inset 0 -1px var(--bs-list-group-border-color);
  }
  .vtt-initiative-list > li.vtt-initiative-current {
    background: var(--bs-primary-bg-subtle);
    font-weight: 600;
  }
  .vtt-initiative-list > li.vtt-initiative-ghost {
    position: absolute;
    left: 0;
    right: 0;
    background: var(--bs-primary-bg-subtle);
    pointer-events: none;
  }
  .vtt-initiative-list > li.vtt-initiative-dragging {
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
