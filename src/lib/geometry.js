// All coordinates are "world" coordinates = pixels of the map image.
export const FT_PER_CELL = 5;
const SQRT3 = Math.sqrt(3);

function grid(map) {
  return {
    type: map?.grid_type || 'square',
    size: Math.max(4, Number(map?.grid_size) || 70), // px per cell (hex: center-to-center)
    ox: Number(map?.grid_offset_x) || 0,
    oy: Number(map?.grid_offset_y) || 0,
  };
}

// ---------- hex helpers (pointy-top) ----------
function hexRadius(size) {
  return size / SQRT3; // center-to-corner
}
function hexOrigin(g) {
  // matches the SVG pattern in Grid.svelte: first hex centered at (size/2, r)
  return { x: g.ox + g.size / 2, y: g.oy + hexRadius(g.size) };
}
// Fractional axial coordinates (not rounded to a hex).
function pixelToAxialFrac(g, x, y) {
  const r = hexRadius(g.size);
  const o = hexOrigin(g);
  const px = x - o.x, py = y - o.y;
  return { q: ((SQRT3 / 3) * px - (1 / 3) * py) / r, r: ((2 / 3) * py) / r };
}
function pixelToAxial(g, x, y) {
  const a = pixelToAxialFrac(g, x, y);
  return axialRound(a.q, a.r);
}
function axialRound(q, r) {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}
function axialToPixel(g, q, r) {
  const rad = hexRadius(g.size);
  const o = hexOrigin(g);
  return { x: o.x + rad * SQRT3 * (q + r / 2), y: o.y + rad * 1.5 * r };
}

// ---------- snapping ----------

/** Snap a token center. Odd-sized tokens snap to cell centers, even-sized to intersections. */
export function snapToken(map, x, y, sizeCells = 1) {
  const g = grid(map);
  if (g.type === 'hex') {
    const a = pixelToAxial(g, x, y);
    return axialToPixel(g, a.q, a.r);
  }
  const even = Math.round(sizeCells) % 2 === 0 && sizeCells >= 1;
  const fx = (x - g.ox) / g.size, fy = (y - g.oy) / g.size;
  if (even) return { x: g.ox + Math.round(fx) * g.size, y: g.oy + Math.round(fy) * g.size };
  return { x: g.ox + (Math.floor(fx) + 0.5) * g.size, y: g.oy + (Math.floor(fy) + 0.5) * g.size };
}

/** Snap to the nearest cell center. */
export function snapCenter(map, x, y) {
  return snapToken(map, x, y, 1);
}

/** Snap to the nearest grid intersection (square) or hex center (hex). */
export function snapCorner(map, x, y) {
  const g = grid(map);
  if (g.type === 'hex') return snapCenter(map, x, y);
  return {
    x: g.ox + Math.round((x - g.ox) / g.size) * g.size,
    y: g.oy + Math.round((y - g.oy) / g.size) * g.size,
  };
}

// ---------- distances ----------

/**
 * Distance in feet between two points.
 * rule: 'euclid' | '5e' (every diagonal = 1 square) | 'alt' (5-10-5 diagonals)
 * Partial cells count too, so between cell centres it changes smoothly instead of
 * in 5 ft steps; at cell centres it gives the usual grid distance.
 */
