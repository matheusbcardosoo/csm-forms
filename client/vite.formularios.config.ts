import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Bundle público dos formulários (F6 incremento B — ver
// docs/superpowers/specs/2026-09-19-formularios-react-f6-incremento-b-design.md).
// Multi-page build nativo do Vite: dois HTMLs de entrada, cada um um
// mini-app fechado, SEM react-router-dom — visitante de /form-visitas
// nunca baixa o código do outro formulário nem do painel administrativo.
// Em dev, base fica em "/" pra servir as páginas em URLs amigáveis
// (http://localhost:5174/visita.html); em build, vai com prefixo próprio
// pra não colidir com /js, /css, /images (estáticos existentes) nem com
// /app/ (base do painel).
export default defineConfig(({ command }) => ({
  root: path.resolve(__dirname, 'formularios'),
  base: command === 'build' ? '/assets-formularios/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@compartilhado': path.resolve(__dirname, 'src', 'compartilhado')
    }
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: false }
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-formularios'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        visita: path.resolve(__dirname, 'formularios', 'visita.html'),
        avaliacao: path.resolve(__dirname, 'formularios', 'avaliacao.html')
      }
    }
  }
}));
