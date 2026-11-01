<script>
  // The interactive viewport: camera, layers, and all pointer tools.
  import {
    game, currentMap, fogOf, addFogOp, canMoveToken, canEditDrawing, canDeleteDrawing,
    beginDrag, endDrag, moveTokenLocal, queueTokenUpdate,
    beginDrawingDrag, endDrawingDrag, moveDrawingLocal, queueDrawingUpdate,
    createDrawing, deleteDrawing, createToken, deleteToken,
  } from '../lib/game.svelte.js';
  import { isDM } from '../lib/auth.svelte.js';
  import { ui } from '../lib/ui.svelte.js';
  import { fileUrl } from '../lib/pb.js';
  import * as G from '../lib/geometry.js';
  import Grid from './Grid.svelte';
  import Fog from './Fog.svelte';
  import Token from './Token.svelte';
  import Drawing from './Drawing.svelte';
  import DrawingHandles from './DrawingHandles.svelte';
  import Ruler from './Ruler.svelte';

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
  let selectedDrawing = $derived(game.drawings.find((d) => d.id === ui.selectedDrawingId));

  let action = null; // current drag interaction (non-reactive)
  let preview = $state(null); // in-progress shape {kind, x1, y1, x2, y2}
  let spaceDown = $state(false);
  let panning = $state(false);

  // ---------- camera ----------
  let fittedFor = '';
  $effect(() => {
    if (map && cw && ch && fittedFor !== map.id) {
      fittedFor = map.id;
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
    return G.snapCorner(map, p.x, p.y); // aoe origin, highlight, fog
  }

  function onPointerDown(e) {
    if (!map) return;
    el.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const leftSelect = e.button === 0 && ui.tool === 'select';

    if (e.button === 1 || e.button === 2 || spaceDown || leftSelect) {
      if (leftSelect && !spaceDown) {
        ui.selectedTokenId = '';
        ui.selectedDrawingId = '';
      }
      action = { kind: 'pan', sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
      panning = true;
      return;
    }
    if (e.button !== 0) return;

    let kind = ui.tool;
    if (kind.startsWith('fog')) {
      if (!dm) return;
      kind = 'fog';
    }
    const s = snapFor(kind, p);
    action = { kind, mode: ui.tool === 'fog-hide' ? 'hide' : 'reveal' };
    preview = { kind, x1: s.x, y1: s.y, x2: s.x, y2: s.y };
  }

  function onTokenDown(e, t) {
    if (e.button !== 0 || ui.tool !== 'select' || spaceDown) return; // let it bubble (pan / tools)
    e.stopPropagation();
    ui.selectedTokenId = t.id;
    ui.selectedDrawingId = '';
    if (!canMoveToken(t)) return;
    el.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    beginDrag(t.id);
    action = { kind: 'token', id: t.id, dx: p.x - t.x, dy: p.y - t.y, ox: t.x, oy: t.y };
  }

  function onDrawingDown(e, d) {
    if (e.button !== 0 || ui.tool !== 'select' || spaceDown) return;
    e.stopPropagation();
    ui.selectedDrawingId = d.id;
    ui.selectedTokenId = '';
    if (!canEditDrawing(d)) return;
    const p = toWorld(e);
    startDrawingEdit(e, d, { mode: 'move', dx: p.x - d.x1, dy: p.y - d.y1 });
  }

  function onHandleDown(e, d, h) {
    if (e.button !== 0 || spaceDown) return;
    e.stopPropagation();
    startDrawingEdit(e, d, d.kind === 'aoe' ? { mode: 'radius' } : { mode: 'corner', ax: h.ax, ay: h.ay });
  }

  function startDrawingEdit(e, d, edit) {
    el.setPointerCapture(e.pointerId);
    beginDrawingDrag(d.id);
    action = {
      kind: 'drawing',
      id: d.id,
      orig: { x1: d.x1, y1: d.y1, x2: d.x2, y2: d.y2 },
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

  // New coordinates for the drawing being edited, or null if the pointer would shrink it away.
  function editedCoords(a, p) {
    const { x1, y1, x2, y2 } = a.orig;
    const min = G.ftToPx(map, 1);
    if (a.mode === 'move') {
      const s = snapFor('drawing', { x: p.x - a.dx, y: p.y - a.dy });
      const dx = s.x - x1, dy = s.y - y1;
      return { x1: x1 + dx, y1: y1 + dy, x2: x2 + dx, y2: y2 + dy };
    }
    if (a.mode === 'radius') {
      const q = aoeEnd(x1, y1, p);
      return Math.hypot(q.x - x1, q.y - y1) < min ? null : { x2: q.x, y2: q.y };
    }
    const q = snapFor('drawing', p);
    if (Math.abs(q.x - a.ax) < min || Math.abs(q.y - a.ay) < min) return null;
    return { x1: a.ax, y1: a.ay, x2: q.x, y2: q.y };
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
    const p = toWorld(e);
    if (action.kind === 'token') {
      const x = p.x - action.dx, y = p.y - action.dy;
      moveTokenLocal(action.id, x, y);
      queueTokenUpdate(action.id, { x, y }); // live sync while dragging
      preview = { kind: 'measure', x1: action.ox, y1: action.oy, x2: x, y2: y };
      return;
    }
    if (!preview) return;
    const q = action.kind === 'aoe' ? aoeEnd(preview.x1, preview.y1, p) : snapFor(action.kind, p);
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

    if (a.kind === 'token') {
      const t = game.tokens.find((t) => t.id === a.id);
      if (t) {
        let { x, y } = t;
        if (ui.snap) ({ x, y } = G.snapToken(map, x, y, Number(t.size) || 1));
        // players can't enter the fog: send the token back to where the drag started
        if (!dm && G.isFogged(map, fog, x, y)) {
          x = a.ox;
          y = a.oy;
        }
        moveTokenLocal(a.id, x, y);
        queueTokenUpdate(a.id, { x, y });
      }
      endDrag(a.id);
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
        await createDrawing({ kind: 'aoe', shape: ui.aoeShape, x1: pv.x1, y1: pv.y1, x2: pv.x2, y2: pv.y2, color: ui.color });
      } else if (a.kind === 'highlight') {
        await createDrawing({ kind: 'highlight', shape: 'rect', x1: pv.x1, y1: pv.y1, x2: pv.x2, y2: pv.y2, color: ui.color });
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
      if (action && action.kind !== 'token') action = null;
      ui.selectedDrawingId = '';
      ui.selectedTokenId = '';
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const d = game.drawings.find((d) => d.id === ui.selectedDrawingId);
      if (d && canDeleteDrawing(d)) {
        ui.selectedDrawingId = '';
        await deleteDrawing(d.id);
        return;
      }
      const t = game.tokens.find((t) => t.id === ui.selectedTokenId);
      if (t && dm && confirm(`Delete token "${t.name}"?`)) {
        ui.selectedTokenId = '';
        await deleteToken(t.id);
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
    panning ? 'grabbing' : spaceDown || ui.tool === 'select' ? 'grab' : 'crosshair'
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

        <!-- 3. persistent AoE / highlights -->
        {#each game.drawings as d (d.id)}
          <Drawing
            {d}
            {map}
            zoom={cam.zoom}
            selected={ui.selectedDrawingId === d.id}
            movable={ui.tool === 'select' && canEditDrawing(d)}
            onpointerdown={(e) => onDrawingDown(e, d)}
          />
        {/each}

        <!-- 4. tokens -->
        {#each visibleTokens as t (t.id)}
          <Token
            {t}
            {map}
            zoom={cam.zoom}
            selected={ui.selectedTokenId === t.id}
            movable={canMoveToken(t)}
            onpointerdown={(e) => onTokenDown(e, t)}
          />
        {/each}

        <!-- 5. fog of war -->
        {#if fog.enabled}
          <Fog {map} {fog} {dm} />
        {/if}

        <!-- 6. handles for the selected AoE / highlight -->
        {#if selectedDrawing && ui.tool === 'select' && canEditDrawing(selectedDrawing)}
          <DrawingHandles
            d={selectedDrawing}
            zoom={cam.zoom}
            onhandledown={(e, h) => onHandleDown(e, selectedDrawing, h)}
            ondelete={() => { const id = selectedDrawing.id; ui.selectedDrawingId = ''; deleteDrawing(id); }}
          />
        {/if}

        <!-- 7. live previews -->
        {#if preview}
          {#if preview.kind === 'measure'}
            <Ruler a={{ x: preview.x1, y: preview.y1 }} b={{ x: preview.x2, y: preview.y2 }} {map} zoom={cam.zoom} rule={ui.measureRule} />
          {:else if preview.kind === 'aoe'}
            <Drawing d={{ kind: 'aoe', shape: ui.aoeShape, color: ui.color, ...preview }} {map} zoom={cam.zoom} />
          {:else if preview.kind === 'highlight'}
            <Drawing d={{ kind: 'highlight', shape: 'rect', color: ui.color, ...preview }} {map} zoom={cam.zoom} />
          {:else if preview.kind === 'fog'}
            {@const r = G.rectFromPoints(preview.x1, preview.y1, preview.x2, preview.y2)}
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="none" stroke={ui.tool === 'fog-hide' ? 'black' : 'white'} stroke-width={2 / cam.zoom} stroke-dasharray="{6 / cam.zoom} {4 / cam.zoom}" pointer-events="none" />
          {/if}
        {/if}
      </g>
    </svg>
    <div class="position-absolute bottom-0 start-0 p-1 small text-white-50" style="pointer-events:none">
      Zoom {Math.round(cam.zoom * 100)}% · wheel = zoom · right/middle drag or Space+drag = pan
    </div>
    <button class="btn btn-sm btn-light position-absolute top-0 start-0 m-2" onpointerdown={(e) => e.stopPropagation()} onclick={fit}>Fit map</button>
  {/if}
</div>
