import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extensionSetup, ignoresExtensionFlags, windowsChromeMajor } from '../src/chrome-process.js';

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

test('loads usable extension folders and allows them in the pages\' incognito contexts', (context) => {
  // Given two extension folders, and entries that cannot be loaded.
  // Chrome is given resolved paths, and macOS's temporary folder is behind a symlink.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'server-browser-extensions-')));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const folder = (name, manifest) => {
    const directory = path.join(root, name);
    fs.mkdirSync(directory);
    if (manifest !== undefined) fs.writeFileSync(path.join(directory, 'manifest.json'), manifest);
    return directory;
  };
  const first = folder('first', '{"manifest_version":3,"name":"First","version":"1"}');
  const second = folder('second', '{"manifest_version":3,"name":"Second","version":"1"}');
  const empty = folder('empty');
  const broken = folder('broken', '{');
  const comma = folder('a,b', '{}');
  const file = path.join(root, 'manifest-file.json');
  fs.writeFileSync(file, '{}');
  const logged = [];
  const log = (message) => logged.push(message);

  // When none is configured, then Chrome gets no extension flags.
  assert.deepEqual(extensionSetup([], log), { args: [], preferences: null });

  // When one is configured, then Chrome loads only it and its id is allowed in incognito.
  const one = extensionSetup([first], log);
  assert.deepEqual(one.args, [`--disable-extensions-except=${first}`, `--load-extension=${first}`]);
  const [id] = Object.keys(one.preferences.extensions.settings);
  assert.match(id, /^[a-p]{32}$/);
  assert.deepEqual(one.preferences.extensions.settings[id], { incognito: true });

  // When several are configured among unusable entries, then each unusable one is logged and the rest still load.
  const many = extensionSetup(['relative/ext', path.join(root, 'missing'), file, empty, broken, comma, first, second], log);
  assert.deepEqual(many.args, [`--disable-extensions-except=${first},${second}`, `--load-extension=${first},${second}`]);
  assert.equal(Object.keys(many.preferences.extensions.settings).length, 2);
  assert.deepEqual(logged, [
    'Skipping extension relative/ext from config.extensions: it is not an absolute path.',
    `Skipping extension ${path.join(root, 'missing')} from config.extensions: it does not exist.`,
    `Skipping extension ${file} from config.extensions: it is not a folder.`,
    `Skipping extension ${empty} from config.extensions: it has no manifest.json.`,
    `Skipping extension ${broken} from config.extensions: its manifest.json is not valid JSON.`,
    `Skipping extension ${comma} from config.extensions: Chrome cannot load a path that contains a comma.`,
  ]);

  // When only unusable entries are configured, then Chrome starts without extension flags.
  assert.deepEqual(extensionSetup([empty], () => {}), { args: [], preferences: null });
});

test('tells branded Google Chrome, which ignores extension flags, from builds that honor them', () => {
  assert.equal(ignoresExtensionFlags('Google Chrome 156.0.8078.73 \n'), true);
  assert.equal(ignoresExtensionFlags('Google Chrome 136.0.7103.113'), false);
  assert.equal(ignoresExtensionFlags('Google Chrome for Testing 156.0.8078.4 '), false);
  assert.equal(ignoresExtensionFlags('Chromium 156.0.8078.4 snap'), false);
});
