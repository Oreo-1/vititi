<script>
  import { hexPatternPath, cellSize } from '../lib/geometry.js';
  let { map, zoom } = $props();

  let size = $derived(cellSize(map));
  let ox = $derived(Number(map.grid_offset_x) || 0);
  let oy = $derived(Number(map.grid_offset_y) || 0);
  let W = $derived(map.width || 1000);
  let H = $derived(map.height || 1000);
  let hex = $derived(hexPatternPath(size));
  let pid = $derived('grid-' + map.id);

  // Square grid: explicit lines (crisper than a pattern).
  let squarePath = $derived.by(() => {
    if (map.grid_type === 'hex') return '';
    let d = '';
    const startX = ox - Math.floor(ox / size) * size;
    const startY = oy - Math.floor(oy / size) * size;
    for (let x = startX; x <= W; x += size) d += `M${x} 0V${H}`;
    for (let y = startY; y <= H; y += size) d += `M0 ${y}H${W}`;
    return d;
  });
</script>

{#if map.grid_type === 'hex'}
  <defs>
    <pattern id={pid} patternUnits="userSpaceOnUse" x={ox} y={oy} width={hex.w} height={hex.h}>
      <path class="vtt-grid-line" d={hex.d} fill="none" stroke="rgba(0,0,0,0.5)" stroke-width={1 / zoom} />
    </pattern>
  </defs>
  <rect x="0" y="0" width={W} height={H} fill="url(#{pid})" pointer-events="none" />
{:else}
  <path class="vtt-grid-line" d={squarePath} fill="none" stroke="rgba(0,0,0,0.5)" stroke-width={1 / zoom} pointer-events="none" />
{/if}
