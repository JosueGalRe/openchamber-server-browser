import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { createBrowserManager } from '../src/browser-manager.js';
import { createBrowserRuntime } from '../src/browser-runtime.js';
import { createChromeProcess, resolveChromePath } from '../src/chrome-process.js';

const modifiers = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve) => server.close(resolve));

const waitFor = async (predicate, timeoutMs = 5_000) => {
  const deadline = Date.now() + timeoutMs;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

const html = (body, title) => `<!doctype html>
<html><head><title>${title}</title><style>
body { margin: 0; font-family: sans-serif; min-height: 2400px; }
#surface { position: absolute; left: 10px; top: 10px; width: 130px; height: 44px; }
#name { position: absolute; left: 10px; top: 70px; }
#mark { position: absolute; left: 10px; top: 120px; }
#output { position: absolute; left: 10px; top: 180px; }
#hash { position: absolute; left: 10px; top: 230px; }
</style></head><body>${body}</body></html>`;

const startWebFixture = async () => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    if (request.url === '/selects') {
      response.setHeader('content-security-policy', "default-src 'self'; style-src 'none'; script-src 'unsafe-inline'");
      response.end(html(`
        <input id="name" aria-label="Name" value="initial">
        <select id="native"><option>One</option><option>Two</option></select>
        <select id="listbox" size="2"><option>One</option><option>Two</option></select>
        <button id="custom" role="combobox">Custom menu</button>
      `, 'Select compatibility'));
      return;
    }
    if (request.url === '/next') {
      response.end(html('<h1>Next page</h1><a href="/">Home</a>', 'Next'));
      return;
    }
    if (request.url === '/tabs') {
      response.end(html(`
        <a id="surface" href="/next" target="_blank">Open next</a>
        <button id="mark" onclick="window.open('/next', 'popup')">Open popup</button>
      `, 'Tabs'));
      return;
    }
    if (request.url === '/title') {
      response.end(html('<button id="surface" onclick="document.title = \'Renamed by the page\'">Rename</button>', 'Title before'));
      return;
    }
    if (request.url === '/slow') {
      response.write('<!doctype html><title>Slow</title><p>Still loading');
      const timer = setTimeout(() => response.end('</p>'), 10_000);
      response.once('close', () => clearTimeout(timer));
      return;
    }
    if (request.url === '/copy') {
      response.end(html(`
        <input id="secret" type="password" value="hunter2">
        <div id="host"></div>
        <iframe id="frame" srcdoc="<textarea id='inner'>frame text</textarea>"></iframe>
        <script>
          document.querySelector('#host').attachShadow({ mode: 'open' }).innerHTML = '<input id="shadowed" value="shadow text">';
        </script>
      `, 'Copy'));
      return;
    }
    if (request.url === '/keys') {
      response.end(html(`
        <textarea id="notes"></textarea>
        <form id="form"><input id="field" value="hello world"></form>
        <output id="submits">0</output>
        <script>
          document.querySelector('#form').addEventListener('submit', (event) => {
            event.preventDefault();
            const submits = document.querySelector('#submits');
            submits.textContent = String(Number(submits.textContent) + 1);
          });
        </script>
      `, 'Keys'));
      return;
    }
    response.end(html(`
      <button id="surface" onclick="this.textContent='Surface clicked'">Surface</button>
      <input id="name" aria-label="Name" value="initial">
      <button id="mark" onclick="document.querySelector('#output').textContent=document.querySelector('#name').value">Mark</button>
      <div id="output">Waiting</div>
      <a id="hash" href="#section">Section</a>
      <h1 id="section" style="margin-top:320px">Browser fixture</h1>
    `, 'Fixture'));
  });
  const port = await listen(server);
  return { server, origin: `http://127.0.0.1:${port}` };
};

let chromePath = null;
try {
  chromePath = resolveChromePath();
} catch {}

