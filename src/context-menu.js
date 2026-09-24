import crypto from 'node:crypto';

export const MENU_WORLD = 'openchamber-menu';
export const MENU_BINDING = 'openchamberMenu';

const THEME_PROPERTIES = Object.freeze({
  elevated: '--menu-background',
  elevatedForeground: '--menu-foreground',
  border: '--menu-border',
  hover: '--menu-hover',
  muted: '--menu-muted',
  font: '--menu-font',
  radius: '--menu-radius',
});

// Maps the host theme tokens the dock reports onto the menu's custom
// properties. Values are set with setProperty; an unusable token falls back
// to the menu's own default rather than rejecting the theme.
export const readMenuTheme = (value) => {
  if (!value || typeof value !== 'object' || (value.mode !== 'light' && value.mode !== 'dark')) return null;
  const properties = {};
  for (const [token, property] of Object.entries(THEME_PROPERTIES)) {
    const declared = value[token];
    if (typeof declared === 'string' && declared.length <= 200 && !/[;{}<>\\]/.test(declared)) properties[property] = declared;
  }
  return { dark: value.mode === 'dark', properties };
};

// The functions below run in the page's isolated world, not in the service.

function observeContextMenu() {
  const state = (globalThis.__openchamberMenu ??= {});
  state.dispose?.();
  state.event = null;
  const listener = (event) => {
    if (!state.event && event.isTrusted && event.button === 2) state.event = event;
  };
  addEventListener('contextmenu', listener, true);
  const timer = setTimeout(() => state.dispose?.(), 5000);
  state.dispose = () => {
    removeEventListener('contextmenu', listener, true);
    clearTimeout(timer);
    state.dispose = null;
  };
}

// defaultPrevented is read after the page's own handlers ran.
function settleContextMenu() {
  const state = globalThis.__openchamberMenu;
  const event = state?.event;
  state?.dispose?.();
  if (state) state.event = null;
  return event ? { handled: event.defaultPrevented, x: event.clientX, y: event.clientY } : null;
}

