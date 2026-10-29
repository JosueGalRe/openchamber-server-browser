import assert from 'node:assert/strict';
import test from 'node:test';
import { windowsChromeMajor } from '../src/chrome-process.js';

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
