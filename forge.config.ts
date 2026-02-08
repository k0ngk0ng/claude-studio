import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerZIP } from '@electron-forge/maker-zip';
import path from 'path';
import fs from 'fs';

// Externalized native/ESM modules that must be copied into the packaged app
const EXTERNAL_MODULES = ['@anthropic-ai/claude-agent-sdk'];

// node-pty directories/files to SKIP when copying (avoids electron-rebuild trigger)
const NODE_PTY_SKIP = new Set([
  'binding.gyp',  // triggers node-gyp rebuild
  'build',        // compiled output (we use prebuilds instead)
  'deps',         // build dependencies (winpty source)
  'src',          // C++ source files
  'scripts',      // build scripts
  'node-addon-api', // build dependency
]);

/** Recursively copy a directory, with optional skip set */
function copyDirSync(src: string, dest: string, skip?: Set<string>) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip?.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      // Dereference symlinks — copy the target file
      const realPath = fs.realpathSync(srcPath);
      fs.copyFileSync(realPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

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
      unpack: '{*.node,*.dll,*.dylib,*.so,*.wasm,*.exe,**/cli.js,**/vendor/ripgrep/*/rg,**/spawn-helper}',
    },
    icon: './assets/icon', // electron-packager auto-resolves .icns (macOS) / .ico (Windows)
    extraResource: ['./assets'],
  },
  hooks: {
    packageAfterCopy: async (_config, buildPath) => {
      // Copy externalized node_modules into the build directory so they end up in the asar
      const projectRoot = process.cwd();

      // 1. Copy node-pty (skip build artifacts to prevent electron-rebuild from triggering)
      const ptySrc = path.join(projectRoot, 'node_modules', 'node-pty');
      const ptyDest = path.join(buildPath, 'node_modules', 'node-pty');
      if (fs.existsSync(ptySrc)) {
        copyDirSync(ptySrc, ptyDest, NODE_PTY_SKIP);
        console.log('  ✓ Copied node-pty to build (runtime files only)');
      } else {
        console.warn('  ⚠ node-pty not found in node_modules, skipping');
      }

      // 2. Copy other externalized modules
      for (const mod of EXTERNAL_MODULES) {
        const src = path.join(projectRoot, 'node_modules', ...mod.split('/'));
        const dest = path.join(buildPath, 'node_modules', ...mod.split('/'));
        if (fs.existsSync(src)) {
          copyDirSync(src, dest);
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
