import assert from 'node:assert/strict';
import test from 'node:test';
import { InspectorError } from '../src/inspector.js';
import { createService } from '../src/service.js';

const TOKEN = 'test-service-token';
const authorization = { authorization: `Bearer ${TOKEN}` };

const createRuntime = () => {
  const calls = [];
  return {
    calls,
    agentActive: true,
    async perform(action, parameters, signal, context) {
      calls.push(['perform', action, parameters, context]);
      return { url: 'https://example.test', title: 'Example' };
    },
    state() {
      return {
        controller: 'none',
        selectedScopeId: '["/repo","ses_1"]',
        generation: 1,
        scopes: [{
          id: '["/repo","ses_1"]', directory: '/repo', sessionId: 'ses_1', selected: true,
          url: 'https://example.test', title: 'Example',
          nativeSelectCompatibility: false, nativeSelectCompatibilityError: '',
        }],
      };
    },
    async selectScope(id, generation) { calls.push(['select', id, generation]); },
    async navigate(url, generation) { calls.push(['navigate', url, generation]); },
    async reload(generation) { calls.push(['reload', generation]); },
    async inspectorStart() { calls.push(['inspector-start']); return { captureId: 'cap-1' }; },
    inspectorEvents(captureId, after) {
      calls.push(['inspector-events', captureId, after]);
      if (captureId !== 'cap-1') throw new InspectorError('CAPTURE_GONE');
      return { cursor: after, more: false, console: [], network: [] };
    },
    async inspectorEvaluate(captureId, expression) { calls.push(['inspector-evaluate', captureId, expression]); return { text: '2', isError: false, truncated: false }; },
    async openScope(scope, generation) { calls.push(['open-scope', scope, generation]); },
    setViewerTheme(theme) { calls.push(['theme', theme]); },
    async setDevicePixelRatio(ratio) { calls.push(['ratio', ratio]); },
    async setViewport(viewport, generation) { calls.push(['viewport', viewport, generation]); },
    async newTab(generation) { calls.push(['tab-new', generation]); },
    async selectTab(tabId, generation) { calls.push(['tab-select', tabId, generation]); },
    async closeTab(tabId, generation) { calls.push(['tab-close', tabId, generation]); },
    async stop(generation) { calls.push(['stop', generation]); },
    async back(generation) { calls.push(['back', generation]); },
    async forward(generation) { calls.push(['forward', generation]); },
    async setNativeSelectCompatibility(enabled, generation) { calls.push(['select-compatibility', enabled, generation]); },
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
    body: JSON.stringify({
      requestId: 'browser-1',
      action: 'browser.back',
      parameters: {},
      context: { directory: '/repo', sessionId: 'ses_1' },
    }),
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
  assert.deepEqual(fixture.runtime.calls[0][3], { directory: '/repo', sessionId: 'ses_1' });
});

test('serves dock state and serializes scope and navigation commands', async (context) => {
  // Given a running service with one browser scope.
  const fixture = await startFixture();
  context.after(() => fixture.service.close());

  // When the dock reads state, selects the scope, and navigates history.
  const state = await fetch(`${fixture.origin}/browser/state`, { headers: authorization });
  const select = await fetch(`${fixture.origin}/browser/select`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ scopeId: '["/repo","ses_1"]', generation: 1 }),
  });
  const navigate = await fetch(`${fixture.origin}/browser/navigate`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ url: 'https://next.test', generation: 1 }),
  });
  const back = await fetch(`${fixture.origin}/browser/back`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ generation: 1 }),
  });
  const forward = await fetch(`${fixture.origin}/browser/forward`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ generation: 1 }),
  });

  // Then each official service route returns state and invokes the matching manager operation.
  assert.equal(state.status, 200);
  assert.equal((await state.json()).selectedScopeId, '["/repo","ses_1"]');
  assert.deepEqual([select.status, navigate.status, back.status, forward.status], [200, 200, 200, 200]);
  assert.deepEqual(fixture.runtime.calls.slice(0, 4), [
    ['select', '["/repo","ses_1"]', 1],
    ['navigate', 'https://next.test', 1],
    ['back', 1],
    ['forward', 1],
  ]);
});

