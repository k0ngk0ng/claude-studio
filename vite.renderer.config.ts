import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '.vite/renderer/main_window',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@renderer': '/src/renderer',
    },
  },
});
