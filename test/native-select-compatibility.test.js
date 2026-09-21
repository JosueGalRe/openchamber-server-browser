import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeSelectCompatibility } from '../src/native-select-compatibility.js';

const createFixture = () => {
  const calls = [];
  let createFailureFrame = null;
  let clearFailure = false;
  const page = {
    sessionId: 'page-session',
    cdp: {
      async sendSession(_sessionId, method, parameters = {}) {
        calls.push([method, parameters]);
        if (method === 'Runtime.evaluate') return { result: { value: true } };
        if (method === 'Page.getFrameTree') {
          return {
            frameTree: {
              frame: { id: 'main' },
              childFrames: [{ frame: { id: 'child' } }],
            },
          };
        }
        if (method === 'CSS.createStyleSheet') {
          if (parameters.frameId === createFailureFrame) throw new Error('Frame rejected inspector styles');
          return { styleSheetId: `sheet-${parameters.frameId}` };
        }
        if (method === 'CSS.setStyleSheetText' && parameters.text === '' && clearFailure) {
          throw new Error('Could not clear inspector stylesheet');
        }
        return {};
      },
    },
  };
  const feature = createNativeSelectCompatibility({ ensurePage: async () => page, reportError: () => {} });
  return {
    calls,
    feature,
    failCreateFor(frameId) { createFailureFrame = frameId; },
    failClear(value) { clearFailure = value; },
  };
};

test('turns compatibility off and reports an error when a future document rejects styles', async () => {
  // Given compatibility enabled across the current frame tree.
  const fixture = createFixture();
  await fixture.feature.setEnabled(true);
  assert.equal(fixture.feature.enabled, true);

  // When a later main document rejects its inspector stylesheet.
  fixture.failCreateFor('main');
  fixture.feature.frameNavigated('main');
  await assert.rejects(fixture.feature.whenIdle(), /unavailable on this page/i);

  // Then state cannot claim the mode is applied, and remaining owned styles are cleared.
  assert.equal(fixture.feature.enabled, false);
  assert.match(fixture.feature.error, /rejected inspector styles/i);
  assert.equal(fixture.calls.some(([method, parameters]) => (
    method === 'CSS.setStyleSheetText' && parameters.styleSheetId === 'sheet-child' && parameters.text === ''
  )), true);
});

test('keeps failed stylesheet handles so disabling can retry cleanup', async () => {
  // Given an enabled mode whose first cleanup attempt fails.
  const fixture = createFixture();
  await fixture.feature.setEnabled(true);
  fixture.failClear(true);

  // When disabling fails and is retried after Chrome recovers.
  await assert.rejects(fixture.feature.setEnabled(false), /unavailable on this page/i);
  fixture.failClear(false);
  await fixture.feature.setEnabled(false);

  // Then the retry reaches the same owned stylesheet and clears the error.
  const mainClears = fixture.calls.filter(([method, parameters]) => (
    method === 'CSS.setStyleSheetText' && parameters.styleSheetId === 'sheet-main' && parameters.text === ''
  ));
  assert.ok(mainClears.length >= 2);
  assert.equal(fixture.feature.enabled, false);
  assert.equal(fixture.feature.error, '');
});
