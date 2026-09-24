import { SURFACE_FRAME_MAX_BYTES, SURFACE_TEXT_MAX } from '@openchamber/sdk';

const BUTTON_NAMES = ['left', 'middle', 'right'];
const KEY_CODES = Object.freeze({
  Backspace: 8, Tab: 9, Enter: 13, Escape: 27, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
});

const modifiersMask = (modifiers) => (
  (modifiers.alt ? 1 : 0)
  | (modifiers.ctrl ? 2 : 0)
  | (modifiers.meta ? 4 : 0)
  | (modifiers.shift ? 8 : 0)
);

const mouseButton = (button) => BUTTON_NAMES[button] ?? 'none';

const baseCharacter = (key, code) => code === `Key${key.toUpperCase()}` || code === `Digit${key}`;

const dispatchInput = async (page, event) => {
  if (event.type === 'text') {
    await page.cdp.sendSession(page.sessionId, 'Input.insertText', { text: event.text });
    return;
  }
  if (event.type === 'pointer') {
    const types = { down: 'mousePressed', up: 'mouseReleased', move: 'mouseMoved' };
    await page.cdp.sendSession(page.sessionId, 'Input.dispatchMouseEvent', {
      type: types[event.action],
      x: event.x,
      y: event.y,
      button: mouseButton(event.button),
      buttons: event.buttons,
      clickCount: event.action === 'move' ? 0 : 1,
      modifiers: modifiersMask(event.modifiers),
    });
    return;
  }
  if (event.type === 'wheel') {
    await page.cdp.sendSession(page.sessionId, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: event.x,
      y: event.y,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      modifiers: modifiersMask(event.modifiers),
    });
    return;
  }
  const { alt, ctrl, meta, shift } = event.modifiers;
  const keyCode = KEY_CODES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase().charCodeAt(0) : 0);
  const single = [...event.key].length === 1;
  // Option (Mac) and AltGr (Ctrl+Alt on Windows) compose characters. Chords that
  // leave the key on its base character are shortcuts. Linux Chrome refuses to
  // insert text while Ctrl is down, so AltGr text is sent without Ctrl+Alt.
  const composed = single && alt && !baseCharacter(event.key, event.code);
  const modifiers = composed && ctrl ? { alt: false, ctrl: false, meta, shift } : event.modifiers;
  const down = event.action === 'down';
  const text = down && single && !meta && (composed || (!alt && !ctrl)) ? event.key
    : down && event.key === 'Enter' && !alt && !ctrl && !meta ? '\r' : null;
  const selectAll = down && event.key.toLowerCase() === 'a' && (ctrl || meta) && !alt && !shift;
  await page.cdp.sendSession(page.sessionId, 'Input.dispatchKeyEvent', {
    type: down ? 'keyDown' : 'keyUp',
    key: event.key,
    code: event.code,
    modifiers: modifiersMask(modifiers),
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
    ...(text ? { text, unmodifiedText: text } : {}),
    ...(selectAll ? { commands: ['selectAll'] } : {}),
  });
};

// Follows focus through open shadow roots and same-origin frames. Password
// fields, inaccessible frames, and oversized selections copy nothing.
const clipboardExpression = `(() => {
  let root = document;
  let ownerDocument = document;
  for (let depth = 0; depth < 64; depth += 1) {
    const active = root.activeElement;
    if (active?.tagName === 'IFRAME' || active?.tagName === 'FRAME') {
      const childDocument = active.contentDocument;
      if (!childDocument) return '';
      root = childDocument;
      ownerDocument = childDocument;
      continue;
    }
    if (active?.shadowRoot) {
      root = active.shadowRoot;
      continue;
    }
    let text;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
      if (active.type === 'password' || !Number.isInteger(active.selectionStart)
        || !Number.isInteger(active.selectionEnd)
        || active.selectionEnd - active.selectionStart > ${SURFACE_TEXT_MAX}) return '';
      text = active.value.slice(active.selectionStart, active.selectionEnd);
    } else {
      const selection = root.getSelection?.() ?? ownerDocument.getSelection();
      text = selection?.toString() ?? '';
    }
    return text.length > ${SURFACE_TEXT_MAX} ? '' : text;
  }
  return '';
})()`;

const stopScreencast = (page) => {
  if (page?.cdp.isOpen) void page.cdp.sendSession(page.sessionId, 'Page.stopScreencast').catch(() => {});
};

