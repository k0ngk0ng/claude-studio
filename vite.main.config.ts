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
  define: {
    // Inject CDN base URL at build time (set via CI environment variable)
    'process.env.CLAUDE_STUDIO_CDN_URL': JSON.stringify(process.env.CLAUDE_STUDIO_CDN_URL || ''),
    // Inject server base URL at build time (default: http://localhost:3456)
    'process.env.CLAUDE_STUDIO_SERVER_URL': JSON.stringify(process.env.CLAUDE_STUDIO_SERVER_URL || ''),
  },
  build: {
    rollupOptions: {
      external: ['node-pty', '@anthropic-ai/claude-agent-sdk'],
    },
  },
  resolve: {
    conditions: ['node'],
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
