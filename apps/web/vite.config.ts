import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const api = Number(process.env.VTT_API_PORT ?? 8200);

export default defineConfig({
  plugins: [react()],

  build: { manifest: true },
  server: {
    port: Number(process.env.VTT_WEB_PORT ?? 8300),

    proxy: {
      '/api': { target: `http://127.0.0.1:${api}`, rewrite: p => p.replace(/^\/api/, '') },
      '/ws': { target: `ws://127.0.0.1:${api}`, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true,
  },
});
