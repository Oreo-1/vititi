<script>
  // Fog = black rect masked by a list of reveal/hide rectangles (applied in order).
  // The mask is blurred so the edges don't look blocky.
  import { fogSmoothing } from '../lib/geometry.js';

  let { map, fog, dm } = $props();
  let id = $derived('fog-' + map.id);
  let W = $derived(map.width || 1000);
  let H = $derived(map.height || 1000);
  let smooth = $derived(fogSmoothing(map, fog));
</script>

<defs>
  <!-- A blurred edge is 50% fog right on the rectangle's border. Doubling the mask makes that
       100%, so along straight edges the fade stays inside revealed areas and hides what's still
       hidden. The only thing given up is a small rounding of the fog's outward-pointing corners. -->
  <filter id="{id}-smooth" filterUnits="userSpaceOnUse" x={-smooth.pad} y={-smooth.pad} width={W + 2 * smooth.pad} height={H + 2 * smooth.pad} color-interpolation-filters="sRGB">
    <feGaussianBlur stdDeviation={smooth.blur} />
    <feComponentTransfer>
      <feFuncR type="linear" slope="2" />
      <feFuncG type="linear" slope="2" />
      <feFuncB type="linear" slope="2" />
    </feComponentTransfer>
  </filter>
  <mask {id} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
    <g filter="url(#{id}-smooth)">
      <rect x={-smooth.pad} y={-smooth.pad} width={W + 2 * smooth.pad} height={H + 2 * smooth.pad} fill="white" />
      {#each smooth.rects as op}
        <rect x={op.x} y={op.y} width={op.w} height={op.h} fill={op.type === 'reveal' ? 'black' : 'white'} />
      {/each}
    </g>
  </mask>
</defs>
<!-- DM sees the fog semi-transparent; players see it fully opaque -->
<rect class="vtt-fog" x="0" y="0" width={W} height={H} fill="black" fill-opacity={dm ? 0.5 : 1} mask="url(#{id})" pointer-events="none" />
