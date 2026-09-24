import assert from 'node:assert/strict';
import test from 'node:test';
import { createBrowserManager } from '../src/browser-manager.js';

const context = (directory, sessionId) => ({ directory, sessionId });

const createRuntimeFactory = () => {
  const runtimes = new Map();
  const factory = (scope) => {
    const calls = [];
    const runtime = {
      calls,
      controller: 'none',
      agentActive: false,
      title: '',
      url: 'about:blank',
      nativeSelectCompatibility: false,
      nativeSelectCompatibilityError: '',
      async perform(action, parameters) {
        calls.push(['perform', action, parameters]);
        if (action === 'browser.open') runtime.url = parameters.url;
        return { action, url: runtime.url };
      },
      async command(name, parameters) {
        calls.push(['command', name, parameters]);
        if (name === 'navigate') runtime.url = parameters.url;
      },
      async configureViewport(request) { calls.push(['viewport', request]); },
      async surfaceFrame({ after }) {
        calls.push(['frame', after]);
        return { sequence: 1, bytes: Buffer.from(scope.sessionId), mime: 'image/jpeg', width: 800, height: 600, title: runtime.title };
      },
      async surfaceInput(events) { calls.push(['input', events]); },
      surfaceControl(controller) { runtime.controller = controller; calls.push(['control', controller]); },
      async surfaceResize(size) { calls.push(['resize', size]); return size; },
      async surfaceClipboard() { return scope.sessionId; },
      async setNativeSelectCompatibility(enabled) {
        calls.push(['select-compatibility', enabled]);
        runtime.nativeSelectCompatibility = enabled;
        runtime.nativeSelectCompatibilityError = '';
      },
      async close() { calls.push(['close']); },
      deathListeners: new Set(),
      onDead(listener) {
        runtime.deathListeners.add(listener);
        return () => runtime.deathListeners.delete(listener);
      },
      die() {
        for (const listener of runtime.deathListeners) listener(new Error('Chrome exited'));
      },
      tabs: [],
      tabListeners: new Set(),
      onTabsChanged(listener) {
        runtime.tabListeners.add(listener);
        return () => runtime.tabListeners.delete(listener);
      },
      changeTabs() {
        for (const listener of runtime.tabListeners) listener();
      },
    };
    runtimes.set(scope.sessionId, runtime);
    return runtime;
  };
  return { factory, runtimes };
};

