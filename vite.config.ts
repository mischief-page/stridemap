import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` produces one self-contained HTML file that works
// when opened directly from disk (file://), with no server.
export default defineConfig(({ mode }) => ({
  // Relative asset paths so the built site works from any folder or subpath.
  base: './',
  // Classic (non-module) worker: Chrome won't start module workers from a page opened via file://.
  worker: { format: 'iife' },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
  build: mode === 'single' ? { outDir: 'dist-single' } : {},
}));
