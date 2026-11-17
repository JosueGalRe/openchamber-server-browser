import assert from 'node:assert/strict';
import test from 'node:test';
import { userAgentOverride, windowsChromeMajor } from '../src/chrome-process.js';

// A VS_VERSIONINFO resource as chrome.exe carries it: lengths and type, the key,
// padding to a 32-bit boundary, then VS_FIXEDFILEINFO.
const versionResource = (major, minor, build, patch) => {
  const fixed = Buffer.alloc(52);
  fixed.writeUInt32LE(0xfeef04bd, 0);
  fixed.writeUInt32LE(0x00010000, 4);
  fixed.writeUInt32LE(major * 0x10000 + minor, 8);
  fixed.writeUInt32LE(build * 0x10000 + patch, 12);
  return Buffer.concat([Buffer.alloc(6), Buffer.from('VS_VERSION_INFO\0', 'utf16le'), Buffer.alloc(2), fixed]);
};

test('reads Chrome\'s major version from a Windows executable', () => {
  // Given an executable whose version resource says 156.0.8078.73, after stray signature bytes and an
  // unrelated mention of the key, as in the real chrome.exe.
  const image = Buffer.concat([
    Buffer.from([0xbd, 0x04, 0xef, 0xfe, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x7c, 0x24]),
    Buffer.alloc(52),
    Buffer.from('VS_VERSION_INFO\0', 'utf16le'),
    Buffer.alloc(64),
    versionResource(156, 0, 8078, 73),
  ]);

  // Then the major version is 156, and an executable without the resource has none.
  assert.equal(windowsChromeMajor(image), 156);
  assert.equal(windowsChromeMajor(Buffer.alloc(256)), null);
  assert.equal(windowsChromeMajor(versionResource(156, 0, 8078, 73).subarray(0, 50)), null);
});

test('fills the client hints that --user-agent leaves empty', () => {
  // Given headless Chrome 157.0.8103.52 from the Google Chrome install on 64-bit Windows.
  const override = userAgentOverride({ product: 'HeadlessChrome/157.0.8103.52', branded: true, platform: 'win32', arch: 'x64' });

  // Then the tab override repeats the launch User-Agent and carries the full version.
  assert.equal(override.userAgent,
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36');
  const metadata = override.userAgentMetadata;
  assert.equal(metadata.fullVersion, '157.0.8103.52');
  assert.deepEqual(metadata.brands.map(({ brand }) => brand), ['Not-A.Brand', 'Chromium', 'Google Chrome']);
  assert.deepEqual(metadata.fullVersionList.at(-1), { brand: 'Google Chrome', version: '157.0.8103.52' });
  assert.equal(metadata.platform, 'Windows');
  assert.equal(metadata.architecture, 'x86');
  assert.equal(metadata.bitness, '64');
  assert.equal(metadata.mobile, false);
  assert.ok(!JSON.stringify(override).includes('Headless'));
});

test('names no Google Chrome brand for Chromium, and gives up on what it cannot read', () => {
  const chromium = userAgentOverride({ product: 'HeadlessChrome/157.0.8103.52', platform: 'linux', arch: 'arm64' });
  assert.deepEqual(chromium.userAgentMetadata.brands.map(({ brand }) => brand), ['Not-A.Brand', 'Chromium']);
  assert.equal(chromium.userAgentMetadata.platform, 'Linux');
  assert.equal(chromium.userAgentMetadata.architecture, 'arm');

  assert.equal(userAgentOverride({ product: 'HeadlessChrome/157.0.8103.52', platform: 'freebsd' }), null);
  assert.equal(userAgentOverride({ product: 'HeadlessChrome/108.0.5359.71', platform: 'win32' }), null);
  assert.equal(userAgentOverride({ product: 'HeadlessChrome', platform: 'win32' }), null);
});
