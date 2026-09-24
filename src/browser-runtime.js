import crypto from 'node:crypto';
import { GUEST_CLIPBOARD_TEXT_MAX } from '@openchamber/sdk';
import { createBrowserActions } from './browser-actions.js';
import { connectCdp } from './cdp-client.js';
import { createChromeProcess } from './chrome-process.js';
import { MENU_BINDING, MENU_WORLD, createContextMenu } from './context-menu.js';
import { createInspector } from './inspector.js';
import { networkGrants, originGrants } from './config.js';
import { createNativeSelectCompatibility } from './native-select-compatibility.js';
import { createPolicyProxy } from './policy-proxy.js';
import { createSurface } from './surface.js';
import { applyViewport, presetViewport } from './viewports.js';

const boundedText = (value, maximum = 1_000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);

const createTab = (targetId, sessionId, openerId) => ({
  targetId,
  sessionId,
  openerId,
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
  problems: [],
  compatibility: null,
  lastActive: 0,
});

const isScopePage = (info, contextId) => info?.type === 'page'
  && info.browserContextId === contextId
  && info.subtype !== 'prerender';

export const createBrowserRuntime = ({
  chromePath = null,
  allowedOrigins = [],
  allowedNetworks = [],
  configPath = null,
  devServers = null,
} = {}) => {
  const chrome = createChromeProcess({ chromePath });
  const proxy = createPolicyProxy({
    grants: [...originGrants(allowedOrigins), ...networkGrants(allowedNetworks)],
    configPath,
    devServerGrants: devServers ? () => devServers.grants() : null,
  });
  const shutdownController = new AbortController();
  const tabs = new Map();
  const sessions = new Map();
  const attaching = new Map();
  const tabListeners = new Set();
  let activeTargetId = null;
  let activations = 0;
  let nativeSelectEnabled = false;
  let cdp = null;
  let contextId = null;
  let eventCleanup = null;
  let startupPromise = null;
  let pagePromise = null;
  let actionQueue = Promise.resolve();
  let closed = false;
  let dead = null;
  const deathListeners = new Set();
  // 'auto' follows the viewer's panel; 'fixed' keeps a chosen size. The source
  // says who chose it, so an agent's size is not replaced by a panel resize.
  let viewportConfig = { mode: 'auto', source: 'viewer', mobile: false, fixed: null, panel: null };

  const effectiveViewport = () => {
    const size = viewportConfig.mode === 'fixed' ? viewportConfig.fixed : viewportConfig.panel ?? presetViewport('desktop');
    return { width: size.width, height: size.height, mobile: viewportConfig.mobile };
  };

  const markDead = () => {
    if (closed || dead) return;
    dead = new Error('Chrome for this chat stopped unexpectedly; retry the action to start a new browser');
    shutdownController.abort(dead);
    for (const listener of deathListeners) listener(dead);
  };
  chrome.onExit(markDead);

  const activeTab = () => tabs.get(activeTargetId) ?? null;

  const runtime = {
    get viewport() {
      return effectiveViewport();
    },
    get viewportState() {
      const { width, height, mobile } = effectiveViewport();
      return { mode: viewportConfig.mode, source: viewportConfig.source, width, height, mobile };
    },
    controller: 'none',
    agentActive: false,
    get url() {
      return activeTab()?.url ?? 'about:blank';
    },
    get title() {
      return activeTab()?.title ?? '';
    },
    get isLoading() {
      return activeTab()?.isLoading === true;
    },
    get canGoBack() {
      return activeTab()?.canGoBack === true;
    },
    get canGoForward() {
      return activeTab()?.canGoForward === true;
    },
    get tabs() {
      return Array.from(tabs.values(), (current) => ({
        id: current.targetId,
        url: current.url,
        title: current.title,
        isLoading: current.isLoading,
        active: current.targetId === activeTargetId,
      }));
    },
    get nativeSelectCompatibility() {
      return activeTab()?.compatibility.enabled ?? nativeSelectEnabled;
    },
    get nativeSelectCompatibilityError() {
      return activeTab()?.compatibility.error ?? '';
    },
    // Text the viewer asked to copy from the page menu; the dock offers it through a host toast.
    get copyRequest() {
      if (!copyRequest || Date.now() - copyRequest.at > 10_000) return null;
      return { id: copyRequest.id, text: copyRequest.text };
    },
    get problemCounts() {
      const problems = activeTab()?.problems ?? [];
      return {
        errors: problems.filter((problem) => problem.level === 'error').length,
        warnings: problems.filter((problem) => problem.level === 'warning').length,
      };
    },
    get consoleProblems() {
      return (activeTab()?.problems ?? []).map((problem) => ({ ...problem }));
    },
    clearConsoleProblems() {
      const current = activeTab();
      if (current) current.problems.length = 0;
    },
  };

  const addProblem = (current, problem) => {
    if (!problem.message) return;
    current.problems.push(problem);
    if (current.problems.length > 50) current.problems.shift();
  };

  const pageOf = (current) => ({ cdp, contextId, targetId: current.targetId, sessionId: current.sessionId });

  const notifyTabs = () => {
    for (const listener of tabListeners) listener();
  };

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
          if (typeof entries[index]?.url === 'string' && entries[index].url) current.url = entries[index].url;
        } catch {}
      } while (current.navigationStale && !closed && tabs.get(current.targetId) === current);
    })().finally(() => { current.navigationRefresh = null; });
    return current.navigationRefresh;
  };

  // Chrome delays title notifications, so a painting page rereads its
  // navigation state at most twice a second.
  const scheduleNavigationRefresh = (current) => {
    if (current.navigationTimer) return;
    current.navigationTimer = setTimeout(() => {
      current.navigationTimer = null;
      if (tabs.get(current.targetId) === current) void refreshNavigation(current);
    }, 500);
    current.navigationTimer.unref?.();
  };

  const activate = async (current) => {
    if (activeTargetId === current.targetId || tabs.get(current.targetId) !== current) return;
    const previous = activeTab();
    if (previous) inspector.endTab(previous.sessionId);
    activeTargetId = current.targetId;
    activations += 1;
    current.lastActive = activations;
    void contextMenu.close();
    surface.retarget();
    notifyTabs();
    // Chrome can defer input and frames for a page that is not in front.
    await cdp.sendSession(current.sessionId, 'Page.bringToFront').catch(() => {});
  };

  const removeTab = (targetId) => {
    const current = tabs.get(targetId);
    if (!current) return;
    tabs.delete(targetId);
    sessions.delete(current.sessionId);
    clearTimeout(current.navigationTimer);
    contextMenu.forget(current.sessionId);
    inspector.endTab(current.sessionId);
    if (activeTargetId !== targetId) {
      notifyTabs();
      return;
    }
    activeTargetId = null;
    surface.retarget();
    const fallback = tabs.get(current.openerId)
      ?? [...tabs.values()].reduce((best, candidate) => (!best || candidate.lastActive > best.lastActive ? candidate : best), null);
    if (fallback) void activate(fallback);
    else notifyTabs();
  };

  const attachTab = (targetId, openerId = null) => {
    const known = tabs.get(targetId);
    if (known) return Promise.resolve(known);
    const pending = attaching.get(targetId);
    if (pending) return pending;
    const attached = (async () => {
      const sessionId = await cdp.attach(targetId);
      if (closed) throw new Error('Browser runtime is closed');
      const current = createTab(targetId, sessionId, openerId);
      current.compatibility = createNativeSelectCompatibility({
        ensurePage: async () => pageOf(current),
        reportError: (message) => addProblem(current, { level: 'error', message, source: 'browser' }),
      });
      tabs.set(targetId, current);
      sessions.set(sessionId, current);
      await Promise.all([
        cdp.sendSession(sessionId, 'Page.enable'),
        cdp.sendSession(sessionId, 'Runtime.enable'),
        cdp.sendSession(sessionId, 'Log.enable'),
        cdp.sendSession(sessionId, 'Runtime.addBinding', { name: MENU_BINDING, executionContextName: MENU_WORLD }),
      ]);
      await applyViewport(cdp, sessionId, runtime.viewport);
      if (nativeSelectEnabled) await current.compatibility.setEnabled(true).catch(() => {});
      await refreshNavigation(current);
      return current;
    })().finally(() => attaching.delete(targetId));
    attaching.set(targetId, attached);
    return attached;
  };

  const handleTargetEvent = (event) => {
    const info = event.params.targetInfo;
    if (event.method === 'Target.targetCreated' && isScopePage(info, contextId)) {
      // Pages the site opens (popups, target=_blank) come to the front like in a browser.
      void attachTab(info.targetId, info.openerId ?? null).then(activate).catch(() => {});
    } else if (event.method === 'Target.targetInfoChanged' && info) {
      const current = tabs.get(info.targetId);
      if (!current) return;
      if (typeof info.url === 'string') current.url = info.url;
      if (typeof info.title === 'string') current.title = info.title;
    } else if (event.method === 'Target.targetDestroyed') {
      removeTab(event.params.targetId);
    } else if (event.method === 'Target.detachedFromTarget') {
      const current = sessions.get(event.params.sessionId);
      if (current) removeTab(current.targetId);
    }
  };

  const handleEvent = (event) => {
    if (!event.sessionId) {
      handleTargetEvent(event);
      return;
    }
    const current = sessions.get(event.sessionId);
    if (!current) return;
    inspector.event(current.sessionId, event.method, event.params);
    if (event.method === 'Page.frameNavigated' && event.params.frame?.id) {
      if (!event.params.frame.parentId) {
        current.mainFrameId = event.params.frame.id;
        // A new document starts with no problems, like the DevTools console.
        current.problems.length = 0;
        contextMenu.forget(current.sessionId);
        current.url = event.params.frame.url;
        void refreshNavigation(current);
      }
      current.compatibility.frameNavigated(event.params.frame.id);
    }
    if (event.method === 'Page.frameDetached' && event.params.frameId) {
      current.compatibility.frameDetached(event.params.frameId);
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
    if (event.method === 'Runtime.bindingCalled' && event.params.name === MENU_BINDING) {
      contextMenu.handleBinding(current.sessionId, event.params);
    }
    if (event.method === 'Runtime.consoleAPICalled') {
      if (event.params.type !== 'warning' && event.params.type !== 'error') return;
      const message = event.params.args?.map((arg) => arg.value ?? arg.description).filter(Boolean).join(' ');
      addProblem(current, { level: event.params.type, message: boundedText(message), source: 'console' });
    }
    if (event.method === 'Log.entryAdded') {
      const entry = event.params.entry;
      if (entry?.level !== 'warning' && entry?.level !== 'error') return;
      addProblem(current, { level: entry.level, message: boundedText(entry.text), source: boundedText(entry.source || 'log', 120) });
    }
  };

  const start = async () => {
    let nextCdp = null;
    let nextContextId = null;
    try {
      const [proxyAddress, processInfo] = await Promise.all([proxy.listen(), chrome.ensure()]);
      if (closed) throw new Error('Browser runtime is closed');
      nextCdp = await connectCdp(processInfo.endpoint);
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
      await cdp.send('Target.setDiscoverTargets', { discover: true });
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

  const openTab = async () => {
    await ensureStarted();
    const target = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
    if (typeof target.targetId !== 'string') throw new Error('Chrome returned no page target id');
    const current = await attachTab(target.targetId);
    if (closed) throw new Error('Browser runtime is closed');
    await activate(current);
    return current;
  };

  runtime.ensurePage = async () => {
    if (dead) throw dead;
    const current = activeTab();
    if (current) return pageOf(current);
    if (!pagePromise) pagePromise = openTab().finally(() => { pagePromise = null; });
    return pageOf(await pagePromise);
  };

  // The active tab decides; other tabs follow on a best-effort basis.
  runtime.setNativeSelectCompatibility = async (enabled) => {
    await runtime.ensurePage();
    const active = activeTab();
    await active.compatibility.setEnabled(enabled);
    nativeSelectEnabled = enabled;
    await Promise.allSettled([...tabs.values()]
      .filter((current) => current !== active)
      .map((current) => current.compatibility.setEnabled(enabled)));
  };

  const applyViewportToTabs = async () => {
    const viewport = effectiveViewport();
    const page = await runtime.ensurePage();
    await applyViewport(page.cdp, page.sessionId, viewport);
    await Promise.allSettled([...tabs.values()]
      .filter((current) => current.sessionId !== page.sessionId)
      .map((current) => applyViewport(cdp, current.sessionId, viewport)));
  };

  runtime.configureViewport = async ({ mode, source, width, height, mobile }) => {
    viewportConfig = {
      ...viewportConfig,
      mode,
      source,
      fixed: mode === 'fixed' ? { width, height } : viewportConfig.fixed,
      mobile: typeof mobile === 'boolean' ? mobile : viewportConfig.mobile,
    };
    await applyViewportToTabs();
  };

  runtime.applyAgentViewport = (mode) => {
    const preset = presetViewport(mode);
    return preset
      ? runtime.configureViewport({ mode: 'fixed', source: 'agent', ...preset })
      : runtime.configureViewport({ mode: 'auto', source: 'agent', mobile: false });
  };

  // The CSS size the viewer's panel can show. A fixed viewport keeps its own
  // size and the host letterboxes it.
  runtime.setPanelSize = async (size) => {
    viewportConfig = { ...viewportConfig, panel: size };
    if (viewportConfig.mode === 'auto') await applyViewportToTabs();
    const { width, height } = effectiveViewport();
    return { width, height };
  };

  // Dock commands return once Chrome accepts them; loading and history state
  // follow page events, so a slow page can still be stopped.
  runtime.command = async (name, parameters = {}) => {
    if (closed) throw new Error('Browser runtime is closed');
    await contextMenu.close();
    if (name === 'tab-new') {
      await openTab();
      return;
    }
    if (name === 'tab-select' || name === 'tab-close') {
      const selected = tabs.get(parameters.tabId);
      if (!selected) throw new Error('That tab is no longer open');
      if (name === 'tab-select') {
        await activate(selected);
        return;
      }
      await cdp.send('Target.closeTarget', { targetId: selected.targetId });
      removeTab(selected.targetId);
      return;
    }
    const page = await runtime.ensurePage();
    const current = activeTab();
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
    await refreshNavigation(current);
  };

  const execute = createBrowserActions(runtime);
  const surface = createSurface(runtime);

  let copyRequest = null;
  const contextMenu = createContextMenu({
    navigationState: () => ({ canGoBack: runtime.canGoBack, canGoForward: runtime.canGoForward }),
    readSelection: () => surface.clipboard(),
    onAction: (action, selection) => {
      if (action === 'back' || action === 'forward' || action === 'reload') {
        void runtime.command(action).catch(() => {});
      } else if (action === 'copy') {
        copyRequest = { id: crypto.randomUUID(), text: selection.length > GUEST_CLIPBOARD_TEXT_MAX ? null : selection, at: Date.now() };
      }
    },
  });
  runtime.contextMenu = contextMenu;

  const inspector = createInspector({ send: (sessionId, method, params) => cdp.sendSession(sessionId, method, params) });
  runtime.inspector = inspector;
  runtime.inspectorStart = async () => {
    await runtime.ensurePage();
    return inspector.start(activeTab());
  };

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
      await contextMenu.close();
      runtime.agentActive = true;
      try {
        const data = await execute(action, parameters, signal);
        await activeTab()?.compatibility.whenIdle();
        return data;
      } finally {
        runtime.agentActive = false;
      }
    });
    actionQueue = operation;
    return operation;
  };

  runtime.surfaceFrame = (request) => surface.frame(request);
  runtime.surfaceInput = (events, theme) => surface.input(events, theme);
  runtime.surfaceControl = (controller) => surface.control(controller);
  runtime.surfaceResize = (size) => surface.resize(size);
  runtime.surfaceClipboard = () => surface.clipboard();
  runtime.onDead = (listener) => {
    deathListeners.add(listener);
    return () => deathListeners.delete(listener);
  };
  runtime.onTabsChanged = (listener) => {
    tabListeners.add(listener);
    return () => tabListeners.delete(listener);
  };
  runtime.close = async () => {
    if (closed) return;
    closed = true;
    shutdownController.abort(new DOMException('Browser runtime stopped', 'AbortError'));
    await surface.close();
    inspector.close();
    await Promise.allSettled([...tabs.values()].map((current) => current.compatibility.close()));
    await pagePromise?.catch(() => {});
    await actionQueue.catch(() => {});
    eventCleanup?.();
    for (const current of tabs.values()) clearTimeout(current.navigationTimer);
    if (contextId && cdp?.isOpen) {
      await cdp.send('Target.disposeBrowserContext', { browserContextId: contextId }).catch(() => {});
    }
    cdp?.close();
    await proxy.close();
    await chrome.close();
    contextId = null;
    tabs.clear();
    sessions.clear();
    activeTargetId = null;
  };

  return runtime;
};
