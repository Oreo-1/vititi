<script>
  // Fog = black rect masked by a list of reveal/hide rectangles (applied in order).
  let { map, fog, dm } = $props();
  let id = $derived('fog-' + map.id);
  let W = $derived(map.width || 1000);
  let H = $derived(map.height || 1000);
</script>

<defs>
  <mask {id} maskUnits="userSpaceOnUse" x="0" y="0" width={W} height={H}>
    <rect x="0" y="0" width={W} height={H} fill="white" />
    {#each fog.ops as op}
      <rect x={op.x} y={op.y} width={op.w} height={op.h} fill={op.type === 'reveal' ? 'black' : 'white'} />
    {/each}
  </mask>
</defs>
<!-- DM sees the fog semi-transparent; players see it fully opaque -->
<rect class="vtt-fog" x="0" y="0" width={W} height={H} fill="black" fill-opacity={dm ? 0.5 : 1} mask="url(#{id})" pointer-events="none" />
