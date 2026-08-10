import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Манифест нужен тесту границы: по нему видно, какие чанки реально уедут
  // игроку, — а значит, попал ли к нему код конструктора.
  build: { manifest: true },
  server: {
    port: 8300,
    // Сервер стенда живёт на 8200; прокси избавляет от CORS и от того,
    // чтобы адрес API протекал в код клиента.
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
