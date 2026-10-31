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
  transform="translate({t.x} {t.y})"
  {onpointerdown}
  style:cursor={movable ? 'grab' : 'default'}
>
  {#if url}
    <image href={url} x={-r} y={-r} width={2 * r} height={2 * r} clip-path="url(#token-clip)" preserveAspectRatio="xMidYMid slice" />
  {:else}
    <circle {r} fill="#6c757d" />
    <text text-anchor="middle" dominant-baseline="central" font-size={r} fill="white">{(t.name || '?')[0]}</text>
  {/if}
  <circle {r} fill="none" stroke={selected ? '#0d6efd' : 'rgba(0,0,0,0.6)'} stroke-width={(selected ? 3 : 1.5) / zoom} />
  {#if t.name}
    <text y={r + fs * 1.2} text-anchor="middle" font-size={fs} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">{t.name}</text>
  {/if}
</g>
