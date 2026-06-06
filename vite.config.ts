import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project Pages are served from /<repo>/. Override with BASE_PATH if the
// repository is renamed or deployed elsewhere.
const base = process.env.BASE_PATH ?? '/tower-tools/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      // The single bridge: `cursor/canvas` resolves to the published
      // Mantine-backed shim, so the canvas source stays pure.
      'cursor/canvas': '@thisismydesign/cursor-canvas-web',
    },
  },
});
