// Local-only UI state (not synced).
export const ui = $state({
  tool: 'select', // select | measure | aoe | highlight | fog-reveal | fog-hide
  aoeShape: 'circle', // circle | half | quarter
  snap: false,
  measureRule: '5e', // 5e | alt | euclid
  color: '#ff3b30',
  selectedTokenId: '',
  selectedDrawingId: '',
  sidebarOpen: true,
});

export const TOOLS = [
  { id: 'select', label: 'Select / Move', dmOnly: false },
  { id: 'measure', label: 'Measure', dmOnly: false },
  { id: 'aoe', label: 'Area of Effect', dmOnly: false },
  { id: 'highlight', label: 'Highlight', dmOnly: false },
  { id: 'fog-reveal', label: 'Reveal Fog', dmOnly: true },
  { id: 'fog-hide', label: 'Hide Fog', dmOnly: true },
];
