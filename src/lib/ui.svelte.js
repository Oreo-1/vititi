// Local-only UI state (not synced).
export const ui = $state({
  tool: 'select', // select | measure | aoe | fog-reveal | fog-hide
  aoeShape: 'circle', // circle | half | quarter | rect (saved as the drawing's shape)
  snap: false,
  measureRule: '5e', // 5e | alt | euclid
  color: '#ff3b30',
  selectedTokenId: '',
  selectedDrawingId: '',
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
