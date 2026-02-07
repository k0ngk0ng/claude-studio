import { defineConfig } from 'vite';

// https://electron.forge.dev/config/plugins/vite
// Note: forge's ViteConfig automatically wraps this with:
//   - getBuildConfig (root, mode, outDir, watch)
//   - rollupOptions.input from forgeConfigSelf.entry
//   - pluginHotRestart('reload')
//   - external: electron, node builtins
// So we only need to add our own overrides here.
export default defineConfig({});
