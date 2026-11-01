// Central client-side state + PocketBase realtime sync.
import { pb } from './pb.js';
import { auth, isDM } from './auth.svelte.js';

export const game = $state({
  maps: [],
  tokens: [], // tokens on the map currently being viewed
  drawings: [], // AoE + highlight shapes on the viewed map
  state: null, // the single "game" record { active_map }
  viewMapId: '', // map this client is looking at (players: always the active map)
  ready: false,
  error: '',
});

export const currentMap = () => game.maps.find((m) => m.id === game.viewMapId) || null;

let unsubs = [];

// ---------------- lifecycle ----------------

export async function startSync() {
  game.ready = false;
  game.error = '';
  try {
    game.maps = await pb.collection('maps').getFullList({ sort: 'created' });
    game.state = await loadOrCreateGameState();

    unsubs.push(await pb.collection('maps').subscribe('*', onMapEvent));
    unsubs.push(await pb.collection('game').subscribe('*', onGameEvent));
    unsubs.push(await pb.collection('tokens').subscribe('*', onTokenEvent));
    unsubs.push(await pb.collection('drawings').subscribe('*', onDrawingEvent));

    // Players only ever see the active map; the DM falls back to the first map.
    const active = game.state?.active_map || '';
    await setViewMap(isDM() ? active || game.maps[0]?.id || '' : active);
    game.ready = true;
  } catch (e) {
    console.error(e);
    game.error = e?.message || String(e);
  }
}

export async function stopSync() {
  for (const u of unsubs) {
    try { await u(); } catch {}
  }
  unsubs = [];
  game.maps = [];
  game.tokens = [];
  game.drawings = [];
  game.state = null;
  game.viewMapId = '';
  game.ready = false;
}

async function loadOrCreateGameState() {
  const list = await pb.collection('game').getList(1, 1, { sort: 'created' });
  if (list.items.length) return list.items[0];
  if (isDM()) return await pb.collection('game').create({ active_map: game.maps[0]?.id || null });
  return null;
}

export async function setViewMap(mapId) {
  game.viewMapId = mapId || '';
  if (!mapId) {
    game.tokens = [];
    game.drawings = [];
    return;
  }
  const [tokens, drawings] = await Promise.all([
    pb.collection('tokens').getFullList({ filter: pb.filter('map = {:m}', { m: mapId }), sort: 'created' }),
    pb.collection('drawings').getFullList({ filter: pb.filter('map = {:m}', { m: mapId }), sort: 'created' }),
  ]);
  if (game.viewMapId !== mapId) return; // user switched again meanwhile
  game.tokens = tokens;
  game.drawings = drawings;
}

// ---------------- realtime handlers ----------------

function upsert(list, record) {
  const i = list.findIndex((r) => r.id === record.id);
  if (i === -1) list.push(record);
  else list[i] = record;
}
function remove(list, id) {
  const i = list.findIndex((r) => r.id === id);
  if (i !== -1) list.splice(i, 1);
}

function onMapEvent({ action, record }) {
  if (action === 'delete') {
    remove(game.maps, record.id);
    if (game.viewMapId === record.id) setViewMap(isDM() ? game.maps[0]?.id || '' : '');
  } else upsert(game.maps, record);
}

function onGameEvent({ action, record }) {
  if (action === 'delete') return;
  const prevActive = game.state?.active_map;
  game.state = record;
  // Players always follow the active map. The DM keeps whatever they're looking at.
  if (!isDM() && record.active_map !== prevActive) setViewMap(record.active_map);
}

function onTokenEvent({ action, record }) {
  if (action === 'delete' || record.map !== game.viewMapId) {
    remove(game.tokens, record.id);
    return;
  }
  if (tokenUpdates.isBusy(record.id)) return; // we're dragging it locally; ignore our own echoes
  upsert(game.tokens, record);
}

function onDrawingEvent({ action, record }) {
  if (action === 'delete' || record.map !== game.viewMapId) {
    remove(game.drawings, record.id);
    return;
  }
  if (drawingUpdates.isBusy(record.id)) return; // we're dragging it locally; ignore our own echoes
  upsert(game.drawings, record);
}

// ---------------- live drag updates (ordered, coalesced) ----------------
// Only one request per record is in flight at a time; newer values overwrite
// queued ones. This keeps updates ordered and naturally throttles to network speed.