test('isolates actions by authoritative project and session context', async () => {
  // Given two different chat scopes.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });

  // When each chat opens a different URL.
  await manager.perform('browser.open', { url: 'https://one.test' }, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.open', { url: 'https://two.test' }, undefined, context('/repo', 'ses_two'));

  // Then each action reached a different runtime and the first scope stayed visible.
  assert.equal(runtimes.get('ses_one').url, 'https://one.test');
  assert.equal(runtimes.get('ses_two').url, 'https://two.test');
  assert.equal(manager.state().selectedScopeId, manager.state().scopes[0].id);
});

test('refuses an action when either authoritative context field is unknown', async () => {
  // Given a manager with an existing selected private scope.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.open', { url: 'https://private.test' }, undefined, context('/repo', 'ses_private'));

  // When calls omit one or both context fields, then none reuse the private scope.
  await assert.rejects(manager.perform('browser.snapshot', {}, undefined, context('/repo', null)), /project and chat context/i);
  await assert.rejects(manager.perform('browser.snapshot', {}, undefined, context(null, 'ses_private')), /project and chat context/i);
  await assert.rejects(manager.perform('browser.snapshot', {}, undefined, context(null, null)), /project and chat context/i);
  assert.equal(runtimes.get('ses_private').calls.filter(([kind]) => kind === 'perform').length, 1);
});

test('keeps the selected view pinned when another chat acts', async () => {
  // Given one visible scope and a frame from it.
  const { factory } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.open', { url: 'https://one.test' }, undefined, context('/repo', 'ses_one'));
  const first = await manager.surfaceFrame({ after: 0, wait: 0 });

  // When another chat acts, then the visible frame remains from the first scope.
  await manager.perform('browser.open', { url: 'https://two.test' }, undefined, context('/repo', 'ses_two'));
  const next = await manager.surfaceFrame({ after: first.sequence, wait: 0 });
  assert.equal(next, null);
  assert.equal(first.bytes.toString(), 'ses_one');
});

test('rebases frame sequences when the user selects another scope', async () => {
  // Given two runtimes whose source frames both start at sequence one.
  const { factory } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.open', { url: 'https://one.test' }, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.open', { url: 'https://two.test' }, undefined, context('/repo', 'ses_two'));
  const first = await manager.surfaceFrame({ after: 0, wait: 0 });
  const secondScope = manager.state().scopes.find((scope) => scope.sessionId === 'ses_two');

  // When the idle surface is switched, then the new frame is newer to the host.
  await manager.selectScope(secondScope.id, manager.state().generation);
  const second = await manager.surfaceFrame({ after: first.sequence, wait: 0 });
  assert.equal(second.bytes.toString(), 'ses_two');
  assert.ok(second.sequence > first.sequence);
});

test('serializes dock navigation and rejects it while any viewer owns control', async () => {
  // Given a selected scope and user control held through the host surface lease.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.open', { url: 'https://one.test' }, undefined, context('/repo', 'ses_one'));
  manager.surfaceControl('user');

  // When the dock tries to navigate, then it cannot bypass that lease.
  await assert.rejects(manager.navigate('https://blocked.test'), /surface is idle/i);
  assert.equal(runtimes.get('ses_one').url, 'https://one.test');

  // When control is released, then the same dock action succeeds.
  manager.surfaceControl('none');
  await manager.navigate('https://allowed.test', manager.state().generation);
  assert.equal(runtimes.get('ses_one').url, 'https://allowed.test');
});

test('preserves every scope and refuses new work at the configured bound', async () => {
  // Given a manager bounded to two browser runtimes.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory, maxScopes: 2 });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));

  // When a third scope arrives, then it is refused without destroying browser state.
  await assert.rejects(
    manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_three')),
    /scope limit \(2\)/i,
  );
  assert.deepEqual(manager.state().scopes.map((scope) => scope.sessionId), ['ses_one', 'ses_two']);
  assert.equal(runtimes.get('ses_one').calls.some(([kind]) => kind === 'close'), false);
  assert.equal(runtimes.get('ses_two').calls.some(([kind]) => kind === 'close'), false);
});

test('discards a frame that resolves after the selected view changes twice', async () => {
  // Given a pending frame from the first scope and another available scope.
  const pendingFrame = Promise.withResolvers();
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));
  runtimes.get('ses_one').surfaceFrame = () => pendingFrame.promise;
  const waiting = manager.surfaceFrame({ after: 0, wait: 25_000 });
  const scopes = manager.state().scopes;

  // When the view moves away and back before the old frame resolves, then that frame is stale.
  await manager.selectScope(scopes[1].id, manager.state().generation);
  await manager.selectScope(scopes[0].id, manager.state().generation);
  pendingFrame.resolve({ sequence: 1, bytes: Buffer.from('stale'), mime: 'image/jpeg', width: 800, height: 600, title: '' });
  assert.equal(await waiting, null);
});

test('routes queued surface input to the view that remains selected', async () => {
  // Given two scopes while the first remains pinned.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));

  // When surface input arrives after background work, then only the selected scope receives it.
  await manager.surfaceInput([{ type: 'text', text: 'visible' }]);
  assert.equal(runtimes.get('ses_one').calls.some(([kind]) => kind === 'input'), true);
  assert.equal(runtimes.get('ses_two').calls.some(([kind]) => kind === 'input'), false);
});

test('cancels a static old view frame wait when another scope is selected', async () => {
  // Given a frame request waiting on a static selected page.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));
  runtimes.get('ses_one').surfaceFrame = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
  const waiting = manager.surfaceFrame({ after: 0, wait: 25_000 });

  // When the dock selects the second scope, then the old long poll ends immediately.
  await manager.selectScope(manager.state().scopes[1].id, manager.state().generation);
  assert.equal(await waiting, null);
});

test('marks user ownership before queued surface input reaches Chrome', async () => {
  // Given an agent action already running in the selected scope.
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  runtimes.get('ses_one').perform = async () => {
    started.resolve();
    await finish.promise;
    return {};
  };
  const action = manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await started.promise;

  // When trusted surface input arrives first, then dock mutations see user ownership immediately.
  const input = manager.surfaceInput([{ type: 'text', text: 'x' }]);
  assert.equal(manager.state().controller, 'user');
  finish.resolve();
  await action;
  await input;
});

test('rejects a dock command captured for an older selected view', async () => {
  // Given a dock request captured before the user changes the selected scope.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));
  const staleGeneration = manager.state().generation;
  await manager.selectScope(manager.state().scopes[1].id, staleGeneration);

  // When the old request reaches the queue, then it cannot navigate the new view.
  await assert.rejects(manager.navigate('https://stale.test', staleGeneration), /view changed/i);
  assert.equal(runtimes.get('ses_two').url, 'about:blank');
});

