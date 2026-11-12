import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createBrowserRuntime } from '../src/browser-runtime.js';
import { resolveChromePath } from '../src/chrome-process.js';
import { frameKey, frameSelector, parseFrameSelector } from '../src/frames.js';

let chromePath = null;
try {
  chromePath = resolveChromePath();
} catch {}

const html = (body, title) => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const listen = (handler) => new Promise((resolve) => {
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    handler(request, response);
  });
  server.listen(0, '127.0.0.1', () => resolve(server));
});

const close = (server) => new Promise((resolve) => server.close(() => resolve()));

// A top page on 127.0.0.1 embeds a sign-in form from localhost, a different
// site, which embeds a page back from 127.0.0.1. A same-origin frame and an
// empty hidden frame sit beside it.
const startSites = async () => {
  let top = null;
  const partner = await listen((request, response) => {
    if (request.url === '/login') {
      response.end(html(`
        <h1>Partner sign-in</h1>
        <form id="login" onsubmit="event.preventDefault()">
          <input id="user" name="user" aria-label="User">
          <select id="role" aria-label="Role"><option value="r">Reader</option><option value="w">Writer</option></select>
          <button type="button" id="go" onclick="document.querySelector('#out').textContent = 'Welcome ' + document.querySelector('#user').value + ' as ' + document.querySelector('#role').value">Sign in</button>
        </form>
        <p id="out"></p>
        <iframe src="http://127.0.0.1:${top.address().port}/nested" width="300" height="80"></iframe>
      `, 'Partner'));
      return;
    }
    response.statusCode = 404;
    response.end('');
  });
  top = await listen((request, response) => {
    if (request.url === '/nested') {
      response.end(html('<p>Nested deep</p><button id="deep">Deep button</button>', 'Nested'));
      return;
    }
    response.end(html(`
      <p>Top page</p>
      <iframe id="partner" src="http://localhost:${partner.address().port}/login" width="500" height="320"></iframe>
      <iframe srcdoc="<button id='same'>Same origin</button>" width="200" height="60"></iframe>
      <iframe style="display:none" src="about:blank"></iframe>
    `, 'Top'));
  });
  const ports = [top.address().port, partner.address().port];
  return {
    top,
    partner,
    url: `http://127.0.0.1:${ports[0]}/`,
    partnerOrigin: `http://localhost:${ports[1]}`,
    allowedOrigins: [`http://127.0.0.1:${ports[0]}`, `http://localhost:${ports[0]}`, `http://127.0.0.1:${ports[1]}`, `http://localhost:${ports[1]}`],
  };
};

test('reads frame selectors and leaves plain CSS alone', () => {
  assert.equal(frameKey('ea1356130844af4d9ef2eebb0886ae95'), 'EA135613');
  assert.equal(frameSelector('EA135613', '#user'), 'frame:EA135613 >> #user');
  assert.deepEqual(parseFrameSelector('frame:ea135613 >> form > input[name="user"]'), { key: 'EA135613', selector: 'form > input[name="user"]' });
  assert.equal(parseFrameSelector('#user'), null);
  assert.equal(parseFrameSelector('div >> span'), null);
});

test('reads and works the frames of a page, also a cross-site one in a process of its own', { skip: chromePath ? false : 'Chrome is unavailable' }, async (context) => {
  // Given a page that embeds a sign-in form from another site.
  const sites = await startSites();
  context.after(() => Promise.all([close(sites.top), close(sites.partner)]));
  const runtime = createBrowserRuntime({ chromePath, allowedOrigins: sites.allowedOrigins });
  context.after(() => runtime.close());
  await runtime.perform('browser.open', { url: sites.url });

  // When the agent takes a snapshot, then the top page reads as before, and
  // each frame with content comes with its text and frame-addressed selectors.
  const snapshot = await runtime.perform('browser.snapshot', {});
  assert.match(snapshot.text, /Top page/);
  assert.doesNotMatch(snapshot.text, /Partner sign-in/);
  const partner = snapshot.frames.find((frame) => frame.url.startsWith(sites.partnerOrigin));
  assert.ok(partner, JSON.stringify(snapshot.frames.map((frame) => frame.url)));
  assert.match(partner.text, /Partner sign-in/);
  const user = partner.elements.find((element) => element.selector.endsWith('#user'));
  assert.equal(user.selector, `frame:${partner.frame} >> #user`);
  assert.ok(snapshot.frames.some((frame) => /Same origin/.test(frame.text) || frame.elements.some((element) => element.label === 'Same origin')));
  assert.ok(snapshot.frames.some((frame) => /Nested deep/.test(frame.text)), 'the frame inside the cross-site frame is listed');
  assert.ok(snapshot.frames.every((frame) => frame.text || frame.elements.length > 0), 'empty frames are left out');

  // When it types, selects, and clicks by label inside that frame, then the frame's own script sees it.
  const typed = await runtime.perform('browser.type', { selector: user.selector, value: 'alice' });
  assert.equal(typed.frame, partner.frame);
  assert.equal(typed.selector, `frame:${partner.frame} >> #user`);
  await runtime.perform('browser.select', { selector: `frame:${partner.frame} >> #role`, label: 'Writer' });
  const clicked = await runtime.perform('browser.click', { text: 'Sign in' });
  assert.equal(clicked.frame, partner.frame);
  const scoped = await runtime.perform('browser.snapshot', { selector: `frame:${partner.frame} >> #out` });
  assert.equal(scoped.text, 'Welcome alice as w');
  assert.equal(scoped.frames, undefined);

  // A frame key that is gone, or a selector the frame lacks, fails with a clear message.
  await assert.rejects(runtime.perform('browser.click', { selector: 'frame:00000000 >> #user' }), /No frame 00000000 on this page any more/);
  await assert.rejects(runtime.perform('browser.click', { selector: `frame:${partner.frame} >> #missing` }), /No element matches #missing/);
});
