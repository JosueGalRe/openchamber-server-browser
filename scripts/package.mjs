import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
await import('./build.mjs');
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
await mkdir('artifacts', { recursive: true });
const output = `artifacts/openchamber-server-browser-${version}.zip`;
await rm(output, { force: true });
execFileSync('zip', ['-j', output, 'package.json', 'README.md', 'LICENSE', 'NOTICE', 'THIRD_PARTY_LICENSES', 'config.example.json'], { stdio: 'inherit' });
execFileSync('zip', [output, 'service/main.js', 'panel/index.html', 'panel/main.js', 'panel/inspector.html', 'panel/inspector.js', 'panel/status.html', 'panel/status.js'], { stdio: 'inherit' });
// The README links to these.
execFileSync('zip', ['-r', output, 'docs'], { stdio: 'inherit' });
console.log(output);
