<script>
  import { fileUrl } from '../lib/pb.js';
  import { cellSize } from '../lib/geometry.js';

  let { t, map, zoom, selected = false, movable = false, onpointerdown } = $props();

  let r = $derived(((Number(t.size) || 1) * cellSize(map)) / 2);
  let url = $derived(t.image ? fileUrl(t, t.image) : '');
  let fs = $derived(12 / zoom);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<g
  class="vtt-token"
  class:token-hidden={t.hidden}
  class:token-deceased={t.deceased}
  transform="translate({t.x} {t.y})"
  {onpointerdown}
  style:cursor={movable ? 'grab' : 'default'}
>
  <g class="vtt-token-body">
  {#if url}
    <image href={url} x={-r} y={-r} width={2 * r} height={2 * r} clip-path="url(#token-clip)" preserveAspectRatio="xMidYMid slice" />
  {:else}
    <circle {r} fill="#6c757d" />
    <text text-anchor="middle" dominant-baseline="central" font-size={r} fill="white">{(t.name || '?')[0]}</text>
  {/if}
  </g>
  <circle {r} fill="none" stroke={selected ? '#0d6efd' : 'rgba(0,0,0,0.6)'} stroke-width={(selected ? 3 : 1.5) / zoom} />
  {#if t.deceased}
    <!-- skull badge at the top-right of the token (45°), not greyed out -->
    <g class="vtt-token-skull" transform="translate({r * 0.71} {-r * 0.71})">
      <circle r={r * 0.32} fill="rgba(0,0,0,0.75)" stroke="white" stroke-width={1 / zoom} />
      <text text-anchor="middle" dominant-baseline="central" font-size={r * 0.38}>💀</text>
    </g>
  {/if}
  {#if t.name}
    <text y={r + fs * 1.2} text-anchor="middle" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">{t.name}</text>
  {/if}
</g>
