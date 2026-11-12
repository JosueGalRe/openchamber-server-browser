import { buildClickScript, buildSelectScript, buildSnapshotScript, buildTypeScript } from './page-scripts.js';
import { buildInspectScript, buildQuietScript, buildScrollScript } from './page-scripts-more.js';
import { evaluateInFrame, findFrame, frameSelector, listFrames, MAX_FRAMES, parseFrameSelector } from './frames.js';
import { viewportSummary } from './viewports.js';

const OPEN_SETTLE_MS = 30_000;
const QUIET_MS = 500;
const OPEN_QUIET_MAX_MS = 5_000;
const CAPTURE_QUIET_MAX_MS = 3_000;

const withAbort = async (signal, operation) => {
  signal?.throwIfAborted();
  if (!signal) return operation;
  let rejectAbort;
  const aborted = new Promise((resolve, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(signal.reason ?? new DOMException('Action cancelled', 'AbortError'));
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    return await Promise.race([operation, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
};

const evaluate = async (page, expression, signal) => {
  const response = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  }));
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Page script failed');
  }
  return response.result?.value ?? null;
};

const runPageScript = async (page, expression, signal) => {
  const result = await evaluate(page, expression, signal);
  if (!result || typeof result !== 'object') throw new Error('The page returned no result');
  if (result.ok !== true) throw new Error(typeof result.error === 'string' ? result.error : 'Browser action failed');
  const { ok: _ok, ...data } = result;
  return data;
};

const runFrameScript = async (page, frame, expression, signal) => {
  const result = await withAbort(signal, evaluateInFrame(page, frame, expression));
  if (!result || typeof result !== 'object') throw new Error('The frame returned no result');
  if (result.ok !== true) throw new Error(typeof result.error === 'string' ? result.error : 'Browser action failed');
  const { ok: _ok, ...data } = result;
  return data;
};

const FRAME_TEXT_CHARS = 2_000;
const FRAME_ELEMENTS = 40;
// Result fields that name an element by selector, for the frame prefix.
const SELECTOR_FIELDS = ['selector', 'clicked'];

const inFrame = (frame, data) => {
  const result = { ...data, frame: frame.key };
  for (const field of SELECTOR_FIELDS) {
    if (typeof result[field] === 'string') result[field] = frameSelector(frame.key, result[field]);
  }
  if (Array.isArray(result.elements)) {
    result.elements = result.elements.map((element) => ({ ...element, selector: frameSelector(frame.key, element.selector) }));
  }
  return result;
};

