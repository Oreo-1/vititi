<script>
  // The interactive viewport: camera, layers, and all pointer tools.
  import { untrack } from 'svelte';
  import {
    game, currentMap, fogOf, addFogOp, canMoveToken, canEditDrawing, canDeleteDrawing,
    beginDrag, endDrag, moveTokenLocal, queueTokenUpdate,
    beginDrawingDrag, endDrawingDrag, moveDrawingLocal, queueDrawingUpdate,
    createDrawing, deleteDrawing, createToken, deleteToken,
  } from '../lib/game.svelte.js';
  import { isDM } from '../lib/auth.svelte.js';
  import { ui, selectOnly, clearSelection, toggleSelected, isSelected, isAdditive } from '../lib/ui.svelte.js';
  import { fileUrl } from '../lib/pb.js';
  import * as G from '../lib/geometry.js';
  import Grid from './Grid.svelte';
  import Fog from './Fog.svelte';
  import Token from './Token.svelte';
  import Drawing from './Drawing.svelte';
  import DrawingHandles from './DrawingHandles.svelte';
  import Ruler from './Ruler.svelte';
  import InitiativeTracker from './InitiativeTracker.svelte';

  let el;
  let cw = $state(0);
  let ch = $state(0);
  let cam = $state({ x: 0, y: 0, zoom: 1 });

  let map = $derived(currentMap());
  let dm = $derived(isDM());
  let fog = $derived(fogOf(map));
  let W = $derived(map?.width || 1000);
  let H = $derived(map?.height || 1000);
  // Hidden tokens are simply not rendered for players (equivalent to display:none).
  let visibleTokens = $derived(game.tokens.filter((t) => dm || !t.hidden));

  // Stacking: SVG paints later elements on top, so tokens are drawn in the order they were last
  // selected on their own, the latest last. Selecting a single token brings it to the front, and
  // it stays there after it's deselected, until another one is selected. Selecting several
  // (box, Shift+click) changes nothing, and neither does Shift+clicking a group down to one token.
  // Tokens never selected keep their usual order underneath. Local to this browser.
  let raised = $state([]);
  let prevSel = []; // selection last time, to tell a fresh pick from what's left of a group
  $effect(() => {
    const sel = [...ui.selection.tokens];
    const fresh = sel.length === 1 && !prevSel.includes(sel[0]);
    prevSel = sel;
    if (fresh) untrack(() => { raised = [...raised.filter((id) => id !== sel[0]), sel[0]]; });
  });
  let stackedTokens = $derived.by(() => {
    const rank = new Map(raised.map((id, i) => [id, i]));
    return [...visibleTokens].sort((a, b) => (rank.get(a.id) ?? -1) - (rank.get(b.id) ?? -1));
  });
  // resize/rotate handles only when that one drawing is all that's selected
  let selectedDrawing = $derived(
    ui.selection.drawings.length === 1 && !ui.selection.tokens.length
      ? game.drawings.find((d) => d.id === ui.selection.drawings[0])
      : null
  );

  let action = null; // current drag interaction (non-reactive)
  let preview = $state(null); // in-progress shape {kind, shape?, x1, y1, x2, y2}; kind 'marquee' = selection box
  let spaceDown = $state(false);
  let panning = $state(false);

  // ---------- camera ----------
  let fittedFor = '';
  $effect(() => {
    if (map && cw && ch && fittedFor !== map.id) {
      fittedFor = map.id;
      clearSelection(); // ids from the previous map
      fit();
    }
  });

  function fit() {
    if (!map) return;
    const z = Math.min(cw / W, ch / H) * 0.95 || 1;
    cam = { zoom: z, x: (cw - W * z) / 2, y: (ch - H * z) / 2 };
  }

  function toWorld(e) {
    const r = el.getBoundingClientRect();
    return { x: (e.clientX - r.left - cam.x) / cam.zoom, y: (e.clientY - r.top - cam.y) / cam.zoom };
  }

  function onWheel(e) {
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const z = Math.min(10, Math.max(0.05, cam.zoom * Math.exp(-e.deltaY * 0.0015)));
    const k = z / cam.zoom;
    cam = { zoom: z, x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k };
  }

  // wheel must be non-passive so we can preventDefault page scroll
  $effect(() => {
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // ---------- pointer tools ----------
  function snapFor(kind, p) {
    if (!ui.snap || !map) return p;
    if (kind === 'measure') return G.snapCenter(map, p.x, p.y);
    return G.snapCorner(map, p.x, p.y); // aoe origin, rectangle corners, fog
  }

  function onPointerDown(e) {
    if (!map) return;
    el.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    if (e.button === 1 || e.button === 2 || spaceDown) {
      action = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
      panning = true;
      return;
    }
    if (e.button !== 0) return;

    // Select tool on empty space: drag a selection box. A plain click just clears the selection.
    if (ui.tool === 'select') {
      const additive = isAdditive(e);
      if (!additive) clearSelection();
      action = { kind: 'marquee', additive, sx: e.clientX, sy: e.clientY, moved: false };
      preview = { kind: 'marquee', x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      return;
    }

    let kind = ui.tool;
    if (kind.startsWith('fog')) {
      if (!dm) return;
      kind = 'fog';
    }
    const s = snapFor(kind, p);
    action = { kind, mode: ui.tool === 'fog-hide' ? 'hide' : 'reveal' };
    preview = { kind, x1: s.x, y1: s.y, x2: s.x, y2: s.y };
    if (kind === 'aoe') preview.shape = ui.aoeShape; // fixed for this drag
  }

  // Pressing on a token or drawing. With Shift/Ctrl/Cmd it toggles the item in the selection.
  // Otherwise it selects just that item, unless it's already selected: then the whole
  // selection is dragged together.
  function onItemDown(e, kind, item, canMove) {
    if (e.button !== 0 || ui.tool !== 'select' || spaceDown) return false; // let it bubble (pan / tools)
    e.stopPropagation();
    if (isAdditive(e)) {
      toggleSelected(kind, item.id);
      return false;
    }
    if (!isSelected(kind, item.id)) selectOnly({ [kind]: [item.id] });
    return canMove;
  }

  function onTokenDown(e, t) {
    if (onItemDown(e, 'tokens', t, canMoveToken(t))) startGroupMove(e, { type: 'token', id: t.id });
  }

  function onDrawingDown(e, d) {
    if (onItemDown(e, 'drawings', d, canEditDrawing(d))) startGroupMove(e, { type: 'drawing', id: d.id });
  }

  // ---------- moving the selection ----------
  // Everything selected that you may move goes along, by the same offset. With snap on, the
  // grabbed item snaps (a token on release, a drawing while dragging) and the rest follow it.

  function startGroupMove(e, grab) {
    const tokens = visibleTokens.filter((t) => isSelected('tokens', t.id) && canMoveToken(t));
    const drawings = game.drawings.filter((d) => isSelected('drawings', d.id) && canEditDrawing(d));
    el.setPointerCapture(e.pointerId);
    for (const t of tokens) beginDrag(t.id);
    for (const d of drawings) beginDrawingDrag(d.id);
    action = {
      kind: 'group',
      grab,
      start: toWorld(e),
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      raw: { dx: 0, dy: 0 },
      last: { dx: 0, dy: 0 },
      tokens: tokens.map((t) => ({ id: t.id, x: t.x, y: t.y, size: Number(t.size) || 1 })),
      drawings: drawings.map((d) => ({ id: d.id, x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, anchor: moveAnchor(d) })),
    };
  }

  // the offset to apply, after snapping the grabbed item
  function groupDelta(a, final) {
    const { dx, dy } = a.raw;
    if (!ui.snap) return { dx, dy };
    if (a.grab.type === 'drawing') {
      const g = a.drawings.find((o) => o.id === a.grab.id);
      const s = snapFor('drawing', { x: g.anchor.x + dx, y: g.anchor.y + dy });
      return { dx: s.x - g.anchor.x, dy: s.y - g.anchor.y };
    }
    if (!final) return { dx, dy };
    const g = a.tokens.find((o) => o.id === a.grab.id);
    const s = G.snapToken(map, g.x + dx, g.y + dy, g.size);
    return { dx: s.x - g.x, dy: s.y - g.y };
  }

  function applyGroup(a, { dx, dy }, final) {
    for (const o of a.tokens) {
      let x = o.x + dx, y = o.y + dy;
      // players can't enter the fog: that token goes back to where the drag started
      if (final && !dm && G.isFogged(map, fog, x, y)) {
        x = o.x;
        y = o.y;
      }
      moveTokenLocal(o.id, x, y);
      queueTokenUpdate(o.id, { x, y }); // live sync while dragging
    }
    for (const o of a.drawings) {
      const c = { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
      moveDrawingLocal(o.id, c);
      queueDrawingUpdate(o.id, c);
    }
  }

  function updateGroupMove(a, e) {
    // ignore the tiny jitter of a plain click, so selecting never nudges or re-snaps anything
    if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 3) return;
    a.moved = true;
    const p = toWorld(e);
    a.raw = { dx: p.x - a.start.x, dy: p.y - a.start.y };
    const d = groupDelta(a, false);
    if (a.grab.type === 'token') {
      // ruler: how far the grabbed token has moved
      const g = a.tokens.find((o) => o.id === a.grab.id);
      preview = { kind: 'measure', x1: g.x, y1: g.y, x2: g.x + d.dx, y2: g.y + d.dy };
    }
    if (d.dx === a.last.dx && d.dy === a.last.dy) return;
    a.last = d;
    applyGroup(a, d, false);
  }

  function endGroupMove(a) {
    for (const o of a.tokens) endDrag(o.id);
    for (const o of a.drawings) endDrawingDrag(o.id);
  }

  function cancelGroupMove(a) {
    if (a.moved) applyGroup(a, { dx: 0, dy: 0 }, false);
    endGroupMove(a);
  }

  // ---------- selection box ----------
  // Picks what you could drag: tokens by their centre, circles by their origin, rectangles by their centre.
  function marqueeHits(pv) {
    const r = G.rectFromPoints(pv.x1, pv.y1, pv.x2, pv.y2);
    const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const point = (d) => (G.isRect(d) ? [(d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2] : [d.x1, d.y1]);
    return {
      tokens: visibleTokens.filter((t) => canMoveToken(t) && inside(t.x, t.y)).map((t) => t.id),
      drawings: game.drawings.filter((d) => canEditDrawing(d) && inside(...point(d))).map((d) => d.id),
    };
  }

  function finishMarquee(a, pv) {
    if (!a.moved) return; // a plain click: the selection was already cleared
    const hits = marqueeHits(pv);
    if (!a.additive) return selectOnly(hits);
    selectOnly({
      tokens: [...new Set([...ui.selection.tokens, ...hits.tokens])],
      drawings: [...new Set([...ui.selection.drawings, ...hits.drawings])],
    });
  }

  function onHandleDown(e, d, h) {
    if (e.button !== 0 || spaceDown) return;
    e.stopPropagation();
    if (h.rotate) startDrawingEdit(e, d, { mode: 'rotate' });
    else startDrawingEdit(e, d, G.isRect(d) ? { mode: 'corner', ax: h.ax, ay: h.ay } : { mode: 'radius' });
  }

  function startDrawingEdit(e, d, edit) {
    el.setPointerCapture(e.pointerId);
    beginDrawingDrag(d.id);
    action = {
      kind: 'drawing',
      id: d.id,
      orig: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2, rotation: G.rotationOf(d) },
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      ...edit,
    };
  }

  // AoE edge point for pointer p. With snap on, the radius snaps to 5 ft steps; the direction is kept.
  function aoeEnd(ox, oy, p) {
    if (!ui.snap) return p;
    const dx = p.x - ox, dy = p.y - oy;
    const len = Math.hypot(dx, dy) || 1;
    const ft = Math.max(G.FT_PER_CELL, Math.round(G.pxToFt(map, len) / G.FT_PER_CELL) * G.FT_PER_CELL);
    const rpx = G.ftToPx(map, ft);
    return { x: ox + (dx / len) * rpx, y: oy + (dy / len) * rpx };
  }

  // The point that snaps to the grid when moving a drawing: an AoE's origin, or the
  // top-left of a rectangle's outline as drawn (so a rotated one still lines up).
  function moveAnchor(d) {
    if (!G.isRect(d)) return { x: d.x1, y: d.y1 };
    const c = G.rectCorners(d);
    return { x: Math.min(...c.map((p) => p.x)), y: Math.min(...c.map((p) => p.y)) };
  }

  // Snap a length in px to whole 5 ft steps, keeping its sign.
  function snapLength(px) {
    const ft = Math.max(G.FT_PER_CELL, Math.round(G.pxToFt(map, Math.abs(px)) / G.FT_PER_CELL) * G.FT_PER_CELL);
    return Math.sign(px || 1) * G.ftToPx(map, ft);
  }

  const ROTATE_SNAP = 15; // degrees per step when Snap to grid is on

  // New coordinates for the drawing being edited, or null if the pointer would shrink it away.
  function editedCoords(a, p) {
    const { x1, y1, x2, y2, rotation: rot } = a.orig;
    const min = G.ftToPx(map, 1);
    if (a.mode === 'radius') {
      const q = aoeEnd(x1, y1, p);
      return Math.hypot(q.x - x1, q.y - y1) < min ? null : { x2: q.x, y2: q.y };
    }
    if (a.mode === 'rotate') {
      // pointer angle around the centre; the handle starts straight up, at 0°
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const deg = (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI + 90;
      const step = ui.snap ? ROTATE_SNAP : 1;
      return { rotation: (((Math.round(deg / step) * step) % 360) + 360) % 360 };
    }
    // corner: the opposite corner (ax, ay) stays put. Work in the rectangle's own (unrotated) frame.
    const A = { x: a.ax, y: a.ay };
    const square = rot % 90 === 0; // its edges follow the grid, so the corner can snap to it
    const q = square ? snapFor('drawing', p) : p;
    let { x: w, y: h } = G.rotatePoint(q.x, q.y, A.x, A.y, -rot);
    w -= A.x;
    h -= A.y;
    if (!square && ui.snap) { w = snapLength(w); h = snapLength(h); } // otherwise snap its size to 5 ft steps
    if (Math.abs(w) < min || Math.abs(h) < min) return null;
    const Q = G.rotatePoint(A.x + w, A.y + h, A.x, A.y, rot); // dragged corner, back in world space
    const cx = (A.x + Q.x) / 2, cy = (A.y + Q.y) / 2;
    return { x1: cx - Math.abs(w) / 2, y1: cy - Math.abs(h) / 2, x2: cx + Math.abs(w) / 2, y2: cy + Math.abs(h) / 2 };
  }

  function updateDrawingEdit(a, e) {
    // ignore the tiny jitter of a plain click, so selecting never nudges or re-snaps a shape
    if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 3) return;
    a.moved = true;
    const next = editedCoords(a, toWorld(e));
    const d = game.drawings.find((d) => d.id === a.id);
    if (!next || !d || Object.entries(next).every(([k, v]) => d[k] === v)) return;
    moveDrawingLocal(a.id, next);
    queueDrawingUpdate(a.id, next); // live sync while dragging
  }

  function cancelDrawingEdit(a) {
    moveDrawingLocal(a.id, a.orig);
    if (a.moved) queueDrawingUpdate(a.id, a.orig);
    endDrawingDrag(a.id);
  }

  function onPointerMove(e) {
    if (!action) return;
    if (action.kind === 'pan') {
      cam.x = action.cx + e.clientX - action.sx;
      cam.y = action.cy + e.clientY - action.sy;
      return;
    }
    if (action.kind === 'drawing') {
      updateDrawingEdit(action, e);
      return;
    }
    if (action.kind === 'group') {
      updateGroupMove(action, e);
      return;
    }
    const p = toWorld(e);
    if (action.kind === 'marquee') {
      if (!action.moved && Math.hypot(e.clientX - action.sx, e.clientY - action.sy) < 3) return;
      action.moved = true;
      preview.x2 = p.x;
      preview.y2 = p.y;
      return;
    }
    if (!preview) return;
    // circles snap their radius; rectangles snap the dragged corner, like fog
    const q = action.kind === 'aoe' && !G.isRect(preview) ? aoeEnd(preview.x1, preview.y1, p) : snapFor(action.kind, p);
    preview.x2 = q.x;
    preview.y2 = q.y;
  }

  async function onPointerUp() {
    const a = action;
    const pv = preview;
    action = null;
    preview = null;
    panning = false;
    if (!a) return;

    if (a.kind === 'group') {
      if (a.moved) applyGroup(a, groupDelta(a, true), true);
      endGroupMove(a);
      return;
    }
    if (a.kind === 'marquee') {
      finishMarquee(a, pv);
      return;
    }
    if (a.kind === 'drawing') {
      endDrawingDrag(a.id);
      return;
    }
    if (!pv || a.kind === 'pan' || a.kind === 'measure') return;
    if (Math.hypot(pv.x2 - pv.x1, pv.y2 - pv.y1) < 2) return;

    try {
      if (a.kind === 'aoe') {
        await createDrawing({ shape: pv.shape, x1: pv.x1, y1: pv.y1, x2: pv.x2, y2: pv.y2, color: ui.color });
      } else if (a.kind === 'fog') {
        await addFogOp(map, { type: a.mode, ...G.rectFromPoints(pv.x1, pv.y1, pv.x2, pv.y2) });
      }
    } catch (err) {
      console.error(err);
      alert('Could not save: ' + (err?.message || err));
    }
  }

  // ---------- keyboard ----------
  function isTyping(e) {
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName) || e.target?.isContentEditable;
  }

  async function onKeyDown(e) {
    if (isTyping(e)) return;
    if (e.code === 'Space') {
      spaceDown = true;
      e.preventDefault();
    } else if (e.key === 'Escape') {
      preview = null;
      if (action?.kind === 'drawing') cancelDrawingEdit(action);
      if (action?.kind === 'group') cancelGroupMove(action);
      action = null;
      panning = false;
      clearSelection();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (action) return; // not in the middle of a drag
      const drawings = game.drawings.filter((d) => isSelected('drawings', d.id) && canDeleteDrawing(d));
      const tokens = dm ? game.tokens.filter((t) => isSelected('tokens', t.id)) : [];
      if (!drawings.length && !tokens.length) return;
      // areas go without asking, as before; deleting tokens is confirmed
      if (tokens.length) {
        const what = tokens.length === 1 ? `token "${tokens[0].name}"` : `${tokens.length} tokens`;
        const extra = drawings.length ? ` and ${drawings.length} area${drawings.length === 1 ? '' : 's'}` : '';
        if (!confirm(`Delete ${what}${extra}?`)) return;
      }
      clearSelection();
      try {
        await Promise.all([...drawings.map((d) => deleteDrawing(d.id)), ...tokens.map((t) => deleteToken(t.id))]);
      } catch (err) {
        alert('Could not delete: ' + (err?.message || err));
      }
    }
  }
  function onKeyUp(e) {
    if (e.code === 'Space') spaceDown = false;
  }

  // ---------- drag & drop images onto the table => new tokens (DM) ----------
  function onDragOver(e) {
    if (dm && map) e.preventDefault();
  }
  async function onDrop(e) {
    if (!dm || !map) return;
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
    let p = toWorld(e);
    for (const file of files) {
      const s = ui.snap ? G.snapToken(map, p.x, p.y, 1) : p;
      await createToken({ name: file.name.replace(/\.[^.]+$/, ''), file, x: s.x, y: s.y, mapId: map.id });
      p = { x: p.x + G.cellSize(map), y: p.y };
    }
  }

  let cursor = $derived(
    panning ? 'grabbing' : spaceDown ? 'grab' : ui.tool === 'select' ? 'default' : 'crosshair'
  );
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<div
  class="vtt-table"
  bind:this={el}
  bind:clientWidth={cw}
  bind:clientHeight={ch}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  oncontextmenu={(e) => e.preventDefault()}
  ondragover={onDragOver}
  ondrop={onDrop}
  role="application"
  style:cursor
>
  {#if !map}
    <div class="position-absolute top-50 start-50 translate-middle text-white text-center">
      {dm ? 'Upload a map in the sidebar to begin.' : 'Waiting for the DM to choose a map…'}
    </div>
  {:else}
    <svg>
      <defs>
        <clipPath id="token-clip" clipPathUnits="objectBoundingBox">
          <circle cx="0.5" cy="0.5" r="0.5" />
        </clipPath>
      </defs>
      <g transform="translate({cam.x} {cam.y}) scale({cam.zoom})">
        <!-- 1. map layer -->
        <image href={fileUrl(map, map.image)} x="0" y="0" width={W} height={H} preserveAspectRatio="none" />

        <!-- 2. grid -->
        {#if map.grid_visible}
          <Grid {map} zoom={cam.zoom} />
        {/if}

        <!-- 3. persistent AoE shapes -->
        {#each game.drawings as d (d.id)}
          <Drawing
            {d}
            {map}
            zoom={cam.zoom}
            selected={isSelected('drawings', d.id)}
            movable={ui.tool === 'select' && canEditDrawing(d)}
            onpointerdown={(e) => onDrawingDown(e, d)}
          />
        {/each}

        <!-- 4. tokens -->
        {#each stackedTokens as t (t.id)}
          <Token
            {t}
            {map}
            zoom={cam.zoom}
            selected={isSelected('tokens', t.id)}
            movable={canMoveToken(t)}
            onpointerdown={(e) => onTokenDown(e, t)}
          />
        {/each}

        <!-- 5. fog of war -->
        {#if fog.enabled}
          <Fog {map} {fog} {dm} />
        {/if}

        <!-- 6. handles for the selected AoE shape -->
        {#if selectedDrawing && ui.tool === 'select' && canEditDrawing(selectedDrawing)}
          <!-- fresh per drawing, so its glide keeps in step with the drawing's own -->
          {#key selectedDrawing.id}
            <DrawingHandles
              d={selectedDrawing}
              zoom={cam.zoom}
              onhandledown={(e, h) => onHandleDown(e, selectedDrawing, h)}
              ondelete={() => { const id = selectedDrawing.id; clearSelection(); deleteDrawing(id); }}
            />
          {/key}
        {/if}

        <!-- 7. live previews -->
        {#if preview}
          {#if preview.kind === 'measure'}
            <Ruler a={{ x: preview.x1, y: preview.y1 }} b={{ x: preview.x2, y: preview.y2 }} {map} zoom={cam.zoom} rule={ui.measureRule} />
          {:else if preview.kind === 'aoe'}
            <Drawing d={{ color: ui.color, ...preview }} {map} zoom={cam.zoom} />
          {:else if preview.kind === 'fog'}
            {@const r = G.rectFromPoints(preview.x1, preview.y1, preview.x2, preview.y2)}
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={ui.tool === 'fog-hide' ? 'black' : 'white'} stroke-width={2 / cam.zoom} stroke-dasharray="{6 / cam.zoom} {4 / cam.zoom}" pointer-events="none" />
          {:else if preview.kind === 'marquee'}
            {@const r = G.rectFromPoints(preview.x1, preview.y1, preview.x2, preview.y2)}
            <rect class="vtt-marquee" x={r.x} y={r.y} width={r.w} height={r.h} fill="rgba(255,255,255,0.15)" stroke="white" stroke-width={1 / cam.zoom} pointer-events="none" />
          {/if}
        {/if}
      </g>
    </svg>
    <div class="position-absolute bottom-0 end-0 p-1 small text-white-50 text-end" style="pointer-events:none">
      Zoom {Math.round(cam.zoom * 100)}% · wheel = zoom · right/middle drag or Space+drag = pan · Shift+click/drag = add to selection
    </div>
    <button class="btn btn-sm btn-light position-absolute top-0 start-0 m-2" onpointerdown={(e) => e.stopPropagation()} onclick={fit}>Fit map</button>
    <InitiativeTracker />
  {/if}
  <!-- outside the map check: the DM needs the sidebar to upload the first map -->
  <button
    class="btn btn-sm btn-light position-absolute top-0 end-0 m-2"
    aria-controls="vtt-sidebar"
    aria-expanded={ui.sidebarOpen}
    onpointerdown={(e) => e.stopPropagation()}
    onclick={() => (ui.sidebarOpen = !ui.sidebarOpen)}
  >
    {ui.sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
  </button>
</div>
