<script>
  // Resize handles, rotate handle + delete button for the selected drawing.
  // Rendered above tokens and fog so they stay reachable.
  import { rectFromPoints, isRect, rectCorners, rotationOf, rotatePoint } from '../lib/geometry.js';
  import { isDraggingDrawing } from '../lib/game.svelte.js';
  import { glideDrawing } from '../lib/glide.svelte.js';

  let { d: rec, zoom, onhandledown, ondelete } = $props();

  // follow the drawing as it glides (someone else editing it)
  const shown = glideDrawing(() => rec, isDraggingDrawing);
  let d = $derived(shown.current);

  let rect = $derived(rectFromPoints(d.x1, d.y1, d.x2, d.y2));
  let radius = $derived(Math.hypot(d.x2 - d.x1, d.y2 - d.y1));
  let corners = $derived(isRect(d) ? rectCorners(d) : []);
  let rot = $derived(rotationOf(d));

  // Rect corners carry the opposite corner (ax, ay), which stays fixed while resizing.
  let handles = $derived.by(() => {
    if (!isRect(d)) return [{ x: d.x2, y: d.y2, cursor: 'pointer' }];
    const diag = ['nwse-resize', 'nesw-resize'];
    return corners.map((c, i) => ({
      x: c.x,
      y: c.y,
      ax: corners[(i + 2) % 4].x,
      ay: corners[(i + 2) % 4].y,
      cursor: rot % 90 === 0 ? diag[(i + rot / 90) % 2] : 'move',
    }));
  });

  // Rotate handle: on a stalk out from the middle of the rectangle's top edge, turning with it.
  let spin = $derived.by(() => {
    if (!isRect(d)) return null;
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    return {
      base: rotatePoint(cx, rect.y, cx, cy, rot),
      knob: rotatePoint(cx, rect.y - 28 / zoom, cx, cy, rot),
    };
  });

  // Outside the shape, so it can't land on a resize handle.
  let del = $derived.by(() => {
    if (!isRect(d)) return { x: d.x1 + radius, y: d.y1 - radius };
    const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
    return { x: Math.max(...xs) + 14 / zoom, y: Math.min(...ys) - 14 / zoom };
  });

  function onDelete(e) {
    e.stopPropagation();
    ondelete();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="vtt-drawing-handles">
  {#if spin}
    <line x1={spin.base.x} y1={spin.base.y} x2={spin.knob.x} y2={spin.knob.y} stroke="white" stroke-width={1.5 / zoom} pointer-events="none" />
    <circle
      class="vtt-drawing-handle vtt-drawing-rotate"
      cx={spin.knob.x}
      cy={spin.knob.y}
      r={7 / zoom}
      fill="#0d6efd"
      stroke="white"
      stroke-width={1.5 / zoom}
      style:cursor="grab"
      onpointerdown={(e) => onhandledown(e, { rotate: true })}
    >
      <title>Rotate</title>
    </circle>
  {/if}
  {#each handles as h}
    <circle
      class="vtt-drawing-handle"
      cx={h.x}
      cy={h.y}
      r={7 / zoom}
      fill="white"
      stroke="black"
      stroke-width={1.5 / zoom}
      style:cursor={h.cursor}
      onpointerdown={(e) => onhandledown(e, h)}
    />
  {/each}
  <g transform="translate({del.x} {del.y})" onpointerdown={onDelete} style="cursor:pointer">
    <circle r={10 / zoom} fill="#dc3545" />
    <text text-anchor="middle" dominant-baseline="central" font-size={14 / zoom} fill="white">×</text>
  </g>
</g>
