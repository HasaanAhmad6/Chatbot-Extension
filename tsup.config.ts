import { defineConfig } from 'tsup';

export default defineConfig({
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
  clean: true,
  minify: false,
  noExternal: [/.*/], // Bundle all shared code and adapters into the extension files
});
