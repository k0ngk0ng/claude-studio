import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://electron.forge.dev/config/plugins/vite
// Note: forge's ViteConfig automatically wraps this with:
//   - root, mode, base: './'
//   - outDir: .vite/renderer/${name}
//   - pluginExposeRenderer(name)
// So we only need to add our own plugins and settings here.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@renderer': '/src/renderer',
    },
  },
});