function createUpdateQueue(collection) {
  const pending = new Map();
  const inflight = new Set();
  const dragging = new Set();
  const failed = new Set();

  const isBusy = (id) => dragging.has(id) || pending.has(id) || inflight.has(id);

  async function flush(id) {
    if (inflight.has(id) || !pending.has(id)) return;
    const data = pending.get(id);
    pending.delete(id);
    inflight.add(id);
    try {
      await pb.collection(collection).update(id, data);
    } catch (e) {
      console.error(`${collection} update failed`, e);
      failed.add(id);
    } finally {
      inflight.delete(id);
      flush(id);
      settle(id);
    }
  }

  // A rejected update leaves the local copy wrong, so reload the real record once things are idle.
  async function settle(id) {
    if (isBusy(id) || !failed.delete(id)) return;
    try {
      const record = await pb.collection(collection).getOne(id);
      if (record.map === game.viewMapId) upsert(game[collection], record);
    } catch {
      // deleted meanwhile; the realtime event removes it
    }
  }

  return {
    isBusy,
    begin(id) { dragging.add(id); },
    end(id) { dragging.delete(id); settle(id); },
    queue(id, data) {
      pending.set(id, { ...(pending.get(id) || {}), ...data });
      flush(id);
    },
  };
}

const tokenUpdates = createUpdateQueue('tokens');
const drawingUpdates = createUpdateQueue('drawings');

export const beginDrag = tokenUpdates.begin;
export const endDrag = tokenUpdates.end;
export const queueTokenUpdate = tokenUpdates.queue;

export function moveTokenLocal(id, x, y) {
  const t = game.tokens.find((t) => t.id === id);
  if (t) { t.x = x; t.y = y; }
}

export const beginDrawingDrag = drawingUpdates.begin;
export const endDrawingDrag = drawingUpdates.end;
export const queueDrawingUpdate = drawingUpdates.queue;

export function moveDrawingLocal(id, coords) {
  const d = game.drawings.find((d) => d.id === id);
  if (d) Object.assign(d, coords);
}

// ---------------- permissions ----------------

export function canMoveToken(token) {
  if (!auth.user) return false;
  if (isDM()) return true;
  return !token.dm_only && !token.hidden;
}

export function canEditDrawing(d) {
  return isDM() || d.author === auth.user?.id;
}

export const canDeleteDrawing = canEditDrawing;

// ---------------- CRUD helpers ----------------

function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = reject;
    img.src = url;
  });
}

export async function createMap(file, name) {
  const { width, height } = await readImageSize(file);
  const fd = new FormData();
  fd.append('name', name || file.name.replace(/\.[^.]+$/, ''));
  fd.append('image', file);
  fd.append('width', width);
  fd.append('height', height);
  fd.append('grid_type', 'square');
  fd.append('grid_size', 70);
  fd.append('grid_offset_x', 0);
  fd.append('grid_offset_y', 0);
  fd.append('grid_visible', true);
  fd.append('fog', JSON.stringify({ enabled: false, ops: [] }));
  const rec = await pb.collection('maps').create(fd);
  if (!game.state?.active_map) await setActiveMap(rec.id);
  return rec;
}

export async function updateMap(id, data) {
  return pb.collection('maps').update(id, data);
}

export async function deleteMap(id) {
  if (game.state?.active_map === id) {
    const other = game.maps.find((m) => m.id !== id);
    await setActiveMap(other?.id || null);
  }
  await pb.collection('maps').delete(id);
}

/** "Move players to this map". */
export async function setActiveMap(mapId) {
  if (!game.state) game.state = await pb.collection('game').create({ active_map: mapId });
  else game.state = await pb.collection('game').update(game.state.id, { active_map: mapId });
}

export async function createToken({ name, file, x, y, size = 1, hidden = false, dm_only = false, mapId }) {
  const fd = new FormData();
  fd.append('map', mapId || game.viewMapId);
  fd.append('name', name || 'Token');
  if (file) fd.append('image', file);
  fd.append('x', x);
  fd.append('y', y);
  fd.append('size', size);
  fd.append('hidden', hidden);
  fd.append('dm_only', dm_only);
  return pb.collection('tokens').create(fd);
}

export async function updateToken(id, data) {
  return pb.collection('tokens').update(id, data);
}

export async function deleteToken(id) {
  return pb.collection('tokens').delete(id);
}

export async function createDrawing(d) {
  return pb.collection('drawings').create({ ...d, map: game.viewMapId, author: auth.user.id });
}

export async function deleteDrawing(id) {
  return pb.collection('drawings').delete(id);
}

export async function clearDrawings({ onlyMine }) {
  const targets = game.drawings.filter((d) => !onlyMine || d.author === auth.user?.id).filter(canDeleteDrawing);
  await Promise.all(targets.map((d) => pb.collection('drawings').delete(d.id)));
}

// ---------------- fog of war ----------------

export function fogOf(map) {
  const f = map?.fog;
  return { enabled: !!f?.enabled, ops: Array.isArray(f?.ops) ? f.ops : [] };
}

export async function setFog(map, fog) {
  map.fog = fog; // optimistic
  await pb.collection('maps').update(map.id, { fog });
}

export async function addFogOp(map, op) {
  const f = fogOf(map);
  await setFog(map, { ...f, ops: [...f.ops, op] });
}