test('runs every browser action and the shared surface against real Chrome', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());

  const opened = await runtime.perform('browser.open', { url: `${web.origin}/`, viewport: 'desktop' });
  const initial = await runtime.perform('browser.snapshot', {});
  const inspected = await runtime.perform('browser.inspect', { selector: '#name' });
  await runtime.perform('browser.type', { selector: '#name', value: 'Ada', submit: false });
  await runtime.perform('browser.click', { selector: '#mark' });
  const marked = await runtime.perform('browser.snapshot', {});
  const scrolled = await runtime.perform('browser.scroll', { direction: 'bottom' });
  const capture = await runtime.perform('browser.capture', { label: 'fixture' });
  const resized = await runtime.perform('browser.resize', { viewport: 'mobile' });
  await runtime.perform('browser.open', { url: `${web.origin}/next` });
  const back = await runtime.perform('browser.back', {});
  const forward = await runtime.perform('browser.forward', {});

  assert.equal(opened.opened, true);
  assert.equal(opened.url, `${web.origin}/`);
  assert.match(initial.text, /Browser fixture/);
  assert.equal(inspected.tag, 'input');
  assert.match(marked.text, /Ada/);
  assert.equal(scrolled.atBottom, true);
  assert.equal(Buffer.from(capture.base64, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.deepEqual(resized.viewport, { mode: 'mobile', width: 390, height: 844 });
  assert.equal(back.title, 'Fixture');
  assert.equal(forward.title, 'Next');

  await runtime.perform('browser.back', {});
  await runtime.perform('browser.scroll', { direction: 'top' });
  const frame = await runtime.surfaceFrame({ after: 0, wait: 10_000 });
  await runtime.surfaceInput([
    { type: 'pointer', action: 'down', x: 30, y: 30, button: 0, buttons: 1, modifiers },
    { type: 'pointer', action: 'up', x: 30, y: 30, button: 0, buttons: 0, modifiers },
  ]);
  const afterPointer = await runtime.perform('browser.snapshot', {});
  const page = await runtime.ensurePage();
  const withinDocument = Promise.withResolvers();
  const stopWatchingNavigation = page.cdp.onEvent((event) => {
    if (event.sessionId === page.sessionId && event.method === 'Page.navigatedWithinDocument') withinDocument.resolve();
  });
  await runtime.surfaceInput([
    { type: 'pointer', action: 'down', x: 30, y: 240, button: 0, buttons: 1, modifiers },
    { type: 'pointer', action: 'up', x: 30, y: 240, button: 0, buttons: 0, modifiers },
  ]);
  await withinDocument.promise;
  stopWatchingNavigation();
  assert.equal(runtime.url, `${web.origin}/#section`);
  await runtime.surfaceResize({ width: 700, height: 500 });
  const afterSurfaceResize = await runtime.perform('browser.snapshot', {});

  assert.equal(frame.mime, 'image/jpeg');
  assert.ok(frame.bytes.length > 100);
  assert.match(afterPointer.text, /Surface clicked/);
  assert.deepEqual(afterSurfaceResize.viewport, { mode: 'custom', width: 700, height: 500 });

  runtime.surfaceControl('user');
  await assert.rejects(
    runtime.perform('browser.snapshot', {}),
    /user controls the browser/i,
  );
  runtime.surfaceControl('agent');
  assert.match((await runtime.perform('browser.snapshot', {})).text, /Browser fixture/);
});

test('removes the temporary Chrome profile on shutdown', { skip: chromePath ? false : 'Chrome is unavailable' }, async () => {
  const chrome = createChromeProcess({ chromePath });
  const running = await chrome.ensure();
  const profileDir = running.profileDir;

  await chrome.close();

  assert.equal(fs.existsSync(profileDir), false);
  assert.notEqual(running.process.exitCode === null && running.process.signalCode === null, true);
});


test('reload reloads the document even when its URL contains a fragment', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: `${web.origin}/#section` });
  await runtime.perform('browser.type', { selector: '#name', value: 'Before reload', submit: false });
  await runtime.perform('browser.click', { selector: '#mark' });
  assert.match((await runtime.perform('browser.snapshot', {})).text, /Before reload/);
  await runtime.command('reload');
  const snapshotText = () => runtime.perform('browser.snapshot', {}).then((snapshot) => snapshot.text, () => '');
  await waitFor(async () => /Waiting/.test(await snapshotText()));
  assert.equal(runtime.url, `${web.origin}/#section`);
  assert.doesNotMatch(await snapshotText(), /Before reload/);
});

