import { createBrowserActions } from './browser-actions.js';
import { connectCdp } from './cdp-client.js';
import { createChromeProcess } from './chrome-process.js';
import { networkGrants, originGrants } from './config.js';
import { createNativeSelectCompatibility } from './native-select-compatibility.js';
import { createPolicyProxy } from './policy-proxy.js';
import { createSurface } from './surface.js';
import { applyViewport, viewportForMode } from './viewports.js';

const boundedText = (value, maximum = 1_000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);

const createTab = (targetId, sessionId) => ({
  targetId,
  sessionId,
  // A page target's main frame shares the target's id.
  mainFrameId: targetId,
  url: 'about:blank',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  navigationRefresh: null,
  navigationStale: false,
  navigationTimer: null,
});

export const createBrowserRuntime = ({ chromePath = null, allowedOrigins = [], allowedNetworks = [], configPath = null } = {}) => {
  const chrome = createChromeProcess({ chromePath });
  const proxy = createPolicyProxy({ grants: [...originGrants(allowedOrigins), ...networkGrants(allowedNetworks)], configPath });
  const shutdownController = new AbortController();
  const problems = [];
  let cdp = null;
  let contextId = null;
  let tab = null;
  let eventCleanup = null;
  let startupPromise = null;
  let pagePromise = null;
  let actionQueue = Promise.resolve();
  let nativeSelectCompatibility = null;
  let closed = false;
  let dead = null;
  const deathListeners = new Set();

  const markDead = () => {
    if (closed || dead) return;
    dead = new Error('Chrome for this chat stopped unexpectedly; retry the action to start a new browser');
    shutdownController.abort(dead);
    for (const listener of deathListeners) listener(dead);
  };
  chrome.onExit(markDead);

  const runtime = {
    viewport: viewportForMode('desktop'),
    controller: 'none',
    agentActive: false,
    get url() {
      return tab?.url ?? 'about:blank';
    },
    get title() {
      return tab?.title ?? '';
    },
    get isLoading() {
      return tab?.isLoading === true;
    },
    get canGoBack() {
      return tab?.canGoBack === true;
    },
    get canGoForward() {
      return tab?.canGoForward === true;
    },
    get consoleProblems() {
      return problems.map((problem) => ({ ...problem }));
    },
    clearConsoleProblems() {
      problems.length = 0;
    },
  };

  const addProblem = (problem) => {
    if (!problem.message) return;
    problems.push(problem);
    if (problems.length > 50) problems.shift();
  };

  const pageOf = (current) => ({ cdp, contextId, targetId: current.targetId, sessionId: current.sessionId });

  // Coalesced: events during a read schedule one more read. A failed read keeps
  // the last known state. History entries carry the live document title.
  const refreshNavigation = (current) => {
    if (current.navigationRefresh) {
      current.navigationStale = true;
      return current.navigationRefresh;
    }
    current.navigationRefresh = (async () => {
      do {
        current.navigationStale = false;
        try {
          const history = await cdp.sendSession(current.sessionId, 'Page.getNavigationHistory');
          const entries = Array.isArray(history.entries) ? history.entries : [];
          const index = Number.isInteger(history.currentIndex) ? history.currentIndex : -1;
          current.canGoBack = index > 0;
          current.canGoForward = index >= 0 && index < entries.length - 1;
          if (typeof entries[index]?.title === 'string') current.title = entries[index].title;
        } catch {}
      } while (current.navigationStale && !closed);
    })().finally(() => { current.navigationRefresh = null; });
    return current.navigationRefresh;
  };

  // Chrome delays title notifications, so a painting page rereads its
  // navigation state at most twice a second.
  const scheduleNavigationRefresh = (current) => {
    if (current.navigationTimer) return;
    current.navigationTimer = setTimeout(() => {
      current.navigationTimer = null;
      if (tab === current) void refreshNavigation(current);
    }, 500);
    current.navigationTimer.unref?.();
  };

  const handleEvent = (event) => {
    const current = tab;
    if (!current) return;
    if (!event.sessionId) {
      const info = event.params.targetInfo;
      if (event.method === 'Target.targetInfoChanged' && info?.targetId === current.targetId) {
        if (typeof info.url === 'string') current.url = info.url;
        if (typeof info.title === 'string') current.title = info.title;
      }
      return;
    }
    if (event.sessionId !== current.sessionId) return;
    if (event.method === 'Page.frameNavigated' && event.params.frame?.id) {
      if (!event.params.frame.parentId) {
        current.mainFrameId = event.params.frame.id;
        current.url = event.params.frame.url;
        void refreshNavigation(current);
      }
      nativeSelectCompatibility?.frameNavigated(event.params.frame.id);
    }
    if (event.method === 'Page.frameDetached' && event.params.frameId) {
      nativeSelectCompatibility?.frameDetached(event.params.frameId);
    }
    if (event.method === 'Page.navigatedWithinDocument' && event.params.frameId === current.mainFrameId) {
      current.url = event.params.url;
      void refreshNavigation(current);
    }
    if (event.method === 'Page.frameStartedLoading' && event.params.frameId === current.mainFrameId) {
      current.isLoading = true;
    }
    if (event.method === 'Page.frameStoppedLoading' && event.params.frameId === current.mainFrameId) {
      current.isLoading = false;
      void refreshNavigation(current);
    }
    if (event.method === 'Page.screencastFrame') scheduleNavigationRefresh(current);
    if (event.method === 'Runtime.consoleAPICalled') {
      if (event.params.type !== 'warning' && event.params.type !== 'error') return;
      const message = event.params.args?.map((arg) => arg.value ?? arg.description).filter(Boolean).join(' ');
      addProblem({ level: event.params.type, message: boundedText(message), source: 'console' });
    }
    if (event.method === 'Log.entryAdded') {
      const entry = event.params.entry;
      if (entry?.level !== 'warning' && entry?.level !== 'error') return;
      addProblem({ level: entry.level, message: boundedText(entry.text), source: boundedText(entry.source || 'log', 120) });
    }
  };

  const start = async () => {
    let nextCdp = null;
    let nextContextId = null;
    try {
      const [proxyAddress, processInfo] = await Promise.all([proxy.listen(), chrome.ensure()]);
      if (closed) throw new Error('Browser runtime is closed');
      nextCdp = await connectCdp(processInfo.endpoint);
      await nextCdp.send('Target.setDiscoverTargets', { discover: true });
      const context = await nextCdp.send('Target.createBrowserContext', {
        proxyServer: proxyAddress,
        proxyBypassList: '<-loopback>',
      });
      if (typeof context.browserContextId !== 'string') throw new Error('Chrome returned no browser context id');
      nextContextId = context.browserContextId;
      if (closed) throw new Error('Browser runtime is closed');
      cdp = nextCdp;
      contextId = nextContextId;
      cdp.onClose(markDead);
      eventCleanup = cdp.onEvent(handleEvent);
    } catch (error) {
      if (nextContextId && nextCdp?.isOpen) {
        await nextCdp.send('Target.disposeBrowserContext', { browserContextId: nextContextId }).catch(() => {});
      }
      nextCdp?.close();
      throw error;
    }
  };

  const ensureStarted = async () => {
    if (closed) throw new Error('Browser runtime is closed');
    if (dead) throw dead;
    if (cdp?.isOpen && contextId) return;
    if (!startupPromise) startupPromise = start().catch((error) => {
      startupPromise = null;
      throw error;
    });
    await startupPromise;
  };

  const createPage = async () => {
    await ensureStarted();
    if (tab) return pageOf(tab);
    if (closed) throw new Error('Browser runtime is closed');
    const target = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
    if (typeof target.targetId !== 'string') throw new Error('Chrome returned no page target id');
    const nextTargetId = target.targetId;
    const nextSessionId = await cdp.attach(nextTargetId);
    if (closed) throw new Error('Browser runtime is closed');
    tab = createTab(nextTargetId, nextSessionId);
    await Promise.all([
      cdp.sendSession(tab.sessionId, 'Page.enable'),
      cdp.sendSession(tab.sessionId, 'Runtime.enable'),
      cdp.sendSession(tab.sessionId, 'Log.enable'),
    ]);
    await applyViewport(cdp, tab.sessionId, runtime.viewport);
    await refreshNavigation(tab);
    return pageOf(tab);
  };

  runtime.ensurePage = async () => {
    if (dead) throw dead;
    if (tab) return pageOf(tab);
    if (!pagePromise) pagePromise = createPage().catch((error) => {
      tab = null;
      throw error;
    }).finally(() => { pagePromise = null; });
    return pagePromise;
  };

  nativeSelectCompatibility = createNativeSelectCompatibility({
    ensurePage: runtime.ensurePage,
    reportError: (message) => addProblem({ level: 'error', message, source: 'browser' }),
  });
  Object.defineProperties(runtime, {
    nativeSelectCompatibility: { get: () => nativeSelectCompatibility.enabled },
    nativeSelectCompatibilityError: { get: () => nativeSelectCompatibility.error },
  });
  runtime.setNativeSelectCompatibility = (enabled) => nativeSelectCompatibility.setEnabled(enabled);

  runtime.setViewport = async (viewport) => {
    const page = await runtime.ensurePage();
    await applyViewport(page.cdp, page.sessionId, viewport);
    runtime.viewport = viewport;
  };

  // Dock commands return once Chrome accepts them; loading and history state
  // follow page events, so a slow page can still be stopped.
  runtime.command = async (name, parameters = {}) => {
    if (closed) throw new Error('Browser runtime is closed');
    const page = await runtime.ensurePage();
    const current = tab;
    const send = (method, params) => page.cdp.sendSession(page.sessionId, method, params);
    if (name === 'navigate') {
      const url = new URL(parameters.url);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Open an absolute http(s) URL');
      runtime.clearConsoleProblems();
      const result = await send('Page.navigate', { url: url.href });
      if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
    } else if (name === 'back' || name === 'forward') {
      const history = await send('Page.getNavigationHistory');
      const entry = history.entries?.[history.currentIndex + (name === 'back' ? -1 : 1)];
      if (!entry) throw new Error(name === 'back' ? 'There is nothing to go back to' : 'There is nothing to go forward to');
      await send('Page.navigateToHistoryEntry', { entryId: entry.id });
    } else if (name === 'reload') {
      runtime.clearConsoleProblems();
      await send('Page.reload');
    } else if (name === 'stop') {
      // Chrome refuses Page.stopLoading until a cross-document navigation
      // commits. The document's own stop, from a world the page cannot patch,
      // covers that window.
      await send('Page.stopLoading').catch(async () => {
        const world = await send('Page.createIsolatedWorld', { frameId: current.mainFrameId, worldName: 'openchamber-stop' });
        await send('Runtime.evaluate', { contextId: world.executionContextId, expression: 'window.stop()' });
      });
    } else {
      throw new Error(`Unsupported browser command: ${name}`);
    }
    if (current) await refreshNavigation(current);
  };

  const execute = createBrowserActions(runtime);
  const surface = createSurface(runtime);

  runtime.perform = (action, parameters, callerSignal) => {
    if (closed) return Promise.reject(new Error('Browser runtime is closed'));
    if (runtime.controller === 'user') {
      return Promise.reject(new Error('The user controls the browser. Wait for them to hand control back.'));
    }
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, shutdownController.signal])
      : shutdownController.signal;
    const operation = actionQueue.catch(() => {}).then(async () => {
      signal.throwIfAborted();
      if (runtime.controller === 'user') {
        throw new Error('The user controls the browser. Wait for them to hand control back.');
      }
      runtime.agentActive = true;
      try {
        const data = await execute(action, parameters, signal);
        await nativeSelectCompatibility.whenIdle();
        if (tab && typeof data?.title === 'string') tab.title = data.title;
        if (tab && typeof data?.url === 'string' && data.url) tab.url = data.url;
        return data;
      } finally {
        runtime.agentActive = false;
      }
    });
    actionQueue = operation;
    return operation;
  };

  runtime.surfaceFrame = (request) => surface.frame(request);
  runtime.surfaceInput = (events) => surface.input(events);
  runtime.surfaceControl = (controller) => surface.control(controller);
  runtime.surfaceResize = (size) => surface.resize(size);
  runtime.surfaceClipboard = () => surface.clipboard();
  runtime.onDead = (listener) => {
    deathListeners.add(listener);
    return () => deathListeners.delete(listener);
  };
  runtime.close = async () => {
    if (closed) return;
    closed = true;
    shutdownController.abort(new DOMException('Browser runtime stopped', 'AbortError'));
    await surface.close();
    await nativeSelectCompatibility.close();
    await pagePromise?.catch(() => {});
    await actionQueue.catch(() => {});
    eventCleanup?.();
    if (contextId && cdp?.isOpen) {
      await cdp.send('Target.disposeBrowserContext', { browserContextId: contextId }).catch(() => {});
    }
    cdp?.close();
    await proxy.close();
    await chrome.close();
    contextId = null;
    if (tab?.navigationTimer) clearTimeout(tab.navigationTimer);
    tab = null;
  };

  return runtime;
};
