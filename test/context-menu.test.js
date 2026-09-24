import assert from 'node:assert/strict';
import test from 'node:test';
import { readMenuTheme } from '../src/context-menu.js';

test('maps host theme tokens onto the menu and drops tokens it cannot use', () => {
  assert.deepEqual(readMenuTheme({
    mode: 'dark',
    elevated: '#101010',
    border: 'red;} body { display: none',
    font: 'Inter, sans-serif',
    unknown: 'blue',
  }), { dark: true, properties: { '--menu-background': '#101010', '--menu-font': 'Inter, sans-serif' } });
  assert.equal(readMenuTheme({ mode: 'sepia' }), null);
  assert.equal(readMenuTheme(null), null);
});
