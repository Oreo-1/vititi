<script>
  // Renders an AoE: circle/half/quarter, or a rectangle.
  import { aoePath, rectFromPoints, pxToFt, isRect, rotationOf, rectSides } from '../lib/geometry.js';
  import { isDraggingDrawing } from '../lib/game.svelte.js';
  import { glideDrawing } from '../lib/glide.svelte.js';

  let { d: rec, map, zoom, selected = false, movable = false, onpointerdown } = $props();

  // others' edits (move, resize, rotate) glide between updates; ours stay instant
  const shown = glideDrawing(() => rec, isDraggingDrawing);
  let d = $derived(shown.current);

  let fs = $derived(14 / zoom);
  let rect = $derived(rectFromPoints(d.x1, d.y1, d.x2, d.y2));
  let radiusFt = $derived(Math.round(pxToFt(map, Math.hypot(d.x2 - d.x1, d.y2 - d.y1))));
  let shapeLabel = $derived({ circle: 'radius', half: 'half-circle', quarter: 'quarter-circle' }[d.shape] || '');
  let dash = $derived(selected ? `${6 / zoom} ${4 / zoom}` : null);
  let prefix = $derived(d.name ? `${d.name} · ` : '');
  let rot = $derived(rotationOf(d));
  let sides = $derived(rectSides(d));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="vtt-drawing" {onpointerdown} style:cursor={movable ? 'move' : onpointerdown ? 'pointer' : null}>
  {#if !isRect(d)}
    <path d={aoePath(d.shape, d.x1, d.y1, d.x2, d.y2)} fill={d.color} fill-opacity="0.3" stroke={d.color} stroke-width={2 / zoom} stroke-dasharray={dash} />
    <circle cx={d.x1} cy={d.y1} r={3 / zoom} fill={d.color} />
    <text x={d.x1} y={d.y1 - 8 / zoom} text-anchor="middle" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">{prefix}{radiusFt} ft {shapeLabel}</text>
  {:else}
    <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} transform={rot ? `rotate(${rot} ${rect.x + rect.w / 2} ${rect.y + rect.h / 2})` : null} fill={d.color} fill-opacity="0.3" stroke={d.color} stroke-width={2 / zoom} stroke-dasharray={dash} />
    <text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2} text-anchor="middle" dominant-baseline="central" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">
      {prefix}{Math.round(pxToFt(map, sides.w))} × {Math.round(pxToFt(map, sides.h))} ft
    </text>
  {/if}
</g>