function openContextMenu({ x, y, token, binding, theme, items }) {
  const state = (globalThis.__openchamberMenu ??= {});
  state.close?.();
  const report = globalThis[binding];
  const host = document.createElement('openchamber-menu');
  host.setAttribute('style', 'all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block;');
  for (const [property, value] of Object.entries(theme.properties)) host.style.setProperty(property, value);
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = [
    `:host { color-scheme: ${theme.dark ? 'dark' : 'light'}; }`,
    '.menu { position: fixed; box-sizing: border-box; min-width: 180px; padding: 4px; border: 1px solid var(--menu-border, #8886);'
      + ' border-radius: var(--menu-radius, 8px); background: var(--menu-background, Canvas); color: var(--menu-foreground, CanvasText);'
      + ' font: 13px var(--menu-font, system-ui, sans-serif); box-shadow: 0 8px 24px #0004; }',
    'button { display: flex; box-sizing: border-box; width: 100%; height: 28px; align-items: center; justify-content: space-between;'
      + ' gap: 24px; padding: 0 10px; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: left; }',
    'button:hover:not(:disabled) { background: var(--menu-hover, #8883); }',
    'button:disabled, span { color: var(--menu-muted, GrayText); }',
    'hr { margin: 4px 2px; border: 0; border-top: 1px solid var(--menu-border, #8886); }',
    '.backdrop { position: fixed; inset: 0; }',
  ].join('\n');
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  for (const item of items) {
    if (item.separator) {
      menu.append(document.createElement('hr'));
      continue;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitem');
    button.dataset.action = item.action;
    button.disabled = item.disabled === true;
    button.append(item.label);
    if (item.hint) {
      const hint = document.createElement('span');
      hint.textContent = item.hint;
      button.append(hint);
    }
    menu.append(button);
  }
  // Clicks on the host itself would not pass through this shadow root, so a
  // backdrop inside it takes every click outside the menu.
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  root.append(style, backdrop, menu);
  const choose = (action) => {
    state.close?.();
    report(JSON.stringify({ token, action }));
  };
  // The page shares this DOM, so only real input counts. The backdrop keeps
  // an outside click on the menu, and propagation stops here so the page's
  // bubbling listeners do not see it either. Pressing inside the menu must
  // not move the page's focus or selection.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'wheel']) {
    root.addEventListener(type, (event) => {
      event.stopPropagation();
      if (type === 'mousedown') event.preventDefault();
    });
  }
  root.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const item = event.target.closest('button[data-action]');
    if (item?.disabled) return;
    choose(item ? item.dataset.action : 'dismiss');
  });
  root.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.isTrusted) choose('dismiss');
  });
  document.documentElement.append(host);
  try {
    host.popover = 'manual';
    host.showPopover();
  } catch {}
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - bounds.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - bounds.height - 4))}px`;
  state.close = () => {
    host.remove();
    state.close = null;
  };
}

function closeContextMenu() {
  globalThis.__openchamberMenu?.close?.();
}

const call = (page, contextId, fn, argument) => page.cdp.sendSession(page.sessionId, 'Runtime.callFunctionOn', {
  functionDeclaration: fn.toString(),
  executionContextId: contextId,
  arguments: argument === undefined ? [] : [{ value: argument }],
  returnByValue: true,
});

const DEFAULT_THEME = Object.freeze({ dark: false, properties: {} });

// The viewer's fallback menu for a right click the page leaves alone. Chrome
// shows no native menu headless, so the menu is drawn into the page, where
// it reaches the viewer in ordinary frames.
export const createContextMenu = ({ navigationState, readSelection, onAction }) => {
  let observing = null;
  let open = null;

  const close = async () => {
    const current = open;
    open = null;
    if (current) await call(current.page, current.contextId, closeContextMenu).catch(() => {});
  };

  return {
    get isOpen() {
      return open !== null;
    },
    close,
    // The document went away, and its menu with it.
    forget(sessionId) {
      if (open?.page.sessionId === sessionId) open = null;
      if (observing?.page.sessionId === sessionId) observing = null;
    },
    async observe(page) {
      await close();
      // The selection a right click acts on is the one before the click.
      const selection = await readSelection().catch(() => '');
      const world = await page.cdp.sendSession(page.sessionId, 'Page.createIsolatedWorld', {
        frameId: page.targetId,
        worldName: MENU_WORLD,
      });
      observing = { page, contextId: world.executionContextId, selection };
      await call(page, observing.contextId, observeContextMenu);
    },
    async settle(page, theme) {
      const current = observing;
      observing = null;
      if (!current || current.page.sessionId !== page.sessionId) return;
      const result = (await call(page, current.contextId, settleContextMenu)).result?.value;
      if (!result || result.handled) return;
      const { canGoBack, canGoForward } = navigationState();
      const token = crypto.randomUUID();
      await call(page, current.contextId, openContextMenu, {
        x: result.x,
        y: result.y,
        token,
        binding: MENU_BINDING,
        theme: theme ?? DEFAULT_THEME,
        items: [
          { action: 'back', label: 'Back', disabled: !canGoBack },
          { action: 'forward', label: 'Forward', disabled: !canGoForward },
          { action: 'reload', label: 'Reload' },
          { separator: true },
          { action: 'copy', label: 'Copy' },
          { action: 'paste', label: 'Paste', hint: 'Ctrl/Cmd+V', disabled: true },
        ],
      });
      open = { page, contextId: current.contextId, token, selection: current.selection };
    },
    handleBinding(sessionId, params) {
      if (!open || open.page.sessionId !== sessionId || params.executionContextId !== open.contextId) return;
      let choice;
      try {
        choice = JSON.parse(params.payload);
      } catch {
        return;
      }
      if (choice?.token !== open.token) return;
      const { selection } = open;
      open = null;
      if (typeof choice.action === 'string') onAction(choice.action, selection);
    },
  };
};
