import assert from 'node:assert/strict';
import test from 'node:test';
import { cssSize, viewerScale, viewportSummary } from '../src/viewports.js';

test('renders at a whole pixel ratio from 1 to 3, as Chrome emulates no other', () => {
  assert.deepEqual([2.25, 2.625, 1.25, 1.5, 2, 0.5, 4, Number.NaN].map(viewerScale), [2, 3, 1, 2, 2, 1, 3, 1]);
});

test('converts the panel from device pixels to bounded CSS pixels', () => {
  assert.deepEqual(cssSize({ width: 1400, height: 1001 }, 2), { width: 700, height: 501 });
  assert.deepEqual(cssSize({ width: 1500, height: 900 }, 1.5), { width: 1000, height: 600 });
  assert.deepEqual(cssSize({ width: 20_000, height: 1 }, 1), { width: 3840, height: 1 });
});

test('names preset sizes and reports anything else as custom', () => {
  assert.deepEqual(viewportSummary({ width: 390, height: 844, mobile: true }), { mode: 'mobile', width: 390, height: 844 });
  assert.deepEqual(viewportSummary({ width: 700, height: 500, mobile: false }), { mode: 'custom', width: 700, height: 500 });
});
