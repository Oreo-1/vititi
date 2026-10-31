<script>
  import { distanceFt } from '../lib/geometry.js';
  let { a, b, map, zoom, rule = '5e' } = $props();
  let ft = $derived(distanceFt(map, a, b, rule));
  let label = $derived(rule === 'euclid' ? ft.toFixed(1) : Math.round(ft));
</script>

<g class="vtt-ruler" pointer-events="none">
  <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffd60a" stroke-width={3 / zoom} stroke-dasharray="{8 / zoom} {4 / zoom}" />
  <circle cx={a.x} cy={a.y} r={4 / zoom} fill="#ffd60a" />
  <circle cx={b.x} cy={b.y} r={4 / zoom} fill="#ffd60a" />
  <text x={b.x + 10 / zoom} y={b.y - 10 / zoom} font-size={16 / zoom} fill="white" stroke="black" stroke-width={3 / zoom} paint-order="stroke">{label} ft</text>
</g>