test('adds a scheme to typed dock addresses', async (context) => {
  // Given a running service.
  const fixture = await startFixture();
  context.after(() => fixture.service.close());

  // When the dock navigates to addresses typed with and without a scheme.
  for (const url of ['192.168.1.20:3100/app', 'localhost:5173', '[::1]:8080', 'example.com/docs', 'http://plain.test']) {
    await fetch(`${fixture.origin}/browser/navigate`, {
      method: 'POST', headers: authorization, body: JSON.stringify({ url, generation: 1 }),
    });
  }

  // Then IPs and localhost use HTTP, other hosts use HTTPS, and explicit schemes are kept.
  assert.deepEqual(fixture.runtime.calls.map(([, url]) => url), [
    'http://192.168.1.20:3100/app',
    'http://localhost:5173',
    'http://[::1]:8080',
    'https://example.com/docs',
    'http://plain.test',
  ]);
});

test('rejects malformed dock requests before invoking the manager', async (context) => {
  // Given a running service.
  const fixture = await startFixture();
  context.after(() => fixture.service.close());

  // When dock commands omit their required string, then the service refuses both.
  const responses = await Promise.all([
    fetch(`${fixture.origin}/browser/select`, { method: 'POST', headers: authorization, body: '{}' }),
    fetch(`${fixture.origin}/browser/navigate`, { method: 'POST', headers: authorization, body: '{"url":7}' }),
  ]);
  assert.deepEqual(responses.map((response) => response.status), [400, 400]);
  assert.deepEqual(fixture.runtime.calls, []);
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


test('dock reload and stop require a generation and invoke their operations', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const invalid = await fetch(`${fixture.origin}/browser/reload`, {
    method: 'POST', headers: authorization, body: '{}',
  });
  assert.equal(invalid.status, 400);
  const reload = await fetch(`${fixture.origin}/browser/reload`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ generation: 1 }),
  });
  const stop = await fetch(`${fixture.origin}/browser/stop`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ generation: 1 }),
  });
  assert.equal(reload.status, 200);
  assert.equal(stop.status, 200);
  assert.deepEqual(fixture.runtime.calls, [['reload', 1], ['stop', 1]]);
});

test('native select compatibility route parses a boolean and uses dock generation', async (context) => {
  // Given a running service and the selected browser generation.
  const fixture = await startFixture();
  context.after(() => fixture.service.close());

  // When invalid and valid compatibility requests arrive.
  const invalid = await fetch(`${fixture.origin}/browser/select-compatibility`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ enabled: 'yes', generation: 1 }),
  });
  const enabled = await fetch(`${fixture.origin}/browser/select-compatibility`, {
    method: 'POST', headers: authorization, body: JSON.stringify({ enabled: true, generation: 1 }),
  });

  // Then malformed input is rejected and the valid mutation reaches the manager once.
  assert.equal(invalid.status, 400);
  assert.equal(enabled.status, 200);
  assert.deepEqual(fixture.runtime.calls, [['select-compatibility', true, 1]]);
});


test('answers no content when nothing was copied so the viewer keeps its clipboard', async (context) => {
  const runtime = createRuntime();
  runtime.surfaceClipboard = async () => '';
  const fixture = await startFixture(runtime);
  context.after(() => fixture.service.close());

  const clipboard = await fetch(`${fixture.origin}/surface/clipboard`, { headers: authorization });

  assert.equal(clipboard.status, 204);
  assert.equal(await clipboard.text(), '');
});

test('dock tab routes validate their fields and reach the manager', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const post = (path, body) => fetch(`${fixture.origin}${path}`, {
    method: 'POST', headers: authorization, body: JSON.stringify(body),
  });

  const missingTab = await post('/browser/tabs/select', { generation: 1 });
  const unknown = await post('/browser/tabs/move', { generation: 1, tabId: 'tab-2' });
  const created = await post('/browser/tabs/new', { generation: 1 });
  const selected = await post('/browser/tabs/select', { generation: 1, tabId: 'tab-2' });
  const closed = await post('/browser/tabs/close', { generation: 1, tabId: 'tab-2' });

  assert.equal(missingTab.status, 400);
  assert.equal(unknown.status, 404);
  assert.deepEqual([created.status, selected.status, closed.status], [200, 200, 200]);
  assert.deepEqual(fixture.runtime.calls, [['tab-new', 1], ['tab-select', 'tab-2', 1], ['tab-close', 'tab-2', 1]]);
});

