/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project Pages are served from /<repo>/. Override with BASE_PATH if the
// repository is renamed or deployed elsewhere.
const base = process.env.BASE_PATH ?? '/tower-tools/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
