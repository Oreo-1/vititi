<script>
  // Renders an AoE (circle/half/quarter) or a rectangular highlight.
  import { aoePath, rectFromPoints, pxToFt } from '../lib/geometry.js';

  let { d, map, zoom, selected = false, onpointerdown, ondelete } = $props();

  let fs = $derived(14 / zoom);
  let rect = $derived(rectFromPoints(d.x1, d.y1, d.x2, d.y2));
  let radiusFt = $derived(Math.round(pxToFt(map, Math.hypot(d.x2 - d.x1, d.y2 - d.y1))));
  let shapeLabel = $derived({ circle: 'radius', half: 'half-circle', quarter: 'quarter-circle' }[d.shape] || '');
  let handle = $derived(d.kind === 'aoe' ? { x: d.x2, y: d.y2 } : { x: rect.x + rect.w, y: rect.y });
  let dash = $derived(selected ? `${6 / zoom} ${4 / zoom}` : null);

  function del(e) {
    e.stopPropagation();
    ondelete?.();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="vtt-drawing" {onpointerdown} style:cursor={onpointerdown ? 'pointer' : null}>
  {#if d.kind === 'aoe'}
    <path d={aoePath(d.shape, d.x1, d.y1, d.x2, d.y2)} fill={d.color} fill-opacity="0.3" stroke={d.color} stroke-width={2 / zoom} stroke-dasharray={dash} />
    <circle cx={d.x1} cy={d.y1} r={3 / zoom} fill={d.color} />
    <text x={d.x1} y={d.y1 - 8 / zoom} text-anchor="middle" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">{radiusFt} ft {shapeLabel}</text>
  {:else}
    <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill={d.color} fill-opacity="0.3" stroke={d.color} stroke-width={2 / zoom} stroke-dasharray={dash} />
    <text x={rect.x + rect.w / 2} y={rect.y + rect.h / 2} text-anchor="middle" dominant-baseline="central" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">
      {Math.round(pxToFt(map, rect.w))} × {Math.round(pxToFt(map, rect.h))} ft
    </text>
  {/if}
  {#if selected && ondelete}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <g transform="translate({handle.x} {handle.y})" onpointerdown={del} style="cursor:pointer">
      <circle r={10 / zoom} fill="#dc3545" />
      <text text-anchor="middle" dominant-baseline="central" font-size={14 / zoom} fill="white">×</text>
    </g>
  {/if}
</g>
