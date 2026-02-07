import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'src/main/index.ts',
      formats: ['cjs'],
      fileName: () => 'main.js',
    },
    rollupOptions: {
      external: ['electron', 'node-pty', 'path', 'fs', 'os', 'child_process', 'events'],
    },
    minify: false,
    sourcemap: true,
  },
  resolve: {
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
