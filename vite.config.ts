import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

// On GitHub Pages a project site is served from https://<user>.github.io/<repo>/ ,
// so assets must be referenced relative to that sub-path. The deploy workflow
// sets VITE_BASE to "/<repo>/" automatically; locally it falls back to "/".
// If you publish to a user/organisation site (<user>.github.io) or a custom
// domain, set VITE_BASE to "/" in the workflow instead.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [solid()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: false,
  },
});
