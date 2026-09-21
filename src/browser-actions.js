import { buildClickScript, buildSnapshotScript, buildTypeScript } from './page-scripts.js';
import { buildInspectScript, buildScrollScript } from './page-scripts-more.js';
import { viewportForMode, viewportSummary } from './viewports.js';

const OPEN_SETTLE_MS = 30_000;

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
    const page = await runtime.ensurePage();
    const requestedViewport = parameters.viewport ? viewportForMode(parameters.viewport) : runtime.viewport;
    await runtime.setViewport(requestedViewport);
    runtime.clearConsoleProblems();
    const load = startLoadWait(page, OPEN_SETTLE_MS, signal);
    let navigation;
    try {
      navigation = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.navigate', { url: url.href }));
      if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    } catch (error) {
      await load.cancel();
      throw error;
    }
    const settled = await load.promise;
    const info = await readPageInfo(page, signal);
    return { ...info, opened: true, settled, viewport: viewportSummary(runtime.viewport) };
  }

  const page = await runtime.ensurePage();
  if (action === 'browser.reload') {
    runtime.clearConsoleProblems();
    const load = startLoadWait(page, OPEN_SETTLE_MS, signal);
    try {
      await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.reload'));
    } catch (error) {
      await load.cancel();
      throw error;
    }
    await load.promise;
    return readPageInfo(page, signal);
  }
  if (action === 'browser.snapshot') {
    const data = await runPageScript(page, buildSnapshotScript(parameters), signal);
    const problems = runtime.consoleProblems;
    return {
      ...data,
      viewport: viewportSummary(runtime.viewport),
      ...(problems.length > 0 ? { consoleProblems: problems } : {}),
    };
  }
  if (action === 'browser.click') return runPageScript(page, buildClickScript(parameters), signal);
  if (action === 'browser.type') return runPageScript(page, buildTypeScript(parameters), signal);
  if (action === 'browser.scroll') return runPageScript(page, buildScrollScript(parameters), signal);
  if (action === 'browser.inspect') return runPageScript(page, buildInspectScript(parameters), signal);
  if (action === 'browser.back') return navigateHistory(page, true, signal);
  if (action === 'browser.forward') return navigateHistory(page, false, signal);

  if (action === 'browser.resize') {
    await runtime.setViewport(viewportForMode(parameters.viewport));
    return { viewport: viewportSummary(runtime.viewport) };
  }
  if (action === 'browser.capture') {
    await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.enable'));
    const capture = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.captureScreenshot', { format: 'png' }));
    const metrics = await withAbort(signal, page.cdp.sendSession(page.sessionId, 'Page.getLayoutMetrics'));
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
