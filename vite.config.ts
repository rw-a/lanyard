import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath, URL } from 'node:url';

// On GitHub Pages a project site is served from https://<user>.github.io/<repo>/ ,
// so assets must be referenced relative to that sub-path. The deploy workflow
// sets VITE_BASE to "/<repo>/" automatically; locally it falls back to "/".
// If you publish to a user/organisation site (<user>.github.io) or a custom
// domain, set VITE_BASE to "/" in the workflow instead.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'styled-system': fileURLToPath(new URL('./styled-system', import.meta.url)),
    },
  },
  plugins: [solid()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
