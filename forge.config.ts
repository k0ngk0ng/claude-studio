import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerZIP } from '@electron-forge/maker-zip';
import path from 'path';
import fs from 'fs-extra';

// Externalized native/ESM modules that must be copied into the packaged app
const EXTERNAL_MODULES = ['node-pty', '@anthropic-ai/claude-agent-sdk'];

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Claude App',
    executableName: 'claude-app',
    asar: {
      // Unpack native binaries and executable files so they can be loaded/executed at runtime
      // - .node/.dll/.dylib/.so: native Node addons
      // - cli.js: SDK's CLI entry point (spawned as child process)
      // - rg/rg.exe: ripgrep binary used by SDK
      // - .wasm: WebAssembly modules
      // - spawn-helper: node-pty Unix helper
      unpack: '{*.node,*.dll,*.dylib,*.so,*.wasm,**/cli.js,**/vendor/ripgrep/*/rg,**/vendor/ripgrep/*/rg.exe,**/spawn-helper}',
    },
    icon: './assets/icon', // electron-packager auto-resolves .icns (macOS) / .ico (Windows)
    extraResource: ['./assets'],
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy externalized node_modules into the build directory so they end up in the asar
      const projectRoot = process.cwd();
      for (const mod of EXTERNAL_MODULES) {
        const src = path.join(projectRoot, 'node_modules', ...mod.split('/'));
        const dest = path.join(buildPath, 'node_modules', ...mod.split('/'));
        if (await fs.pathExists(src)) {
          await fs.copy(src, dest, { dereference: true });
          console.log(`  ✓ Copied ${mod} to build`);
        } else {
          console.warn(`  ⚠ ${mod} not found in node_modules, skipping`);
        }
      }
    },
  },
  makers: [
    new MakerDMG({
      format: 'ULFO',
    }),
    new MakerSquirrel({
      name: 'claude-app',
      setupIcon: './assets/icon.ico',
      authors: 'k0ngk0ng',
    }),
    new MakerDeb({
      options: {
        maintainer: 'Claude App',
        homepage: 'https://github.com/k0ngk0ng/claude-app',
        icon: './assets/icon.png',
        categories: ['Development'],
      },
    }),
    new MakerZIP({}, ['darwin', 'linux']),
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/index.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
  ],
};

export default config;
