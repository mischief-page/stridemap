import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the built site works from any folder or subpath.
  base: './',
  worker: { format: 'es' },
});
