import { defineConfig } from 'tsup';

export default defineConfig([
  // React Widget configuration
  {
    entry: {
      index: 'src/index.ts',
      server: 'src/server.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['react', 'react-dom'],
    injectStyle: true,
  },
  // Chrome Extension configuration
  {
    entry: {
      background: 'src/extension/background.ts',
      sidepanel: 'src/extension/sidepanel.ts',
      offscreen: 'src/extension/offscreen.ts',
    },
    format: ['esm'],
    outExtension({ format }) {
      return { js: '.js' };
    },
    sourcemap: true,
    clean: false,
    minify: false,
    noExternal: [/.*/], // Bundle all shared code and adapters into the extension files
  }
]);