test('applies and removes native select compatibility without reloading page state', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a CSP-protected page with native, listbox, and custom dropdown controls.
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: `${web.origin}/selects` });
  await runtime.perform('browser.type', { selector: '#name', value: 'Preserved', submit: false });
  const page = await runtime.ensurePage();
  const appearances = async () => {
    const result = await page.cdp.sendSession(page.sessionId, 'Runtime.evaluate', {
      expression: `JSON.stringify({
        native: getComputedStyle(document.querySelector('#native')).appearance,
        listbox: getComputedStyle(document.querySelector('#listbox')).appearance,
        custom: getComputedStyle(document.querySelector('#custom')).appearance,
        value: document.querySelector('#name').value,
      })`,
      returnByValue: true,
    });
    return JSON.parse(result.result.value);
  };
  const before = await appearances();

  // When compatibility is enabled, then only the single-choice native select opts in.
  await runtime.setNativeSelectCompatibility(true);
  const enabled = await appearances();
  assert.equal(enabled.native, 'base-select');
  assert.equal(enabled.listbox, before.listbox);
  assert.equal(enabled.custom, before.custom);
  assert.equal(enabled.value, 'Preserved');

  // When the page navigates and compatibility is disabled, then it follows navigation and reverses without reload.
  await runtime.command('reload');
  let afterReload = null;
  await waitFor(async () => {
    afterReload = await appearances().catch(() => null);
    return afterReload?.value === 'initial' && afterReload.native === 'base-select';
  });
  assert.equal(afterReload.native, 'base-select');
  await runtime.perform('browser.type', { selector: '#name', value: 'Still here', submit: false });
  await runtime.setNativeSelectCompatibility(false);
  const disabled = await appearances();
  assert.equal(disabled.native, before.native);
  assert.equal(disabled.value, 'Still here');
});


test('types editing keys, Enter, select-all, and composed characters like a local keyboard', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a page with a textarea and a single-field form.
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: `${web.origin}/keys` });
  const page = await runtime.ensurePage();
  const evaluate = async (expression) => (await page.cdp.sendSession(page.sessionId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
  })).result.value;
  const press = (key, code, pressed = {}) => runtime.surfaceInput(['down', 'up'].map((action) => ({
    type: 'key', action, key, code, modifiers: { ...modifiers, ...pressed },
  })));

  // When the viewer types text, Enter, AltGr and Option characters, and two shortcuts.
  await evaluate('document.querySelector("#notes").focus()');
  await press('a', 'KeyA');
  await press('Enter', 'Enter');
  await press('b', 'KeyB');
  await press('@', 'KeyQ', { ctrl: true, alt: true });
  await press('@', 'Digit2', { alt: true });
  await press('c', 'KeyC', { ctrl: true });
  await press('d', 'KeyD', { alt: true });

  // Then Enter adds a line, composed characters are typed, and shortcuts type nothing.
  assert.equal(await evaluate('document.querySelector("#notes").value'), 'a\nb@@');

  // When the caret moves with End and Home, and Meta+A selects the field.
  await evaluate('document.querySelector("#field").focus(); document.querySelector("#field").setSelectionRange(5, 5)');
  const selection = 'JSON.stringify([document.querySelector("#field").selectionStart, document.querySelector("#field").selectionEnd])';
  await press('End', 'End');
  const afterEnd = await evaluate(selection);
  await press('Home', 'Home');
  const afterHome = await evaluate(selection);
  await press('a', 'KeyA', { meta: true });
  const afterSelectAll = await evaluate(selection);
  await press('Enter', 'Enter');

  // Then each key runs Chrome's default action, and Enter submits the form.
  assert.equal(afterEnd, '[11,11]');
  assert.equal(afterHome, '[0,0]');
  assert.equal(afterSelectAll, '[0,11]');
  assert.equal(await evaluate('document.querySelector("#submits").textContent'), '1');
});

test('copies the focused selection through shadow roots and same-origin frames but never a password', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a page with a password field, an open shadow root, and a same-origin frame.
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: `${web.origin}/copy` });
  const page = await runtime.ensurePage();
  const select = (expression) => page.cdp.sendSession(page.sessionId, 'Runtime.evaluate', { expression });

  // When text is selected in each place, then only readable selections are copied.
  await select('const s = document.querySelector("#host").shadowRoot.querySelector("#shadowed"); s.focus(); s.setSelectionRange(0, 6)');
  assert.equal(await runtime.surfaceClipboard(), 'shadow');
  await select('const t = document.querySelector("#frame").contentDocument.querySelector("#inner"); t.focus(); t.setSelectionRange(0, 5)');
  assert.equal(await runtime.surfaceClipboard(), 'frame');
  await select('const p = document.querySelector("#secret"); p.focus(); p.select()');
  assert.equal(await runtime.surfaceClipboard(), '');
});

