import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('service', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['src/main.js'],
    outfile: 'service/main.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: false,
    legalComments: 'eof',
    banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
  }),
  build({
    entryPoints: ['src/panel.js'],
    outfile: 'panel/main.js',
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    sourcemap: false,
    legalComments: 'eof',
  }),
]);