// The frames' part of a snapshot: each frame with something to read or use.
const snapshotFrames = async (page, signal) => {
  const frames = await withAbort(signal, listFrames(page));
  const results = [];
  for (const frame of frames.slice(0, MAX_FRAMES)) {
    signal?.throwIfAborted();
    try {
      const data = await runFrameScript(page, frame, buildSnapshotScript({ maxText: FRAME_TEXT_CHARS, maxElements: FRAME_ELEMENTS }), signal);
      if (!data.text && (data.elements?.length ?? 0) === 0) continue;
      const { scope: _scope, scrollY: _scrollY, maxScrollY: _maxScrollY, ...rest } = inFrame(frame, data);
      results.push(rest);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return { frames: results, ...(frames.length > MAX_FRAMES ? { framesTruncated: true, framesOnPage: frames.length } : {}) };
};

// A selector from a frame's part of a snapshot runs in that frame.
const runAddressed = async (page, parameters, build, signal) => {
  const addressed = parseFrameSelector(parameters.selector);
  if (!addressed) return runPageScript(page, build(parameters), signal);
  const frame = await withAbort(signal, findFrame(page, addressed.key));
  return inFrame(frame, await runFrameScript(page, frame, build({ ...parameters, selector: addressed.selector }), signal));
};

// A label the page does not have may be on a button inside a frame.
const clickByText = async (page, parameters, signal) => {
  try {
    return await runPageScript(page, buildClickScript(parameters), signal);
  } catch (error) {
    if (signal?.aborted || !/No clickable element has the label/.test(error.message)) throw error;
    const frames = await withAbort(signal, listFrames(page));
    for (const frame of frames.slice(0, MAX_FRAMES)) {
      try {
        return inFrame(frame, await runFrameScript(page, frame, buildClickScript(parameters), signal));
      } catch (frameError) {
        if (signal?.aborted) throw frameError;
      }
    }
    throw error;
  }
};

const readPageInfo = async (page, signal) => {
  const value = await evaluate(page, '({ url: String(location.href), title: String(document.title || "") })', signal);
  return {
    url: typeof value?.url === 'string' ? value.url : '',
    title: typeof value?.title === 'string' ? value.title : '',
  };
};

const waitForLoad = (page, timeoutMs, signal) => new Promise((resolve, reject) => {
  let unsubscribe = null;
  const cleanup = () => {
    clearTimeout(timer);
    unsubscribe?.();
    signal?.removeEventListener('abort', onAbort);
  };
  const finish = (settled) => {
    cleanup();
    resolve(settled);
  };
  const onAbort = () => {
    cleanup();
    reject(signal.reason ?? new DOMException('Action cancelled', 'AbortError'));
  };
  const timer = setTimeout(() => finish(false), timeoutMs);
  timer.unref?.();
  unsubscribe = page.cdp.onEvent((event) => {
    if (event.sessionId === page.sessionId && event.method === 'Page.loadEventFired') finish(true);
  });
  signal?.addEventListener('abort', onAbort, { once: true });
});

const startLoadWait = (page, timeoutMs, signal) => {
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const promise = waitForLoad(page, timeoutMs, combined);
  return {
    promise,
    async cancel() {
      controller.abort(new DOMException('Navigation cancelled', 'AbortError'));
      await promise.catch(() => {});
    },
  };
};

// A page that navigates again during the wait destroys the script's context;
// that is a page still changing, not a failed action.
const waitForQuiet = async (page, maxMs, signal) => {
  try {
    const result = await evaluate(page, buildQuietScript({ quietMs: QUIET_MS, maxMs }), signal);
    return result?.quiet === true;
  } catch (error) {
    if (signal?.aborted) throw error;
    return false;
  }
};

const navigateHistory = async (page, goingBack, signal) => {
  const history = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.getNavigationHistory'));
  const currentIndex = typeof history.currentIndex === 'number' ? history.currentIndex : -1;
  const nextIndex = goingBack ? currentIndex - 1 : currentIndex + 1;
  const entry = Array.isArray(history.entries) ? history.entries[nextIndex] : null;
  if (!entry) throw new Error(goingBack ? 'There is nothing to go back to' : 'There is nothing to go forward to');
  const load = startLoadWait(page, 8_000, signal);
  try {
    await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.navigateToHistoryEntry', { entryId: entry.id }));
  } catch (error) {
    await load.cancel();
    throw error;
  }
  const state = await evaluate(page, '({ url: String(location.href), complete: document.readyState === "complete" })', signal);
  if (state?.complete === true && state.url === entry.url) await load.cancel();
  else await load.promise;
  return readPageInfo(page, signal);
};

export const createBrowserActions = (runtime) => async (action, parameters, signal) => {
  if (action === 'browser.open') {
    const url = new URL(parameters.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Open an absolute http(s) URL');
    const page = await runtime.agentOpenPage(parameters.tabId);
    if (parameters.viewport) await runtime.applyAgentViewport(parameters.viewport);
    runtime.clearConsoleProblems(page.targetId);
    const load = startLoadWait(page, OPEN_SETTLE_MS, signal);
    let navigation;
    try {
      navigation = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.navigate', { url: url.href }));
      if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    } catch (error) {
      await load.cancel();
      throw error;
    }
    const settled = await load.promise && await waitForQuiet(page, OPEN_QUIET_MAX_MS, signal);
    const info = await readPageInfo(page, signal);
    return { ...info, opened: true, settled, viewport: viewportSummary(runtime.viewport), tabId: page.targetId };
  }
  if (action === 'browser.close') return { closed: true, tabId: await runtime.agentCloseTab(parameters.tabId) };

  const page = await runtime.agentPage(parameters.tabId);
  if (action === 'browser.snapshot') {
    const scoped = Boolean(parameters.selector);
    const data = await runAddressed(page, parameters, buildSnapshotScript, signal);
    const frames = scoped ? {} : await snapshotFrames(page, signal);
    const problems = runtime.consoleProblems(page.targetId);
    return {
      ...data,
      ...(frames.frames?.length > 0 ? frames : {}),
      viewport: viewportSummary(runtime.viewport),
      ...(problems.length > 0 ? { consoleProblems: problems } : {}),
      tabs: runtime.tabs.map(({ id, title, url, active }) => ({ id, title, url, active })),
    };
  }
  if (action === 'browser.click') {
    return parameters.selector ? runAddressed(page, parameters, buildClickScript, signal) : clickByText(page, parameters, signal);
  }
  if (action === 'browser.type') return runAddressed(page, parameters, buildTypeScript, signal);
  if (action === 'browser.select') return runAddressed(page, parameters, buildSelectScript, signal);
  if (action === 'browser.scroll') return runAddressed(page, parameters, buildScrollScript, signal);
  if (action === 'browser.inspect') return runAddressed(page, parameters, buildInspectScript, signal);
  if (action === 'browser.back') return navigateHistory(page, true, signal);
  if (action === 'browser.forward') return navigateHistory(page, false, signal);

  if (action === 'browser.resize') {
    await runtime.applyAgentViewport(parameters.viewport);
    return { viewport: viewportSummary(runtime.viewport) };
  }
  if (action === 'browser.capture') {
    await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.enable'));
    await waitForQuiet(page, CAPTURE_QUIET_MAX_MS, signal);
    const metrics = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.getLayoutMetrics'));
    // Pages render at the viewer's pixel ratio; the agent still gets one pixel
    // per CSS pixel of the viewport, with a zoomed-out mobile page zoomed out.
    const visible = metrics.cssVisualViewport;
    const clip = runtime.scale > 1 && visible
      ? { x: visible.pageX, y: visible.pageY, width: visible.clientWidth, height: visible.clientHeight, scale: (visible.scale ?? 1) / runtime.scale }
      : undefined;
    const capture = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }));
    const info = await readPageInfo(page, signal);
    const viewport = metrics.cssLayoutViewport ?? metrics.layoutViewport;
    return {
      base64: typeof capture.data === 'string' ? capture.data : '',
      mime: 'image/png',
      width: Math.round(viewport?.clientWidth ?? runtime.viewport?.width ?? 0),
      height: Math.round(viewport?.clientHeight ?? runtime.viewport?.height ?? 0),
      ...info,
      viewport: viewportSummary(runtime.viewport),
    };
  }
  throw new Error(`Unsupported browser action: ${action}`);
};
