import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { cli: 'bin/cli/index.ts' },
  outDir: 'bin/dist',
  format: ['esm'],
  target: 'node22',
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
})
