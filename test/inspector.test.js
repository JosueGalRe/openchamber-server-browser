import assert from 'node:assert/strict';
import test from 'node:test';
import { InspectorError, createInspector } from '../src/inspector.js';
import { formatHeaders, normalizeBody, redactUrl } from '../src/inspector-format.js';

test('redacts credentials in URLs, headers, and bodies and withholds JSON it cannot parse', () => {
  assert.equal(redactUrl('https://user:pass@example.test/a?token=abc&q=1'), 'https://example.test/a?token=%5BREDACTED%5D&q=1');
  assert.deepEqual(formatHeaders({ Authorization: 'Bearer x', Accept: 'text/html' }).headers, [
    { name: 'Authorization', value: '[REDACTED]' },
    { name: 'Accept', value: 'text/html' },
  ]);
  const json = normalizeBody('{"user":"ada","password":"hunter2","nested":{"apiKey":"k"}}', false, 'application/json');
  assert.deepEqual(JSON.parse(json.text), { user: 'ada', password: '[REDACTED]', nested: { apiKey: '[REDACTED]' } });
  assert.equal(normalizeBody('{"password": "hunter2"', false, 'application/json').supported, false);
  assert.equal(normalizeBody('a=1&secret=2', false, 'application/x-www-form-urlencoded').text, 'a=1&secret=%5BREDACTED%5D');
  assert.equal(normalizeBody('binary', false, 'image/png').supported, false);
});

test('serves captured rows after a cursor within batch limits and ends idle or replaced captures', async () => {
  // Given a capture on one tab.
  const sent = [];
  const inspector = createInspector({ send: async (sessionId, method) => { sent.push([sessionId, method]); return {}; } });
  const tab = { targetId: 't1', sessionId: 's1', mainFrameId: 't1', url: 'https://example.test/', title: 'Example' };
  const { captureId } = await inspector.start(tab);
  assert.deepEqual(sent, [['s1', 'Network.enable']]);

  // When the page logs 40 messages and makes a request, then polling pages through them in order.
  for (let index = 0; index < 40; index += 1) {
    inspector.event('s1', 'Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'string', value: `line ${index}` }], timestamp: Date.now() + 1 });
  }
  inspector.event('s1', 'Network.requestWillBeSent', {
    requestId: 'r1', timestamp: 1, wallTime: Date.now() / 1000, type: 'Fetch',
    request: { method: 'GET', url: 'https://example.test/api?token=abc', headers: {} },
  });
  inspector.event('s2', 'Runtime.consoleAPICalled', { type: 'log', args: [{ type: 'string', value: 'other tab' }], timestamp: Date.now() + 1 });
  const first = inspector.events(captureId, 0);
  const second = inspector.events(captureId, first.cursor);
  assert.equal(first.console.length, 32);
  assert.equal(first.more, true);
  assert.equal(second.console.length, 8);
  assert.equal(second.network[0].url, 'https://example.test/api?token=%5BREDACTED%5D');
  assert.equal(second.more, false);
  assert.deepEqual(inspector.events(captureId, second.cursor).console, []);

  // When the request completes, then the updated row comes back after the cursor.
  inspector.event('s1', 'Network.responseReceived', { requestId: 'r1', timestamp: 2, response: { status: 200, mimeType: 'application/json', headers: {} } });
  assert.equal(inspector.events(captureId, second.cursor).network[0].status, 200);

  // When the tab stops being the active one, then the capture is gone and the network domain released.
  inspector.endTab('s1');
  assert.throws(() => inspector.events(captureId, 0), (error) => error instanceof InspectorError && error.code === 'CAPTURE_GONE');
  assert.deepEqual(sent.at(-1), ['s1', 'Network.disable']);
});
