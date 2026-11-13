<script>
  // Resize handles + delete button for the selected drawing.
  // Rendered above tokens and fog so they stay reachable.
  import { rectFromPoints, isRect } from '../lib/geometry.js';

  let { d, zoom, onhandledown, ondelete } = $props();

  let rect = $derived(rectFromPoints(d.x1, d.y1, d.x2, d.y2));
  let radius = $derived(Math.hypot(d.x2 - d.x1, d.y2 - d.y1));

  // Rect corners carry the opposite corner (ax, ay), which stays fixed while resizing.
  let handles = $derived.by(() => {
    if (!isRect(d)) return [{ x: d.x2, y: d.y2, cursor: 'pointer' }];
    const { x, y, w, h } = rect;
    return [
      { x, y, ax: x + w, ay: y + h, cursor: 'nwse-resize' },
      { x: x + w, y, ax: x, ay: y + h, cursor: 'nesw-resize' },
      { x: x + w, y: y + h, ax: x, ay: y, cursor: 'nwse-resize' },
      { x, y: y + h, ax: x + w, ay: y, cursor: 'nesw-resize' },
    ];
  });

  // Outside the shape, so it can't land on a resize handle.
  let del = $derived(
    !isRect(d)
      ? { x: d.x1 + radius, y: d.y1 - radius }
      : { x: rect.x + rect.w + 14 / zoom, y: rect.y - 14 / zoom }
  );

  function onDelete(e) {
    e.stopPropagation();
    ondelete();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g class="vtt-drawing-handles">
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