test('holds an empty surface request until the first scope exists', async () => {
  // Given a host frame request before any agent has created a browser scope.
  const { factory } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  let settled = false;
  const waiting = manager.surfaceFrame({ after: 0, wait: 25_000 }).finally(() => { settled = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  // When the first scoped action arrives, then the held request wakes for an immediate repoll.
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  assert.equal(await waiting, null);
});

test('applies the current viewer size before publishing a newly selected scope', async () => {
  // Given a resized viewer and a background scope with its own agent viewport.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.surfaceResize({ width: 700, height: 500 });
  await manager.perform('browser.resize', { viewport: 'desktop' }, undefined, context('/repo', 'ses_two'));

  // When the user selects that scope, then the surface viewport is applied before it becomes visible.
  await manager.selectScope(manager.state().scopes[1].id, manager.state().generation);
  const calls = runtimes.get('ses_two').calls;
  assert.deepEqual(calls.at(-1), ['resize', { width: 700, height: 500 }]);
  assert.equal(manager.state().selectedScopeId, manager.state().scopes[1].id);
});

test('keeps the old view when input arrives during scope resize', async () => {
  // Given a scope switch waiting for the target runtime to resize.
  const resizeStarted = Promise.withResolvers();
  const finishResize = Promise.withResolvers();
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.surfaceResize({ width: 700, height: 500 });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));
  runtimes.get('ses_two').surfaceResize = async () => {
    resizeStarted.resolve();
    await finishResize.promise;
  };
  const originalScope = manager.state().selectedScopeId;
  const switching = manager.selectScope(manager.state().scopes[1].id, manager.state().generation);
  await resizeStarted.promise;

  // When trusted input claims control, then the pending switch aborts and input stays on the old view.
  const input = manager.surfaceInput([{ type: 'text', text: 'old-view' }]);
  finishResize.resolve();
  await assert.rejects(switching, /surface is idle/i);
  await input;
  assert.equal(manager.state().selectedScopeId, originalScope);
  assert.equal(runtimes.get('ses_one').calls.some(([kind]) => kind === 'input'), true);
  assert.equal(runtimes.get('ses_two').calls.some(([kind]) => kind === 'input'), false);
});


test('reload and stop preserve the selected scope and enforce idle and generation guards', async () => {
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.open', { url: 'https://one.test' }, undefined, context('/repo', 'ses_one'));
  const before = manager.state();
  await manager.reload(before.generation);
  await manager.stop(before.generation);
  assert.equal(manager.state().selectedScopeId, before.selectedScopeId);
  assert.deepEqual(runtimes.get('ses_one').calls.slice(-2), [['command', 'reload', {}], ['command', 'stop', {}]]);
  await assert.rejects(manager.reload(before.generation + 1), /view changed/);
  await manager.surfaceControl('user');
  await assert.rejects(manager.stop(before.generation), /idle/);
  assert.equal(runtimes.get('ses_one').calls.filter((call) => call[0] === 'command').length, 2);
  await manager.close();
});

test('keeps native select compatibility scoped and applies dock mutation guards', async () => {
  // Given two independent browser scopes with the first selected.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));
  const generation = manager.state().generation;

  // When compatibility is enabled from the dock, then only the selected scope changes.
  await manager.setNativeSelectCompatibility(true, generation);
  assert.equal(manager.state().scopes[0].nativeSelectCompatibility, true);
  assert.equal(manager.state().scopes[1].nativeSelectCompatibility, false);
  assert.deepEqual(runtimes.get('ses_one').calls.at(-1), ['select-compatibility', true]);

  // Then stale or leased dock commands cannot mutate either scope.
  await assert.rejects(manager.setNativeSelectCompatibility(false, generation + 1), /view changed/i);
  await manager.surfaceControl('user');
  await assert.rejects(manager.setNativeSelectCompatibility(false, generation), /surface is idle/i);
  assert.equal(manager.state().scopes[0].nativeSelectCompatibility, true);
});

test('rolls back native select compatibility when surface control changes during the mutation', async () => {
  // Given a compatibility mutation paused after it starts.
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  const runtime = runtimes.get('ses_one');
  const originalSet = runtime.setNativeSelectCompatibility;
  let calls = 0;
  runtime.setNativeSelectCompatibility = async (enabled) => {
    calls += 1;
    if (calls === 1) {
      started.resolve();
      await finish.promise;
    }
    await originalSet(enabled);
  };

  // When user input takes control before the mutation completes.
  const mutation = manager.setNativeSelectCompatibility(true, manager.state().generation);
  await started.promise;
  const input = manager.surfaceInput([{ type: 'text', text: 'control' }]);
  finish.resolve();

  // Then the dock request fails and restores the previous setting before input runs.
  await assert.rejects(mutation, /surface is idle/i);
  await input;
  assert.equal(manager.state().scopes[0].nativeSelectCompatibility, false);
  assert.deepEqual(runtime.calls.filter(([kind]) => kind === 'select-compatibility'), [
    ['select-compatibility', true],
    ['select-compatibility', false],
  ]);
});


