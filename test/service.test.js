import assert from 'node:assert/strict';
import test from 'node:test';
import { createService } from '../src/service.js';

const TOKEN = 'test-service-token';
const authorization = { authorization: `Bearer ${TOKEN}` };

const createRuntime = () => {
  const calls = [];
  return {
    calls,
    agentActive: true,
    async perform(action, parameters) {
      calls.push(['perform', action, parameters]);
      return { url: 'https://example.test', title: 'Example' };
    },
    async surfaceFrame(request) {
      calls.push(['frame', request.after, request.wait]);
      return { sequence: 4, bytes: Buffer.from('jpeg'), mime: 'image/jpeg', width: 800, height: 600, title: 'Frame 😀\nTitle' };
    },
    async surfaceInput(events) { calls.push(['input', events]); },
    async surfaceControl(controller) { calls.push(['control', controller]); },
    async surfaceResize(size) { calls.push(['resize', size]); return size; },
    async surfaceClipboard() { calls.push(['clipboard']); return 'copied'; },
    async close() { calls.push(['close']); },
  };
};

const startFixture = async (runtime = createRuntime()) => {
  const service = createService({ runtime, token: TOKEN, port: 0 });
  const address = await service.listen();
  return { runtime, service, origin: `http://${address.host}:${address.port}` };
};

test('requires the bearer token on every service endpoint', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const requests = [
    ['/health', { method: 'GET' }],
    ['/browser-control', { method: 'POST', body: '{}' }],
    ['/surface/frame?after=0&wait=0', { method: 'GET' }],
    ['/surface/input', { method: 'POST', body: '{}' }],
    ['/surface/control', { method: 'POST', body: '{}' }],
    ['/surface/resize', { method: 'POST', body: '{}' }],
    ['/surface/clipboard', { method: 'GET' }],
  ];

  const responses = await Promise.all(requests.map(([path, init]) => fetch(`${fixture.origin}${path}`, init)));

  assert.deepEqual(responses.map((response) => response.status), requests.map(() => 401));
  assert.deepEqual(fixture.runtime.calls, []);
});

test('dispatches SDK browser and surface protocol requests', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());

  const health = await fetch(`${fixture.origin}/health`, { headers: authorization });
  const browser = await fetch(`${fixture.origin}/browser-control`, {
    method: 'POST', headers: authorization,
    body: JSON.stringify({ requestId: 'browser-1', action: 'browser.back', parameters: {} }),
  });
  const input = await fetch(`${fixture.origin}/surface/input`, {
    method: 'POST', headers: authorization,
    body: JSON.stringify({ events: [{ type: 'text', text: 'hello' }] }),
  });
  const control = await fetch(`${fixture.origin}/surface/control`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ controller: 'user' }),
  });
  const resize = await fetch(`${fixture.origin}/surface/resize`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ width: 640, height: 480 }),
  });
  const clipboard = await fetch(`${fixture.origin}/surface/clipboard`, { headers: authorization });
  const frame = await fetch(`${fixture.origin}/surface/frame?after=2&wait=25`, { headers: authorization });

  assert.equal(health.status, 200);
  assert.deepEqual(await browser.json(), { ok: true, data: { url: 'https://example.test', title: 'Example' } });
  assert.equal(input.status, 204);
  assert.equal(control.status, 204);
  assert.deepEqual(await resize.json(), { width: 640, height: 480 });
  assert.deepEqual(await clipboard.json(), { text: 'copied' });
  assert.equal(frame.headers.get('x-surface-seq'), '4');
  assert.equal(frame.headers.get('x-surface-agent-active'), '1');
  assert.equal(frame.headers.get('x-surface-title'), 'Frame ? Title');
  assert.equal(await frame.text(), 'jpeg');
  assert.deepEqual(fixture.runtime.calls.slice(0, 6).map((call) => call[0]), [
    'perform', 'input', 'control', 'resize', 'clipboard', 'frame',
  ]);
});

test('rejects malformed protocol bodies before invoking the runtime', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());

  const responses = await Promise.all([
    fetch(`${fixture.origin}/browser-control`, { method: 'POST', headers: authorization, body: '{}' }),
    fetch(`${fixture.origin}/surface/input`, { method: 'POST', headers: authorization, body: '{"events":[{}]}' }),
    fetch(`${fixture.origin}/surface/control`, { method: 'POST', headers: authorization, body: '{"controller":"root"}' }),
    fetch(`${fixture.origin}/surface/resize`, { method: 'POST', headers: authorization, body: '{"width":0,"height":1}' }),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [400, 400, 400, 400]);
  assert.deepEqual(fixture.runtime.calls, []);
});

test('aborts a bounded frame wait when the service closes', async () => {
  const started = Promise.withResolvers();
  const aborted = Promise.withResolvers();
  const runtime = createRuntime();
  runtime.surfaceFrame = ({ signal }) => new Promise((resolve, reject) => {
    started.resolve();
    signal.addEventListener('abort', () => {
      aborted.resolve();
      reject(signal.reason);
    }, { once: true });
  });
  const fixture = await startFixture(runtime);
  const pending = fetch(`${fixture.origin}/surface/frame?after=0&wait=25000`, { headers: authorization });

  await started.promise;
  await fixture.service.close();

  await aborted.promise;
  const response = await pending.catch(() => null);
  if (response) assert.equal(response.status, 500);
  assert.equal(runtime.calls.at(-1)[0], 'close');
});
