import { createBrowserActions } from './browser-actions.js';
import { connectCdp } from './cdp-client.js';
import { createChromeProcess } from './chrome-process.js';
import { networkGrants, originGrants } from './config.js';
import { createNativeSelectCompatibility } from './native-select-compatibility.js';
import { createPolicyProxy } from './policy-proxy.js';
import { createSurface } from './surface.js';
import { applyViewport, viewportForMode } from './viewports.js';

const boundedText = (value, maximum = 1_000) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maximum);

export const createBrowserRuntime = ({ chromePath = null, allowedOrigins = [], allowedNetworks = [], configPath = null } = {}) => {
  const chrome = createChromeProcess({ chromePath });
  const proxy = createPolicyProxy({ grants: [...originGrants(allowedOrigins), ...networkGrants(allowedNetworks)], configPath });
  const shutdownController = new AbortController();
  const problems = [];
  let cdp = null;
  let contextId = null;
  let targetId = null;
  let sessionId = null;
  let mainFrameId = null;
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
    title: '',
    url: 'about:blank',
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

  const observeCdp = () => cdp.onEvent((event) => {
    if (event.sessionId !== sessionId) return;
    if (event.method === 'Page.frameNavigated' && !event.params.frame?.parentId) {
      mainFrameId = event.params.frame.id;
      runtime.url = event.params.frame.url;
    }
    const navigatedFrameId = event.params.frame?.id;
    if (event.method === 'Page.frameNavigated' && navigatedFrameId) {
      nativeSelectCompatibility?.frameNavigated(navigatedFrameId);
    }
    const detachedFrameId = event.params.frameId;
    if (event.method === 'Page.frameDetached' && detachedFrameId) {
      nativeSelectCompatibility?.frameDetached(detachedFrameId);
    }
    if (event.method === 'Page.navigatedWithinDocument' && event.params.frameId === mainFrameId) {
      runtime.url = event.params.url;
    }
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
  });

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
    if (targetId && sessionId) return { cdp, contextId, targetId, sessionId };
    if (closed) throw new Error('Browser runtime is closed');
    const target = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId: contextId });
    if (typeof target.targetId !== 'string') throw new Error('Chrome returned no page target id');
    const nextTargetId = target.targetId;
    const nextSessionId = await cdp.attach(nextTargetId);
    if (closed) throw new Error('Browser runtime is closed');
    targetId = nextTargetId;
    sessionId = nextSessionId;
    eventCleanup = observeCdp();
    await Promise.all([
      cdp.sendSession(sessionId, 'Page.enable'),
      cdp.sendSession(sessionId, 'Runtime.enable'),
      cdp.sendSession(sessionId, 'Log.enable'),
    ]);
    await applyViewport(cdp, sessionId, runtime.viewport);
    return { cdp, contextId, targetId, sessionId };
  };

  runtime.ensurePage = async () => {
    if (dead) throw dead;
    if (targetId && sessionId) return { cdp, contextId, targetId, sessionId };
    if (!pagePromise) pagePromise = createPage().catch((error) => {
      targetId = null;
      sessionId = null;
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
        if (typeof data?.title === 'string') runtime.title = data.title;
        if (typeof data?.url === 'string') runtime.url = data.url;
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
    targetId = null;
    sessionId = null;
    mainFrameId = null;
  };

  return runtime;
};