test('discards a scope whose Chrome died and starts a fresh one on the next action', async () => {
  // Given a visible scope.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.open', { url: 'https://one.test' }, undefined, context('/repo', 'ses_one'));
  const first = runtimes.get('ses_one');
  const generation = manager.state().generation;

  // When its Chrome dies.
  first.die();
  await manager.surfaceControl('none');

  // Then the scope, its selection, and its runtime are gone, and the dock learns why.
  const afterDeath = manager.state();
  assert.deepEqual(afterDeath.scopes, []);
  assert.equal(afterDeath.selectedScopeId, null);
  assert.ok(afterDeath.generation > generation);
  assert.equal(afterDeath.notice.sessionId, 'ses_one');
  assert.match(afterDeath.notice.message, /stopped unexpectedly/);
  assert.deepEqual(first.calls.at(-1), ['close']);

  // When the same chat acts again, then a fresh runtime serves it and becomes visible.
  await manager.perform('browser.open', { url: 'https://two.test' }, undefined, context('/repo', 'ses_one'));
  const recreated = manager.state();
  assert.notEqual(runtimes.get('ses_one'), first);
  assert.equal(recreated.scopes.length, 1);
  assert.equal(recreated.notice, null);
  assert.equal(recreated.selectedScopeId, recreated.scopes[0].id);
});

test('guards tab commands and treats a tab switch in the visible scope as a view change', async () => {
  // Given two scopes with the first one visible.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_two'));
  const generation = manager.state().generation;

  // When the dock opens, selects, and closes tabs, then each command reaches the visible runtime.
  await manager.newTab(generation);
  await manager.selectTab('tab-2', generation);
  await manager.closeTab('tab-2', generation);
  assert.deepEqual(runtimes.get('ses_one').calls.filter(([kind]) => kind === 'command'), [
    ['command', 'tab-new', {}],
    ['command', 'tab-select', { tabId: 'tab-2' }],
    ['command', 'tab-close', { tabId: 'tab-2' }],
  ]);

  // When a background scope switches tabs, then the visible view is unchanged.
  runtimes.get('ses_two').changeTabs();
  assert.equal(manager.state().generation, generation);

  // When the visible scope switches tabs, then commands captured before it are refused.
  runtimes.get('ses_one').changeTabs();
  await assert.rejects(manager.newTab(generation), /view changed/i);

  // When a viewer holds control, then tab commands wait for the surface to be idle.
  manager.surfaceControl('user');
  await assert.rejects(manager.newTab(manager.state().generation), /idle/i);
});

test('converts the viewer panel with its pixel ratio and sizes a first scope created after it', async () => {
  // Given a panel on a 2x display measured before any scope exists.
  const { factory, runtimes } = createRuntimeFactory();
  const manager = createBrowserManager({ createRuntime: factory });
  await manager.setDevicePixelRatio(2);
  await assert.rejects(manager.surfaceResize({ width: 1400, height: 1000 }), /no browser scope/i);

  // When the first scope appears, then it gets the panel's CSS size.
  await manager.perform('browser.snapshot', {}, undefined, context('/repo', 'ses_one'));
  const runtime = runtimes.get('ses_one');
  assert.deepEqual(runtime.calls.find(([kind]) => kind === 'resize'), ['resize', { width: 700, height: 500 }]);

  // When the ratio changes, then the visible scope is resized from the same panel.
  await manager.setDevicePixelRatio(1);
  assert.deepEqual(runtime.calls.at(-1), ['resize', { width: 1400, height: 1000 }]);

  // When the dock sets a viewport, then it is marked as the viewer's and guarded like other dock mutations.
  await manager.setViewport({ mode: 'fixed', width: 500, height: 400, mobile: false }, manager.state().generation);
  assert.deepEqual(runtime.calls.at(-1), ['viewport', { mode: 'fixed', source: 'viewer', width: 500, height: 400, mobile: false }]);
  await assert.rejects(manager.setViewport({ mode: 'auto', mobile: false }, manager.state().generation + 1), /view changed/i);
});