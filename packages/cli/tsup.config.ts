import { defineConfig } from 'tsup';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  target: 'node18',
  banner: { js: '#!/usr/bin/env node' },
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
});
