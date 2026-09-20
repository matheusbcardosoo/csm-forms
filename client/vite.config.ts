import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// O painel vive em /app (02-arquitetura §2.2): base fixa para que os
// assets compilados saiam com esse prefixo e o Express sirva client/dist
// nessa rota. Em desenvolvimento, /api é encaminhado ao Express (:3000).
export default defineConfig({
  root: __dirname,
  base: '/app/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '..', 'shared'),
      '@compartilhado': path.resolve(__dirname, 'src', 'compartilhado')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false },
      '/images': { target: 'http://localhost:3000', changeOrigin: false }
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
    sourcemap: false
  }
});
