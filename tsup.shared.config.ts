import { type Options } from 'tsup';

export const defaultConfig = Object.freeze({
  entry: ['src/index.ts'],
  outDir: 'lib',
  format: ['esm'],
  dts: false,
  sourcemap: true,
  clean: true,
  external: ['adm-zip'],
} satisfies Options);
