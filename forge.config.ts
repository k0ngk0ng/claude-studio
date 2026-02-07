import type { ForgeConfig } from '@electron-forge/shared-types';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerZIP } from '@electron-forge/maker-zip';

const config: ForgeConfig = {
  packagerConfig: {
    name: 'Claude App',
    executableName: 'claude-app',
    asar: true,
    icon: './assets/icon', // electron-packager auto-resolves .icns (macOS) / .ico (Windows)
  },
  makers: [
    new MakerDMG({
      format: 'ULFO',
    }),
    new MakerSquirrel({
      name: 'claude-app',
      setupIcon: './assets/icon.ico',
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
          entry: 'src/preload/index.ts',
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
