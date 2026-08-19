import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  build: { manifest: true },
  server: {
    port: 8300,

    proxy: {
      '/api': { target: 'http://127.0.0.1:8200', rewrite: p => p.replace(/^\/api/, '') },
      '/ws': { target: 'ws://127.0.0.1:8200', ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true,
  },
});
