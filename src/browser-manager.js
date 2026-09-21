const DEFAULT_MAX_SCOPES = 4;

const scopeId = ({ directory, sessionId }) => JSON.stringify([directory, sessionId]);

const knownScope = (context) => (
  context
  && typeof context.directory === 'string'
  && context.directory.length > 0
  && typeof context.sessionId === 'string'
  && context.sessionId.length > 0
);

export const createBrowserManager = ({ createRuntime, maxScopes = DEFAULT_MAX_SCOPES }) => {
  if (typeof createRuntime !== 'function') throw new Error('createBrowserManager requires a runtime factory');
  if (!Number.isInteger(maxScopes) || maxScopes < 1) throw new Error('maxScopes must be a positive integer');

  const scopes = new Map();
  let selectedScopeId = null;
  let controller = 'none';
  let operationQueue = Promise.resolve();
  let frameState = null;
  let frameSequence = 0;
  let viewGeneration = 0;
  const frameControllers = new Set();
  const selectionWaiters = new Set();
  let surfaceViewport = null;
  let closed = false;

  const enqueue = (operation) => {
    const pending = operationQueue.catch(() => {}).then(operation);
    operationQueue = pending;
    return pending;
  };

  const selected = () => selectedScopeId ? scopes.get(selectedScopeId) ?? null : null;

  const finishSelectionWaiter = (waiter, error = null) => {
    if (!selectionWaiters.delete(waiter)) return;
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    if (error) waiter.reject(error);
    else waiter.resolve(null);
  };

  const select = (entry) => {
    if (selectedScopeId === entry.id) return;
    for (const pending of frameControllers) pending.abort();
    selectedScopeId = entry.id;
    frameState = null;
    viewGeneration += 1;
    for (const waiter of selectionWaiters) finishSelectionWaiter(waiter);
  };

  const ensureScope = async (context) => {
    if (!knownScope(context)) {
      throw new Error('Browser actions require both project and chat context; this host did not provide them');
    }
    const id = scopeId(context);
    const existing = scopes.get(id);
    if (existing) {
      return existing;
    }
    if (scopes.size >= maxScopes) {
      throw new Error(`The browser scope limit (${maxScopes}) is already in use; restart the service to clear inactive scopes`);
    }
    const entry = {
      id,
      directory: context.directory,
      sessionId: context.sessionId,
      runtime: createRuntime(context),
    };
    scopes.set(id, entry);
    if (!selectedScopeId) select(entry);
    return entry;
  };

  const requireSelected = () => {
    const entry = selected();
    if (!entry) throw new Error('No browser scope is available yet');
    return entry;
  };

  const requireIdleSurface = () => {
    if (controller !== 'none') {
      throw new Error('Dock controls are available only while the shared surface is idle');
    }
  };

  const requireGeneration = (expectedGeneration) => {
    if (expectedGeneration !== viewGeneration) {
      throw new Error('The browser view changed before the dock command ran');
    }
  };

  const dockAction = (action, parameters, expectedGeneration) => enqueue(async () => {
    requireIdleSurface();
    requireGeneration(expectedGeneration);
    const entry = requireSelected();
    const result = await entry.runtime.perform(action, parameters);
    return result;
  });

  return {
    get agentActive() {
      return selected()?.runtime.agentActive === true;
    },
    perform(action, parameters, signal, context) {
      return enqueue(async () => {
        if (closed) throw new Error('Browser manager is closed');
        if (controller === 'user') {
          throw new Error('The user controls the browser. Wait for them to hand control back.');
        }
        const entry = await ensureScope(context);
        return entry.runtime.perform(action, parameters, signal);
      });
    },
    state() {
      return {
        controller,
        selectedScopeId,
        generation: viewGeneration,
        scopes: Array.from(scopes.values(), (entry) => ({
          id: entry.id,
          directory: entry.directory,
          sessionId: entry.sessionId,
          selected: entry.id === selectedScopeId,
          url: entry.runtime.url ?? 'about:blank',
          title: entry.runtime.title ?? '',
        })),
      };
    },
    selectScope(id, expectedGeneration) {
      return enqueue(async () => {
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        const entry = scopes.get(id);
        if (!entry) throw new Error('The selected browser scope no longer exists');
        if (surfaceViewport) await entry.runtime.surfaceResize(surfaceViewport);
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        select(entry);
      });
    },
    navigate(url, expectedGeneration) {
      return dockAction('browser.open', { url }, expectedGeneration);
    },
    reload(expectedGeneration) {
      return dockAction('browser.reload', {}, expectedGeneration);
    },
    back(expectedGeneration) {
      return dockAction('browser.back', {}, expectedGeneration);
    },
    forward(expectedGeneration) {
      return dockAction('browser.forward', {}, expectedGeneration);
    },
    async surfaceFrame({ after, wait, signal }) {
      const entry = selected();
      if (closed) return null;
      signal?.throwIfAborted();
      if (!entry) {
        if (wait === 0) return null;
        return new Promise((resolve, reject) => {
          const waiter = { signal, resolve, reject, timer: null, onAbort: null };
          waiter.onAbort = () => finishSelectionWaiter(
            waiter,
            signal.reason ?? new DOMException('Frame request cancelled', 'AbortError'),
          );
          waiter.timer = setTimeout(() => finishSelectionWaiter(waiter), wait);
          waiter.timer.unref?.();
          signal?.addEventListener('abort', waiter.onAbort, { once: true });
          selectionWaiters.add(waiter);
          if (signal?.aborted) waiter.onAbort();
        });
      }
      const generation = viewGeneration;
      const current = frameState?.scopeId === entry.id ? frameState : null;
      if (current?.frame && current.sequence > after) return current.frame;
      const switchController = new AbortController();
      frameControllers.add(switchController);
      const combinedSignal = signal
        ? AbortSignal.any([signal, switchController.signal])
        : switchController.signal;
      let frame;
      try {
        frame = await entry.runtime.surfaceFrame({
          after: current?.sourceSequence ?? 0,
          wait,
          signal: combinedSignal,
        });
      } catch (error) {
        if (switchController.signal.aborted) return null;
        throw error;
      } finally {
        frameControllers.delete(switchController);
      }
      if (!frame || selectedScopeId !== entry.id || viewGeneration !== generation) return null;
      const published = frameState?.scopeId === entry.id ? frameState : null;
      if (published && frame.sequence <= published.sourceSequence) return null;
      frameSequence = Math.max(frameSequence + 1, after + 1);
      const wrapped = { ...frame, sequence: frameSequence };
      frameState = {
        scopeId: entry.id,
        sourceSequence: frame.sequence,
        sequence: frameSequence,
        frame: wrapped,
      };
      return wrapped;
    },
    surfaceInput(events) {
      controller = 'user';
      return enqueue(async () => {
        const runtime = requireSelected().runtime;
        await runtime.surfaceControl('user');
        return runtime.surfaceInput(events);
      });
    },
    surfaceControl(nextController) {
      return enqueue(() => {
        controller = nextController;
        return selected()?.runtime.surfaceControl(nextController);
      });
    },
    surfaceResize(size) {
      return enqueue(async () => {
        const result = await requireSelected().runtime.surfaceResize(size);
        surfaceViewport = size;
        return result;
      });
    },
    surfaceClipboard() {
      return enqueue(() => requireSelected().runtime.surfaceClipboard());
    },
    close() {
      if (closed) return operationQueue;
      closed = true;
      for (const pending of frameControllers) pending.abort();
      for (const waiter of selectionWaiters) finishSelectionWaiter(waiter);
      return enqueue(async () => {
        await Promise.all(Array.from(scopes.values(), (entry) => entry.runtime.close()));
        scopes.clear();
        selectedScopeId = null;
        frameState = null;
      });
    },
  };
};
