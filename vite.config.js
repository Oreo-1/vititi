import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // server: {
  //   allowedHosts: ['oreo-ex.tanuki-gar.ts.net'],
  // },
});
