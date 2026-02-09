import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://electron.forge.dev/config/plugins/vite
// Note: forge's ViteConfig automatically wraps this with:
//   - root, mode, base: './'
//   - outDir: .vite/renderer/${name}
//   - pluginExposeRenderer(name)
// So we only need to add our own plugins and settings here.
//
// @tailwindcss/vite v4 is ESM-only, so we use dynamic import() to avoid
// the ERR_REQUIRE_ESM error when electron-forge loads this config via require().
export default defineConfig(async () => {
  const tailwindcss = (await import('@tailwindcss/vite')).default;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@renderer': '/src/renderer',
      },
    },
  };
});