export function distanceFt(map, a, b, rule = '5e') {
  const g = grid(map);
  if (rule === 'euclid') return (Math.hypot(b.x - a.x, b.y - a.y) / g.size) * FT_PER_CELL;
  if (g.type === 'hex') {
    const ha = pixelToAxialFrac(g, a.x, a.y), hb = pixelToAxialFrac(g, b.x, b.y);
    const dq = ha.q - hb.q, dr = ha.r - hb.r;
    return ((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2) * FT_PER_CELL;
  }
  const dx = Math.abs(b.x - a.x) / g.size, dy = Math.abs(b.y - a.y) / g.size;
  const diag = Math.min(dx, dy), straight = Math.max(dx, dy) - diag;
  if (rule === 'alt') {
    // every second diagonal costs double; a partly crossed diagonal costs its share
    const n = Math.floor(diag);
    const diagCells = n + Math.floor(n / 2) + (diag - n) * (n % 2 === 1 ? 2 : 1);
    return (straight + diagCells) * FT_PER_CELL;
  }
  return Math.max(dx, dy) * FT_PER_CELL; // 5e
}

/** Raw euclidean length in feet (used for AoE radius / rectangle sides). */
export function pxToFt(map, px) {
  return (px / grid(map).size) * FT_PER_CELL;
}
export function ftToPx(map, ft) {
  return (ft / FT_PER_CELL) * grid(map).size;
}

export function cellSize(map) {
  return grid(map).size;
}

// ---------- shapes ----------

/** SVG path for an AoE. shape: 'circle' | 'half' | 'quarter'. (x1,y1)=origin, (x2,y2)=direction/radius. */
export function aoePath(shape, x1, y1, x2, y2, radiusOverride) {
  const r = radiusOverride ?? Math.hypot(x2 - x1, y2 - y1);
  if (r <= 0) return '';
  if (shape === 'circle') {
    return `M ${x1 - r} ${y1} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
  }
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const half = shape === 'half' ? Math.PI / 2 : Math.PI / 4;
  const a0 = ang - half, a1 = ang + half;
  const sx = x1 + r * Math.cos(a0), sy = y1 + r * Math.sin(a0);
  const ex = x1 + r * Math.cos(a1), ey = y1 + r * Math.sin(a1);
  return `M ${x1} ${y1} L ${sx} ${sy} A ${r} ${r} 0 0 1 ${ex} ${ey} Z`;
}

/** Rectangles have shape 'rect'; every other shape is a circle, half or quarter AoE. */
export const isRect = (d) => d.shape === 'rect';

export function rectFromPoints(x1, y1, x2, y2) {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

/** Is this point under fog? Mirrors Fog.svelte: the map starts fogged and later ops paint over earlier ones. */
export function isFogged(map, fog, x, y) {
  if (!fog.enabled) return false;
  if (x < 0 || y < 0 || x > (map.width || 1000) || y > (map.height || 1000)) return false; // fog only covers the map
  for (let i = fog.ops.length - 1; i >= 0; i--) {
    const op = fog.ops[i];
    if (x >= op.x && x <= op.x + op.w && y >= op.y && y <= op.y + op.h) return op.type !== 'reveal';
  }
  return true;
}

const FOG_SOFTNESS = 0.2; // blur strength in grid cells, so edges look the same on any map

/**
 * How to draw the smoothed fog mask: blur strength, the margin the blur needs around
 * the map, and the fog rects. Rects touching a map edge are stretched past it, otherwise
 * the blur would fade them against the empty space outside the map.
 */
export function fogSmoothing(map, fog) {
  const W = map.width || 1000, H = map.height || 1000;
  const blur = grid(map).size * FOG_SOFTNESS;
  const pad = Math.ceil(blur * 3); // a Gaussian blur is negligible past 3 standard deviations
  const rects = fog.ops.map((op) => {
    const x1 = op.x <= 0 ? -pad : op.x, y1 = op.y <= 0 ? -pad : op.y;
    const x2 = op.x + op.w >= W ? W + pad : op.x + op.w;
    const y2 = op.y + op.h >= H ? H + pad : op.y + op.h;
    return { type: op.type, x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  });
  return { blur, pad, rects };
}

export function hexPatternPath(size) {
  const w = size, r = hexRadius(size);
  return {
    w,
    h: 3 * r,
    d: `M ${w / 2} 0 L ${w} ${r / 2} L ${w} ${1.5 * r} L ${w / 2} ${2 * r} L 0 ${1.5 * r} L 0 ${r / 2} Z M ${w / 2} ${2 * r} L ${w / 2} ${3 * r}`,
  };
}
