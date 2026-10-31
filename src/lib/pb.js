import PocketBase from 'pocketbase';

export const pb = new PocketBase(import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090');

// We manage request ordering ourselves (see game.svelte.js), so disable auto-cancel.
pb.autoCancellation(false);

export function fileUrl(record, filename, thumb) {
  if (!record || !filename) return '';
  return pb.files.getURL(record, filename, thumb ? { thumb } : undefined);
}