test('validates viewer ratio and viewport requests at the service boundary', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const post = (path, body) => fetch(`${fixture.origin}${path}`, {
    method: 'POST', headers: authorization, body: JSON.stringify(body),
  });

  const badRatio = await post('/browser/viewer', { devicePixelRatio: 'x' });
  const ratio = await post('/browser/viewer', { devicePixelRatio: 1.5 });
  const missingMobile = await post('/browser/viewport', { generation: 1, mode: 'auto' });
  const tooWide = await post('/browser/viewport', { generation: 1, mode: 'fixed', width: 4000, height: 800, mobile: false });
  const fixed = await post('/browser/viewport', { generation: 1, mode: 'fixed', width: 800, height: 600, mobile: true, source: 'agent' });

  assert.deepEqual([badRatio.status, ratio.status, missingMobile.status, tooWide.status, fixed.status], [400, 200, 400, 400, 200]);
  assert.deepEqual(fixture.runtime.calls, [
    ['ratio', 1.5],
    ['viewport', { mode: 'fixed', width: 800, height: 600, mobile: true }, 1],
  ]);
});

test('accepts the host theme for the page menu and rejects an unknown mode', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const post = (path, body) => fetch(`${fixture.origin}${path}`, {
    method: 'POST', headers: authorization, body: JSON.stringify(body),
  });

  const badMode = await post('/browser/viewer', { theme: { mode: 'sepia' } });
  const empty = await post('/browser/viewer', {});
  const themed = await post('/browser/viewer', { theme: { mode: 'dark', elevated: '#101010' } });

  assert.deepEqual([badMode.status, empty.status, themed.status], [400, 400, 200]);
  assert.deepEqual(fixture.runtime.calls, [['theme', { dark: true, properties: { '--menu-background': '#101010' } }]]);
});

test('opens a chat scope for the dock only with a complete, bounded context', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const post = (path, body) => fetch(`${fixture.origin}${path}`, {
    method: 'POST', headers: authorization, body: JSON.stringify(body),
  });

  const missing = await post('/browser/scope', { directory: '/repo', generation: 1 });
  const oversized = await post('/browser/scope', { directory: '/repo', sessionId: 's'.repeat(257), generation: 1 });
  const opened = await post('/browser/scope', { directory: '/repo', sessionId: 'ses_1', generation: 1 });

  assert.deepEqual([missing.status, oversized.status, opened.status], [400, 400, 200]);
  assert.deepEqual(fixture.runtime.calls, [['open-scope', { directory: '/repo', sessionId: 'ses_1' }, 1]]);
});

test('routes inspector calls with validated identities and reports failures as codes', async (context) => {
  const fixture = await startFixture();
  context.after(() => fixture.service.close());
  const post = (path, body) => fetch(`${fixture.origin}${path}`, {
    method: 'POST', headers: authorization, body: JSON.stringify(body),
  });

  const started = await post('/inspector/start', {});
  const events = await fetch(`${fixture.origin}/inspector/events?captureId=cap-1&after=4`, { headers: authorization });
  const gone = await fetch(`${fixture.origin}/inspector/events?captureId=old&after=0`, { headers: authorization });
  const evaluated = await post('/inspector/evaluate', { captureId: 'cap-1', expression: '1 + 1' });
  const invalid = await post('/inspector/evaluate', { captureId: 'cap-1' });

  assert.deepEqual(await started.json(), { captureId: 'cap-1' });
  assert.equal(events.status, 200);
  assert.equal(gone.status, 410);
  assert.equal((await gone.json()).code, 'CAPTURE_GONE');
  assert.deepEqual(await evaluated.json(), { text: '2', isError: false, truncated: false });
  assert.equal(invalid.status, 400);
  assert.deepEqual(fixture.runtime.calls.map((call) => call[0]), ['inspector-start', 'inspector-events', 'inspector-events', 'inspector-evaluate']);
});