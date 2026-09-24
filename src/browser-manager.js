import { cssSize } from './viewports.js';

const DEFAULT_MAX_SCOPES = 4;
const DEFAULT_IDLE_MS = 5 * 60_000;
const IDLE_SWEEP_INTERVAL_MS = 60_000;
// A scope can make room for a new one after this long without activity.
const EVICTABLE_AFTER_MS = 60_000;

const scopeId = ({ directory, sessionId }) => JSON.stringify([directory, sessionId]);

const knownScope = (context) => (
  context
  && typeof context.directory === 'string'
  && context.directory.length > 0
  && typeof context.sessionId === 'string'
  && context.sessionId.length > 0
);

export const createBrowserManager = ({
  createRuntime,
  maxScopes = DEFAULT_MAX_SCOPES,
  idleMs = DEFAULT_IDLE_MS,
  now = Date.now,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) => {
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
  // The host reports the panel in device pixels; the dock reports its ratio.
  let surfaceViewport = null;
  let devicePixelRatio = 1;
  let viewerTheme = null;
  let closed = false;
  let notice = null;

  const enqueue = (operation) => {
    const pending = operationQueue.catch(() => {}).then(operation);
    operationQueue = pending;
    return pending;
  };

  // Agent actions, dock commands, input, and a viewer's frame requests keep a
  // scope alive; the idle sweep and the scope bound look at this.
  const touch = (entry) => {
    if (entry) entry.lastActivityAt = now();
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

  const removeScope = (entry) => {
    scopes.delete(entry.id);
    if (selectedScopeId === entry.id) {
      for (const pending of frameControllers) pending.abort();
      selectedScopeId = null;
      frameState = null;
      viewGeneration += 1;
    }
    return entry.runtime.close();
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
      const oldest = [...scopes.values()]
        .filter((candidate) => now() - candidate.lastActivityAt >= EVICTABLE_AFTER_MS)
        .reduce((best, candidate) => (!best || candidate.lastActivityAt < best.lastActivityAt ? candidate : best), null);
      if (!oldest) {
        throw new Error(`The browser scope limit (${maxScopes}) is in use by chats active in the last minute; try again shortly`);
      }
      await removeScope(oldest);
    }
    const entry = {
      id,
      directory: context.directory,
      sessionId: context.sessionId,
      runtime: createRuntime(context),
      lastActivityAt: now(),
    };
    scopes.set(id, entry);
    if (notice && scopeId(notice) === id) notice = null;
    entry.runtime.onDead(() => enqueue(async () => {
      if (scopes.get(id) !== entry) return;
      notice = {
        directory: entry.directory,
        sessionId: entry.sessionId,
        message: 'Chrome stopped unexpectedly. The next browser action in this chat starts a new browser.',
      };
      await removeScope(entry);
    }).catch(() => {}));
    // A tab switch changes what the dock commands act on, like a scope switch.
    entry.runtime.onTabsChanged(() => {
      if (selectedScopeId === entry.id) viewGeneration += 1;
    });
    if (!selectedScopeId) {
      select(entry);
      // The viewer's panel may have been measured before this scope existed.
      if (surfaceViewport) await entry.runtime.surfaceResize(cssSize(surfaceViewport, devicePixelRatio));
    }
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

  const dockCommand = (name, parameters, expectedGeneration) => enqueue(async () => {
    requireIdleSurface();
    requireGeneration(expectedGeneration);
    const entry = requireSelected();
    touch(entry);
    await entry.runtime.command(name, parameters);
  });

  let sweepTimer = null;
  const sweepIdleScopes = () => enqueue(async () => {
    const cutoff = now() - idleMs;
    await Promise.all([...scopes.values()].filter((entry) => entry.lastActivityAt <= cutoff).map(removeScope));
  });
  const scheduleSweep = () => {
    if (closed) return;
    sweepTimer = setTimer(() => {
      sweepTimer = null;
      void sweepIdleScopes().catch(() => {}).finally(scheduleSweep);
    }, IDLE_SWEEP_INTERVAL_MS);
    sweepTimer?.unref?.();
  };
  scheduleSweep();

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
        touch(entry);
        try {
          return await entry.runtime.perform(action, parameters, signal);
        } finally {
          touch(entry);
        }
      });
    },
    state() {
      return {
        controller,
        selectedScopeId,
        generation: viewGeneration,
        notice: notice ? { ...notice } : null,
        copy: selected()?.runtime.copyRequest ?? null,
        scopes: Array.from(scopes.values(), (entry) => ({
          id: entry.id,
          directory: entry.directory,
          sessionId: entry.sessionId,
          selected: entry.id === selectedScopeId,
          url: entry.runtime.url ?? 'about:blank',
          title: entry.runtime.title ?? '',
          isLoading: entry.runtime.isLoading === true,
          canGoBack: entry.runtime.canGoBack === true,
          canGoForward: entry.runtime.canGoForward === true,
          nativeSelectCompatibility: entry.runtime.nativeSelectCompatibility === true,
          nativeSelectCompatibilityError: entry.runtime.nativeSelectCompatibilityError ?? '',
          tabs: entry.runtime.tabs ?? [],
          viewport: entry.runtime.viewportState ?? null,
        })),
      };
    },
    // A viewer opens the browser of the chat it is looking at, before any agent
    // action. The dock reports that chat; the host does not attest it per request.
    openScope(context, expectedGeneration) {
      return enqueue(async () => {
        if (closed) throw new Error('Browser manager is closed');
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        const entry = await ensureScope(context);
        touch(entry);
        if (selectedScopeId === entry.id) return;
        if (surfaceViewport) await entry.runtime.surfaceResize(cssSize(surfaceViewport, devicePixelRatio));
        requireIdleSurface();
        select(entry);
        notice = null;
      });
    },
    selectScope(id, expectedGeneration) {
      return enqueue(async () => {
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        const entry = scopes.get(id);
        if (!entry) throw new Error('The selected browser scope no longer exists');
        if (surfaceViewport) await entry.runtime.surfaceResize(cssSize(surfaceViewport, devicePixelRatio));
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        select(entry);
        touch(entry);
        notice = null;
      });
    },
    navigate(url, expectedGeneration) {
      return dockCommand('navigate', { url }, expectedGeneration);
    },
    reload(expectedGeneration) {
      return dockCommand('reload', {}, expectedGeneration);
    },
    back(expectedGeneration) {
      return dockCommand('back', {}, expectedGeneration);
    },
    forward(expectedGeneration) {
      return dockCommand('forward', {}, expectedGeneration);
    },
    stop(expectedGeneration) {
      return dockCommand('stop', {}, expectedGeneration);
    },
    newTab(expectedGeneration) {
      return dockCommand('tab-new', {}, expectedGeneration);
    },
    selectTab(tabId, expectedGeneration) {
      return dockCommand('tab-select', { tabId }, expectedGeneration);
    },
    closeTab(tabId, expectedGeneration) {
      return dockCommand('tab-close', { tabId }, expectedGeneration);
    },
    setViewport({ mode, width, height, mobile }, expectedGeneration) {
      return enqueue(async () => {
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        const entry = requireSelected();
        touch(entry);
        await entry.runtime.configureViewport({ mode, source: 'viewer', width, height, mobile });
      });
    },
    setViewerTheme(theme) {
      viewerTheme = theme;
    },
    setDevicePixelRatio(ratio) {
      return enqueue(async () => {
        if (ratio === devicePixelRatio) return;
        devicePixelRatio = ratio;
        const entry = selected();
        if (surfaceViewport && entry) await entry.runtime.surfaceResize(cssSize(surfaceViewport, devicePixelRatio));
      });
    },
    setNativeSelectCompatibility(enabled, expectedGeneration) {
      return enqueue(async () => {
        requireIdleSurface();
        requireGeneration(expectedGeneration);
        const entry = requireSelected();
        touch(entry);
        const previous = entry.runtime.nativeSelectCompatibility === true;
        await entry.runtime.setNativeSelectCompatibility(enabled);
        try {
          requireIdleSurface();
          requireGeneration(expectedGeneration);
        } catch (error) {
          await entry.runtime.setNativeSelectCompatibility(previous);
          throw error;
        }
      });
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
      touch(entry);
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
        const entry = requireSelected();
        touch(entry);
        const { runtime } = entry;
        await runtime.surfaceControl('user');
        return runtime.surfaceInput(events, viewerTheme);
      });
    },
    surfaceControl(nextController) {
      return enqueue(() => {
        controller = nextController;
        return selected()?.runtime.surfaceControl(nextController);
      });
    },
    surfaceResize(size) {
      return enqueue(() => {
        surfaceViewport = size;
        return requireSelected().runtime.surfaceResize(cssSize(size, devicePixelRatio));
      });
    },
    surfaceClipboard() {
      return enqueue(() => requireSelected().runtime.surfaceClipboard());
    },
    close() {
      if (closed) return operationQueue;
      closed = true;
      if (sweepTimer) clearTimer(sweepTimer);
      sweepTimer = null;
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
