import { defineConfig } from 'vite';

// https://electron.forge.dev/config/plugins/vite
// Note: forge's ViteConfig automatically wraps this with:
//   - getBuildConfig (root, mode, outDir, watch)
//   - getBuildDefine (MAIN_WINDOW_VITE_DEV_SERVER_URL, MAIN_WINDOW_VITE_NAME)
//   - lib entry from forgeConfigSelf.entry
//   - pluginHotRestart('restart')
//   - external: electron, node builtins
// So we only need to add our own overrides here.
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['node-pty'],
    },
  },
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