test('replaces a scope whose Chrome stopped with a fresh browser on the next action', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a chat whose scope runs a real Chrome.
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtimes = [];
  const manager = createBrowserManager({
    createRuntime: () => {
      const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
      runtimes.push(runtime);
      return runtime;
    },
  });
  context.after(() => manager.close());
  const chat = { directory: '/repo', sessionId: 'ses_crash' };
  await manager.perform('browser.open', { url: `${web.origin}/` }, undefined, chat);
  const page = await runtimes[0].ensurePage();

  // When that Chrome exits.
  await page.cdp.send('Browser.close').catch(() => {});
  await waitFor(() => manager.state().notice !== null);

  // Then the old runtime refuses work, and the chat's next action starts a new browser.
  assert.deepEqual(manager.state().scopes, []);
  await assert.rejects(runtimes[0].perform('browser.snapshot', {}), /stopped unexpectedly|closed/);
  const reopened = await manager.perform('browser.open', { url: `${web.origin}/next` }, undefined, chat);
  assert.equal(reopened.title, 'Next');
  assert.equal(runtimes.length, 2);
});

test('tracks title, loading, and history for the dock, and stops a slow load', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a page whose title changes when the user clicks it.
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: `${web.origin}/title` });

  // When the user clicks it, then the title follows the page rather than the last agent action.
  await runtime.surfaceInput([
    { type: 'pointer', action: 'down', x: 30, y: 30, button: 0, buttons: 1, modifiers },
    { type: 'pointer', action: 'up', x: 30, y: 30, button: 0, buttons: 0, modifiers },
  ]);
  await waitFor(() => runtime.title === 'Renamed by the page');

  // When the dock navigates and goes back, then history availability follows.
  await runtime.command('navigate', { url: `${web.origin}/next` });
  await waitFor(() => runtime.title === 'Next' && runtime.canGoBack && !runtime.isLoading);
  assert.equal(runtime.canGoForward, false);
  await runtime.command('back');
  await waitFor(() => runtime.url === `${web.origin}/title` && runtime.canGoForward);

  // When a slow page is stopped, then loading ends without waiting for the server.
  await runtime.command('navigate', { url: `${web.origin}/slow` });
  await waitFor(() => runtime.isLoading);
  await runtime.command('stop');
  await waitFor(() => !runtime.isLoading, 2_000);

  // Then the dock still refuses anything but http(s).
  await assert.rejects(runtime.command('navigate', { url: 'file:///etc/passwd' }), /http\(s\)/);
});

test('follows pages the site opens as tabs and returns to the opener when they close', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a page with a target=_blank link and a window.open button.
  const web = await startWebFixture();
  context.after(() => close(web.server));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: [web.origin] });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: `${web.origin}/tabs` });
  const opener = runtime.tabs[0].id;
  const click = (x, y) => runtime.surfaceInput([
    { type: 'pointer', action: 'down', x, y, button: 0, buttons: 1, modifiers },
    { type: 'pointer', action: 'up', x, y, button: 0, buttons: 0, modifiers },
  ]);

  // When the user follows the link, then the new page becomes the active tab and the agent works there.
  await click(30, 30);
  await waitFor(() => runtime.tabs.length === 2 && runtime.url === `${web.origin}/next`);
  assert.equal((await runtime.perform('browser.snapshot', {})).title, 'Next');

  // When that tab closes, then its opener comes back.
  await runtime.command('tab-close', { tabId: runtime.tabs.find((tab) => tab.active).id });
  assert.deepEqual(runtime.tabs.map((tab) => [tab.id, tab.active]), [[opener, true]]);

  // When the page opens a window from script, then it is tracked and brought forward too.
  await click(30, 128);
  await waitFor(() => runtime.tabs.length === 2 && runtime.url === `${web.origin}/next`);

  // When the dock opens a blank tab and then selects the opener, then the agent follows the selection.
  await runtime.command('tab-new');
  assert.equal(runtime.tabs.length, 3);
  assert.equal(runtime.url, 'about:blank');
  await runtime.command('tab-select', { tabId: opener });
  assert.equal((await runtime.perform('browser.snapshot', {})).title, 'Tabs');
});