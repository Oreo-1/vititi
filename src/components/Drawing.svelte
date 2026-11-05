<script>
  // Renders an AoE (circle/half/quarter) or a rectangular highlight.
  import { aoePath, rectFromPoints, pxToFt } from '../lib/geometry.js';

  let { d, map, zoom, selected = false, movable = false, onpointerdown } = $props();

  let fs = $derived(14 / zoom);
  let rect = $derived(rectFromPoints(d.x1, d.y1, d.x2, d.y2));
  let radiusFt = $derived(Math.round(pxToFt(map, Math.hypot(d.x2 - d.x1, d.y2 - d.y1))));
  let shapeLabel = $derived({ circle: 'radius', half: 'half-circle', quarter: 'quarter-circle' }[d.shape] || '');
  let dash = $derived(selected ? `${6 / zoom} ${4 / zoom}` : null);
  let prefix = $derived(d.name ? `${d.name} · ` : '');
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="vtt-drawing" {onpointerdown} style:cursor={movable ? 'move' : onpointerdown ? 'pointer' : null}>
  {#if d.kind === 'aoe'}
    <path d={aoePath(d.shape, d.x1, d.y1, d.x2, d.y2)} fill={d.color} fill-opacity="0.3" stroke={d.color} stroke-width={2 / zoom} stroke-dasharray={dash} />
    <circle cx={d.x1} cy={d.y1} r={3 / zoom} fill={d.color} />
    <text x={d.x1} y={d.y1 - 8 / zoom} text-anchor="middle" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">{prefix}{radiusFt} ft {shapeLabel}</text>
  {:else}
    <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={d.color} fill-opacity="0.3" stroke={d.color} stroke-width={2 / zoom} stroke-dasharray={dash} />
    <text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2} text-anchor="middle" dominant-baseline="central" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">
      {prefix}{Math.round(pxToFt(map, rect.w))} × {Math.round(pxToFt(map, rect.h))} ft
    </text>
  {/if}
</g>
