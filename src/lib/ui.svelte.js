// Local-only UI state (not synced).
export const ui = $state({
  tool: 'select', // select | measure | aoe | fog-reveal | fog-hide
  aoeShape: 'circle', // circle | half | quarter | rect (saved as the drawing's shape)
  snap: false,
  measureRule: 'euclid', // 5e | alt | euclid
  color: '#ff3b30',
  // what's selected with the Select tool: ids of tokens and drawings (several via marquee or Shift+click)
  selection: { tokens: [], drawings: [] },
  sidebarOpen: true,
  initiativeOpen: true,
});

export const TOOLS = [
  { id: 'select', label: 'Select / Move', dmOnly: false },
  { id: 'measure', label: 'Measure', dmOnly: false },
  { id: 'aoe', label: 'Area of Effect', dmOnly: false },
  { id: 'fog-reveal', label: 'Reveal Fog', dmOnly: true },
  { id: 'fog-hide', label: 'Hide Fog', dmOnly: true },
];

// ---------------- selection ----------------

/** Shift, Ctrl or Cmd held: add to / remove from the selection instead of replacing it. */
export const isAdditive = (e) => !!(e?.shiftKey || e?.ctrlKey || e?.metaKey);

export function selectOnly({ tokens = [], drawings = [] } = {}) {
  ui.selection = { tokens: [...tokens], drawings: [...drawings] };
}

export function clearSelection() {
  selectOnly();
}

export const isSelected = (kind, id) => ui.selection[kind].includes(id);

/** kind: 'tokens' | 'drawings' */
export function toggleSelected(kind, id) {
  const list = ui.selection[kind];
  const i = list.indexOf(id);
  if (i === -1) list.push(id);
  else list.splice(i, 1);
}

/** A click on an item: toggle it with a modifier key held, otherwise select just it. */
export function pick(kind, id, e) {
  if (isAdditive(e)) toggleSelected(kind, id);
  else selectOnly({ [kind]: [id] });
}
