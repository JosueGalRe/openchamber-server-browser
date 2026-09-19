import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
await mkdir('service', { recursive: true });
await build({
  entryPoints: ['src/main.js'],
  outfile: 'service/main.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: false,
  legalComments: 'eof',
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
