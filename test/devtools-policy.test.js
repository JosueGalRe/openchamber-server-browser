import assert from 'node:assert/strict';
import test from 'node:test';
import { createDevToolsPolicy } from '../src/devtools-policy.js';

const command = (policy, method, params, extra = {}) => policy.command(JSON.stringify({ id: 1, method, params, ...extra }));

test('lets DevTools use the page\'s domains but not the browser, other targets, or server files', () => {
  const policy = createDevToolsPolicy({ browserContextId: 'ctx-1', targetId: 'page-1' });

  assert.equal(command(policy, 'Runtime.evaluate', { expression: '1' }).ok, true);
  assert.equal(command(policy, 'Page.navigate', { url: 'https://example.com/' }).ok, true);
  assert.equal(command(policy, 'Tracing.start', {}).ok, true);
  assert.equal(command(policy, 'Target.attachToTarget', { targetId: 'page-1', flatten: true }).ok, true);
  for (const [method, params] of [
    ['Browser.close', {}],
    ['Target.createTarget', { url: 'about:blank' }],
    ['Target.attachToTarget', { targetId: 'page-2', flatten: true }],
    ['Page.setDownloadBehavior', { behavior: 'allow', downloadPath: '/tmp' }],
    ['DOM.setFileInputFiles', { files: ['/etc/passwd'], nodeId: 1 }],
    ['Input.dispatchDragEvent', { type: 'drop', x: 0, y: 0, data: { items: [], files: ['/etc/passwd'], dragOperationsMask: 1 } }],
    ['Emulation.setDeviceMetricsOverride', { width: 1, height: 1, deviceScaleFactor: 1, mobile: false }],
    ['SystemInfo.getProcessInfo', {}],
  ]) {
    assert.deepEqual(command(policy, method, params).response?.error?.message, 'Command is not available for this page', method);
  }
  // Protocol violations end the connection instead of getting an answer.
  assert.deepEqual(command(policy, 'Page.navigate', { url: 'file:///etc/passwd' }), { ok: false });
  assert.deepEqual(command(policy, 'Runtime.evaluate', {}, { sessionId: 'unknown' }), { ok: false });
  assert.deepEqual(command(policy, 'Storage.getCookies', { browserContextId: 'ctx-2' }), { ok: false });
  assert.deepEqual(command(policy, 'IO.read', { handle: 'stolen' }), { ok: false });
  assert.deepEqual(policy.command('not json'), { ok: false });
});

test('binds cookie commands to the scope\'s context', () => {
  const policy = createDevToolsPolicy({ browserContextId: 'ctx-1', targetId: 'page-1' });

  assert.deepEqual(command(policy, 'Storage.getCookies', {}).message.params, { browserContextId: 'ctx-1' });
});

test('follows the page\'s own child sessions and stream handles', () => {
  const policy = createDevToolsPolicy({ browserContextId: 'ctx-1', targetId: 'page-1' });
  const event = (message) => policy.event(JSON.stringify(message));

  // Given a frame of the page attached, and one from another context.
  assert.equal(event({ method: 'Target.attachedToTarget', params: { sessionId: 's-1', targetInfo: { targetId: 'frame-1', browserContextId: 'ctx-1' } } }).ok, true);
  assert.equal(event({ method: 'Target.attachedToTarget', params: { sessionId: 's-2', targetInfo: { targetId: 'other', browserContextId: 'ctx-2' } } }).ok, false);

  // Then commands may name only the page's session, and its events pass.
  assert.equal(command(policy, 'Runtime.enable', {}, { sessionId: 's-1' }).ok, true);
  assert.equal(command(policy, 'Runtime.enable', {}, { sessionId: 's-2' }).ok, false);
  assert.equal(event({ method: 'Runtime.consoleAPICalled', sessionId: 's-1', params: {} }).ok, true);

  // When a trace completes, then its stream may be read once and closed.
  assert.equal(event({ method: 'Tracing.tracingComplete', params: { stream: 'trace-1' } }).ok, true);
  assert.equal(command(policy, 'IO.read', { handle: 'trace-1' }).ok, true);
  assert.equal(command(policy, 'IO.close', { handle: 'trace-1' }).ok, true);
  assert.deepEqual(command(policy, 'IO.read', { handle: 'trace-1' }), { ok: false });

  // When the frame detaches, then its session is gone.
  assert.equal(event({ method: 'Target.detachedFromTarget', params: { sessionId: 's-1' } }).ok, true);
  assert.deepEqual(command(policy, 'Runtime.enable', {}, { sessionId: 's-1' }), { ok: false });
});