export const createSurface = (runtime) => {
  const waiters = new Set();
  let page = null;
  let unsubscribe = null;
  let latest = null;
  let sequence = 0;
  let closed = false;
  let startPromise = null;
  // Bumps whenever the runtime's active tab changes.
  let target = 0;

  const finishWaiter = (waiter, value) => {
    if (!waiters.delete(waiter)) return;
    clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.onAbort);
    waiter.resolve(value);
  };

  const publish = (frame) => {
    latest = frame;
    for (const waiter of waiters) {
      if (frame.sequence > waiter.after) finishWaiter(waiter, frame);
    }
  };

  const detach = () => {
    unsubscribe?.();
    unsubscribe = null;
    stopScreencast(page);
    page = null;
  };

  const startSurface = async () => {
    for (;;) {
      const expected = target;
      const current = await runtime.ensurePage();
      if (closed) throw new Error('Surface is closed');
      if (page?.sessionId === current.sessionId && unsubscribe) return current;
      detach();
      page = current;
      unsubscribe = current.cdp.onEvent((event) => {
        if (event.sessionId !== current.sessionId || event.method !== 'Page.screencastFrame') return;
        void current.cdp.sendSession(current.sessionId, 'Page.screencastFrameAck', {
          sessionId: event.params.sessionId,
        }).catch(() => {});
        const bytes = Buffer.from(String(event.params.data ?? ''), 'base64');
        if (bytes.length === 0 || bytes.length > SURFACE_FRAME_MAX_BYTES) return;
        sequence += 1;
        publish({
          sequence,
          bytes,
          mime: 'image/jpeg',
          width: Math.round(event.params.metadata?.deviceWidth ?? runtime.viewport?.width ?? 0),
          height: Math.round(event.params.metadata?.deviceHeight ?? runtime.viewport?.height ?? 0),
          title: runtime.title,
        });
      });
      await current.cdp.sendSession(current.sessionId, 'Page.startScreencast', {
        format: 'jpeg',
        quality: 72,
        everyNthFrame: 1,
      });
      if (closed) {
        detach();
        throw new Error('Surface is closed');
      }
      if (expected === target) return current;
      // The active tab changed while this stream started; stop it and follow.
      stopScreencast(current);
    }
  };

  const start = () => {
    if (closed) return Promise.reject(new Error('Surface is closed'));
    if (!startPromise) startPromise = startSurface().catch((error) => {
      unsubscribe?.();
      unsubscribe = null;
      page = null;
      throw error;
    }).finally(() => { startPromise = null; });
    return startPromise;
  };

  return {
    async frame({ after, wait, signal }) {
      if (closed) return null;
      signal?.throwIfAborted();
      await start();
      signal?.throwIfAborted();
      if (latest && latest.sequence > after) return latest;
      if (wait === 0) return null;
      return new Promise((resolve, reject) => {
        const waiter = { after, signal, resolve, reject, timer: null, onAbort: null };
        waiter.onAbort = () => {
          if (!waiters.delete(waiter)) return;
          clearTimeout(waiter.timer);
          reject(signal.reason ?? new DOMException('Frame request cancelled', 'AbortError'));
        };
        waiter.timer = setTimeout(() => finishWaiter(waiter, null), wait);
        waiter.timer.unref?.();
        signal?.addEventListener('abort', waiter.onAbort, { once: true });
        waiters.add(waiter);
      });
    },
    async input(events) {
      const current = await start();
      for (const event of events) await dispatchInput(current, event);
    },
    control(controller) {
      runtime.controller = controller;
    },
    async resize({ width, height }) {
      await runtime.ensurePage();
      await runtime.setViewport({ width, height, mobile: false });
      return { width, height };
    },
    async clipboard() {
      const current = await start();
      const response = await current.cdp.sendSession(current.sessionId, 'Runtime.evaluate', {
        expression: clipboardExpression,
        returnByValue: true,
      });
      return typeof response.result?.value === 'string' ? response.result.value : '';
    },
    // The active tab changed: stop streaming the old one and wake long polls so
    // the next request starts on the new tab.
    retarget() {
      target += 1;
      detach();
      latest = null;
      for (const waiter of waiters) finishWaiter(waiter, null);
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const waiter of waiters) finishWaiter(waiter, null);
      await startPromise?.catch(() => {});
      detach();
    },
  };
};
