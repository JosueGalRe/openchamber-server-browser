import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountTabs } from '@openchamber/sdk/ui';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing panel root');

const scopeSelect = document.createElement('fieldset');
scopeSelect.className = 'session-tabs';
scopeSelect.setAttribute('aria-label', 'Browser sessions');
scopeSelect.addEventListener('keydown', (event) => {
  if (scopeSelect.disabled) event.stopPropagation();
}, true);

const status = document.createElement('span');
status.className = 'status';
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');

const setIcon = (button, draw) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  draw(svg);
  button.append(svg);
};

const addLine = (svg, attributes) => {
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  for (const [name, value] of Object.entries(attributes)) line.setAttribute(name, value);
  svg.append(line);
};

const addPath = (svg, d) => {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  svg.append(path);
};

const back = document.createElement('button');
back.type = 'button';
back.className = 'toolbar-button';
back.title = 'Back';
back.setAttribute('aria-label', 'Back');
setIcon(back, (svg) => {
  addPath(svg, 'm15 18-6-6 6-6');
  addLine(svg, { x1: '9', y1: '12', x2: '20', y2: '12' });
});

const forward = document.createElement('button');
forward.type = 'button';
forward.className = 'toolbar-button';
forward.title = 'Forward';
forward.setAttribute('aria-label', 'Forward');
setIcon(forward, (svg) => {
  addPath(svg, 'm9 18 6-6-6-6');
  addLine(svg, { x1: '4', y1: '12', x2: '15', y2: '12' });
});

const reload = document.createElement('button');
reload.type = 'button';
reload.className = 'toolbar-button';
let reloadShowsStop = null;
const drawReload = (loading) => {
  if (reloadShowsStop === loading) return;
  reloadShowsStop = loading;
  reload.replaceChildren();
  reload.title = loading ? 'Stop loading' : 'Reload';
  reload.setAttribute('aria-label', reload.title);
  setIcon(reload, loading
    ? (svg) => {
      addLine(svg, { x1: '6', y1: '6', x2: '18', y2: '18' });
      addLine(svg, { x1: '18', y1: '6', x2: '6', y2: '18' });
    }
    : (svg) => {
      addPath(svg, 'M20 11a8 8 0 1 0-2.34 5.66');
      addPath(svg, 'M20 4v7h-7');
    });
};
drawReload(false);

const selectCompatibility = document.createElement('button');
selectCompatibility.type = 'button';
selectCompatibility.className = 'toolbar-button select-compatibility';
selectCompatibility.setAttribute('aria-pressed', 'false');
setIcon(selectCompatibility, (svg) => {
  addPath(svg, 'M5 6.5h14v11H5z');
  addPath(svg, 'm9 10 3 3 3-3');
});

const address = document.createElement('input');
address.type = 'url';
address.placeholder = 'https://example.com';
address.autocomplete = 'off';
address.spellcheck = false;
address.setAttribute('aria-label', 'Address');

const VIEWPORT_PRESETS = Object.freeze({
  mobile: Object.freeze({ label: 'Mobile', width: 390, height: 844, mobile: true }),
  tablet: Object.freeze({ label: 'Tablet', width: 768, height: 1024, mobile: false }),
  desktop: Object.freeze({ label: 'Desktop', width: 1440, height: 900, mobile: false }),
});

// A native select: its popup is drawn by the browser, so the short dock does not clip it.
const viewportSelect = document.createElement('select');
viewportSelect.className = 'viewport-select';
viewportSelect.setAttribute('aria-label', 'Viewport size');
const customOption = new Option('Custom size…', 'custom');
// Shows a custom size in effect, so picking "Custom size…" always changes the
// value and opens the editor, even to edit that size.
const currentCustomOption = new Option('', 'current');
currentCustomOption.hidden = true;
currentCustomOption.disabled = true;
viewportSelect.append(
  new Option('Fit panel', 'auto'),
  ...Object.entries(VIEWPORT_PRESETS).map(([id, preset]) => new Option(`${preset.label} ${preset.width} × ${preset.height}`, id)),
  currentCustomOption,
  customOption,
);

const rotate = document.createElement('button');
rotate.type = 'button';
rotate.className = 'toolbar-button';
rotate.title = 'Rotate the viewport';
rotate.setAttribute('aria-label', rotate.title);
setIcon(rotate, (svg) => {
  addPath(svg, 'M4 12a8 8 0 0 1 13.66-5.66L20 8.5');
  addPath(svg, 'M20 3.5v5h-5');
  addPath(svg, 'M20 12a8 8 0 0 1-13.66 5.66L4 15.5');
  addPath(svg, 'M4 20.5v-5h5');
});

const mobileToggle = document.createElement('button');
mobileToggle.type = 'button';
mobileToggle.className = 'toolbar-button mobile-toggle';
mobileToggle.title = 'Emulate a mobile device';
mobileToggle.setAttribute('aria-label', mobileToggle.title);
mobileToggle.setAttribute('aria-pressed', 'false');
setIcon(mobileToggle, (svg) => {
  addPath(svg, 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z');
  addLine(svg, { x1: '11', y1: '18', x2: '13', y2: '18' });
});

const sizeInput = (label) => {
  const input = document.createElement('input');
  input.type = 'number';
  input.min = '1';
  input.max = '3840';
  input.step = '1';
  input.required = true;
  input.setAttribute('aria-label', label);
  return input;
};
const widthInput = sizeInput('Viewport width');
const heightInput = sizeInput('Viewport height');
const times = document.createElement('span');
times.textContent = '×';
times.setAttribute('aria-hidden', 'true');
const applySize = document.createElement('button');
applySize.type = 'button';
applySize.className = 'toolbar-button';
applySize.title = 'Apply this size';
applySize.setAttribute('aria-label', applySize.title);
setIcon(applySize, (svg) => addPath(svg, 'm5 12 5 5 9-10'));
const cancelSize = document.createElement('button');
cancelSize.type = 'button';
cancelSize.className = 'toolbar-button';
cancelSize.title = 'Cancel';
cancelSize.setAttribute('aria-label', cancelSize.title);
setIcon(cancelSize, (svg) => {
  addLine(svg, { x1: '6', y1: '6', x2: '18', y2: '18' });
  addLine(svg, { x1: '18', y1: '6', x2: '6', y2: '18' });
});
// Console problems on the visible page; the full view is the Browser inspector page.
const problems = document.createElement('span');
problems.className = 'problems';
problems.hidden = true;
const errorCount = document.createElement('span');
errorCount.className = 'problem-errors';
const warningCount = document.createElement('span');
warningCount.className = 'problem-warnings';
problems.append(errorCount, warningCount);

const customSize = document.createElement('form');
customSize.className = 'custom-size';
customSize.hidden = true;
customSize.append(widthInput, times, heightInput, applySize, cancelSize);

const viewportChoice = (viewport) => {
  if (!viewport || viewport.mode === 'auto') return 'auto';
  const preset = Object.entries(VIEWPORT_PRESETS)
    .find(([, candidate]) => candidate.width === viewport.width && candidate.height === viewport.height);
  return preset ? preset[0] : 'custom';
};

const pageTabs = document.createElement('div');
pageTabs.className = 'page-tabs';
pageTabs.setAttribute('role', 'tablist');
pageTabs.setAttribute('aria-label', 'Pages');

const newTab = document.createElement('button');
newTab.type = 'button';
newTab.className = 'new-tab';
newTab.title = 'New tab';
newTab.setAttribute('aria-label', 'New tab');
setIcon(newTab, (svg) => {
  addLine(svg, { x1: '12', y1: '5', x2: '12', y2: '19' });
  addLine(svg, { x1: '5', y1: '12', x2: '19', y2: '12' });
});

const pageLabel = (tab) => {
  if (tab.title) return tab.title;
  if (tab.url === 'about:blank') return 'New tab';
  try {
    return new URL(tab.url).host || tab.url;
  } catch {
    return tab.url;
  }
};

let pageTabsSignature = '';
const renderPageTabs = (selected, disabled) => {
  newTab.disabled = disabled;
  const items = selected?.tabs ?? [];
  const signature = JSON.stringify([items.map((tab) => [tab.id, pageLabel(tab), tab.url, tab.active]), disabled]);
  if (signature === pageTabsSignature) return;
  pageTabsSignature = signature;
  const focused = pageTabs.contains(document.activeElement) ? document.activeElement : null;
  pageTabs.replaceChildren(...items.map((tab) => {
    const item = document.createElement('div');
    item.className = 'page-tab';
    item.dataset.active = String(tab.active);
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'page-tab-select';
    select.setAttribute('role', 'tab');
    select.setAttribute('aria-selected', String(tab.active));
    select.tabIndex = tab.active ? 0 : -1;
    select.dataset.id = tab.id;
    select.disabled = disabled;
    select.title = tab.url === 'about:blank' ? pageLabel(tab) : `${pageLabel(tab)}\n${tab.url}`;
    const label = document.createElement('span');
    label.textContent = pageLabel(tab);
    select.append(label);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'page-tab-close';
    close.tabIndex = tab.active ? 0 : -1;
    close.dataset.id = tab.id;
    close.disabled = disabled;
    close.title = `Close ${pageLabel(tab)}`;
    close.setAttribute('aria-label', close.title);
    setIcon(close, (svg) => {
      addLine(svg, { x1: '7', y1: '7', x2: '17', y2: '17' });
      addLine(svg, { x1: '17', y1: '7', x2: '7', y2: '17' });
    });
    item.append(select, close);
    return item;
  }));
  if (focused?.dataset.id) {
    pageTabs.querySelector(`.${focused.className}[data-id="${CSS.escape(focused.dataset.id)}"]`)?.focus();
  }
};

// The chat open in this window: the dock can open its browser before any agent
// action and follows it when the user switches chats.
let chatDirectory = null;
let chatSession = null;
let followPending = true;
const currentChat = () => (chatDirectory && chatSession?.id
  ? { directory: chatDirectory, sessionId: chatSession.id, title: chatSession.title || chatSession.id }
  : null);
const scopeForChat = (chat) => (chat
  ? state?.scopes.find((scope) => scope.directory === chat.directory && scope.sessionId === chat.sessionId) ?? null
  : null);

const chatButton = document.createElement('button');
chatButton.type = 'button';
chatButton.className = 'chat-button';
chatButton.textContent = 'Open for this chat';
chatButton.hidden = true;

const scopeRow = document.createElement('div');
scopeRow.className = 'row scope-row';
scopeRow.append(scopeSelect, chatButton, status);

const pageTabsRow = document.createElement('div');
pageTabsRow.className = 'row page-tabs-row';
pageTabsRow.append(pageTabs, newTab);

const navigationRow = document.createElement('div');
navigationRow.className = 'row navigation-row';
navigationRow.append(back, forward, reload, address, customSize, problems, viewportSelect, rotate, mobileToggle, selectCompatibility);
root.append(scopeRow, pageTabsRow, navigationRow);

let state = null;
let requestPending = false;
let refreshPending = false;
let commandError = null;
let serviceError = null;
let addressDirty = false;
let tabsSignature = '';
let pendingTabFocusId = null;
const tabs = mountTabs(scopeSelect, {
  items: [],
  activeId: '',
  trackBackground: true,
  onChange: (scopeId) => {
    if (!state || requestPending || !dockUsable()) return;
    pendingTabFocusId = scopeId;
    void request('/browser/select', { scopeId, generation: state.generation }).then((succeeded) => {
      if (succeeded) addressDirty = false;
      else pendingTabFocusId = null;
      render();
    });
  },
});
scopeSelect.querySelector('[role="tablist"]').setAttribute('aria-label', 'Browser sessions');

const parseState = (body) => {
  const value = JSON.parse(body);
  if (!value || typeof value !== 'object' || !Array.isArray(value.scopes)) throw new Error('Invalid browser state');
  if (!Number.isInteger(value.generation) || value.generation < 0) throw new Error('Invalid browser generation');
  return value;
};

const scopeLabel = (scope) => {
  const parts = String(scope.directory ?? '').split(/[\\/]/).filter(Boolean);
  const directory = parts.at(-1) ?? 'project';
  const session = String(scope.sessionId ?? 'unknown');
  return `${directory} · ${session.length > 12 ? `${session.slice(0, 12)}…` : session}`;
};

const errorFromBody = (body) => {
  try {
    const error = JSON.parse(body)?.error;
    return typeof error === 'string' && error ? error : null;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
};

// The toolbar acts while nobody holds the page, or for the viewer that does.
const dockUsable = () => state?.controller === 'none' || state?.viewerInControl === true;

const render = () => {
  const scopes = state?.scopes ?? [];
  const selected = scopes.find((scope) => scope.id === state?.selectedScopeId) ?? null;
  const usable = dockUsable();
  scopeSelect.disabled = requestPending || scopes.length < 2 || !usable;
  const chat = currentChat();
  chatButton.hidden = !chat || Boolean(scopeForChat(chat));
  chatButton.disabled = requestPending || !usable;
  if (chat) chatButton.title = `Open a browser for ${chat.title}`;
  const items = scopes.map((scope) => ({ id: String(scope.id), label: scopeLabel(scope) }));
  const activeId = selected ? String(selected.id) : '';
  const signature = JSON.stringify([items, activeId]);
  if (signature !== tabsSignature) {
    const focusedId = pendingTabFocusId ?? document.activeElement?.dataset.id;
    tabs.update({ items, activeId });
    tabsSignature = signature;
    for (const button of scopeSelect.querySelectorAll('[role="tab"]')) {
      if (button.dataset.id === focusedId) {
        button.focus();
        pendingTabFocusId = null;
      }
    }
  }
  for (const button of scopeSelect.querySelectorAll('[role="tab"]')) {
    const scope = scopes.find((item) => String(item.id) === button.dataset.id);
    const page = scope.title || (scope.url === 'about:blank' ? '' : scope.url);
    button.title = `${page ? `${page} — ` : ''}${scope.directory} · ${scope.sessionId}`;
  }
  if (!addressDirty) address.value = selected?.url === 'about:blank' ? '' : String(selected?.url ?? '');

  const disabled = requestPending || !selected || !usable;
  renderPageTabs(selected, disabled);
  back.disabled = disabled || !selected.canGoBack;
  forward.disabled = disabled || !selected.canGoForward;
  drawReload(selected?.isLoading === true);
  reload.disabled = disabled;
  address.disabled = disabled;
  selectCompatibility.disabled = disabled;
  const compatibilityEnabled = selected?.nativeSelectCompatibility === true;
  selectCompatibility.setAttribute('aria-pressed', String(compatibilityEnabled));
  const compatibilityLabel = compatibilityEnabled
    ? 'Disable visible native select menus'
    : 'Show native select menus in the shared browser';
  selectCompatibility.title = compatibilityLabel;
  selectCompatibility.setAttribute('aria-label', compatibilityLabel);

  const { errors = 0, warnings = 0 } = selected?.problems ?? {};
  problems.hidden = errors + warnings === 0;
  errorCount.textContent = errors ? `✕ ${errors}` : '';
  warningCount.textContent = warnings ? `⚠ ${warnings}` : '';
  const problemsLabel = `${errors} ${errors === 1 ? 'error' : 'errors'} and ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} in this page's console. Open Browser inspector from Extension pages to see them.`;
  problems.title = problemsLabel;
  problems.setAttribute('aria-label', problemsLabel);

  const viewport = selected?.viewport ?? null;
  const choice = viewportChoice(viewport);
  currentCustomOption.textContent = choice === 'custom' ? `Custom ${viewport.width} × ${viewport.height}` : '';
  if (customSize.hidden) viewportSelect.value = choice === 'custom' ? 'current' : choice;
  viewportSelect.disabled = disabled || !viewport;
  viewportSelect.title = viewport?.mode === 'fixed' && viewport.source === 'agent'
    ? 'The agent chose this viewport. Pick another size to take it over.'
    : 'Viewport size';
  rotate.disabled = disabled || viewport?.mode !== 'fixed';
  mobileToggle.disabled = disabled || !viewport;
  mobileToggle.setAttribute('aria-pressed', String(viewport?.mobile === true));

  let statusState = 'ready';
  let statusMessage = '';
  let statusTitle = 'Click or type in the page to take control. Enter an address and press Enter to navigate.';
  const notice = state?.notice ? `${scopeLabel(state.notice)}: ${state.notice.message}` : null;
  if (commandError || serviceError || notice || selected?.nativeSelectCompatibilityError) {
    statusState = 'error';
    statusMessage = commandError ?? serviceError ?? notice ?? selected.nativeSelectCompatibilityError;
    statusTitle = statusMessage;
  } else if (!selected) {
    statusState = 'waiting';
    statusMessage = currentChat()
      ? 'Open this chat\'s browser or ask the agent to use openchamber_web'
      : 'Ask the agent to open a page with openchamber_web';
    statusTitle = 'The browser starts with the agent\'s first browser action in a chat, or when you open it for the chat you are viewing.';
  } else if (state.controller === 'user') {
    statusState = 'user';
    statusTitle = state.viewerInControl
      ? 'You have control of the page, so this toolbar acts on it too.'
      : 'Another viewer has control of the page. The toolbar works again once they hand it back.';
  } else if (!usable) {
    statusState = 'agent';
    statusTitle = 'Waiting for the agent action to finish';
  }
  status.dataset.state = statusState;
  status.dataset.message = statusMessage ? 'true' : 'false';
  status.textContent = statusMessage;
  status.title = statusTitle;
  status.setAttribute('aria-label', statusTitle);
  scopeSelect.title = scopeSelect.disabled ? statusTitle : '';
};

const request = async (path, payload) => {
  requestPending = true;
  commandError = null;
  render();
  try {
    const result = await host.serviceRequest({
      method: 'POST',
      path,
      body: JSON.stringify(payload),
    });
    if (result.status < 200 || result.status >= 300) {
      throw new Error(errorFromBody(result.body) ?? `Service returned ${result.status}`);
    }
    state = parseState(result.body);
    return true;
  } catch (error) {
    commandError = error instanceof Error ? error.message : 'Browser command failed';
    return false;
  } finally {
    requestPending = false;
    render();
  }
};

// The service draws its page menu with these and sizes pages from the ratio.
let viewerTheme = null;
let reportedViewer = null;
const syncViewer = () => {
  const payload = JSON.stringify({ devicePixelRatio: window.devicePixelRatio || 1, ...(viewerTheme ? { theme: viewerTheme } : {}) });
  if (payload === reportedViewer) return;
  reportedViewer = payload;
  void host.serviceRequest({ method: 'POST', path: '/browser/viewer', body: payload })
    .then((result) => { if (result.status !== 200) reportedViewer = null; }, () => { reportedViewer = null; });
};
// A new ratio (another display, or zoom) goes out right away, ahead of the
// host's debounced panel measurement that the service converts with it.
const watchPixelRatio = () => {
  window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    .addEventListener('change', () => { syncViewer(); watchPixelRatio(); }, { once: true });
};
watchPixelRatio();

let lastCopyId = null;
const offerCopy = (copy) => {
  if (!copy || copy.id === lastCopyId) return;
  lastCopyId = copy.id;
  const toast = copy.text === null
    ? { kind: 'error', message: 'This selection is too long to copy from the menu. Use Ctrl/Cmd+C instead.' }
    : copy.text
      ? { kind: 'info', message: 'The selected text is ready to copy.', copy: { text: copy.text } }
      : { kind: 'info', message: 'Select text on the page to copy it.' };
  void host.toast(toast).catch(() => {});
};

const refresh = async () => {
  if (refreshPending || requestPending) return;
  refreshPending = true;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/browser/state' });
    if (result.status === 200) {
      state = parseState(result.body);
      serviceError = null;
      syncViewer();
      offerCopy(state.copy);
      followChat();
      render();
    }
  } catch (error) {
    serviceError = error instanceof Error ? error.message : 'Browser service unavailable';
    render();
  } finally {
    refreshPending = false;
  }
};

back.addEventListener('click', () => {
  if (!state) return;
  void request('/browser/back', { generation: state.generation }).then((succeeded) => {
    if (!succeeded) return;
    addressDirty = false;
    render();
  });
});

forward.addEventListener('click', () => {
  if (!state) return;
  void request('/browser/forward', { generation: state.generation }).then((succeeded) => {
    if (!succeeded) return;
    addressDirty = false;
    render();
  });
});

reload.addEventListener('click', () => {
  if (!state) return;
  const loading = state.scopes.find((scope) => scope.id === state.selectedScopeId)?.isLoading === true;
  void request(loading ? '/browser/stop' : '/browser/reload', { generation: state.generation }).then((succeeded) => {
    if (!succeeded) return;
    addressDirty = false;
    render();
  });
});

// Keeps trying while the chat has no browser yet, so the first agent action in
// the open chat brings its browser into view.
const followChat = () => {
  if (!followPending || !state || requestPending) return;
  const scope = scopeForChat(currentChat());
  if (!scope) return;
  if (scope.id === state.selectedScopeId) {
    followPending = false;
    return;
  }
  if (!dockUsable()) return;
  followPending = false;
  void request('/browser/select', { scopeId: scope.id, generation: state.generation }).then((succeeded) => {
    if (succeeded) addressDirty = false;
    render();
  });
};

chatButton.addEventListener('click', () => {
  const chat = currentChat();
  if (!state || !chat) return;
  void request('/browser/scope', { directory: chat.directory, sessionId: chat.sessionId, generation: state.generation })
    .then((succeeded) => {
      if (succeeded) addressDirty = false;
      render();
    });
});

host.onDirectory((directory) => {
  if (directory === chatDirectory) return;
  chatDirectory = directory;
  followPending = true;
  render();
});

host.onSession((session) => {
  if (session?.id !== chatSession?.id) followPending = true;
  chatSession = session;
  render();
});

const tabCommand = (path, payload) => {
  if (!state) return;
  void request(path, { ...payload, generation: state.generation }).then((succeeded) => {
    if (!succeeded) return;
    addressDirty = false;
    render();
  });
};

pageTabs.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button?.dataset.id) return;
  if (button.classList.contains('page-tab-close')) tabCommand('/browser/tabs/close', { tabId: button.dataset.id });
  else if (button.getAttribute('aria-selected') !== 'true') tabCommand('/browser/tabs/select', { tabId: button.dataset.id });
});

pageTabs.addEventListener('keydown', (event) => {
  if ((event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') || !event.target.matches('.page-tab-select')) return;
  const buttons = [...pageTabs.querySelectorAll('.page-tab-select')];
  const step = event.key === 'ArrowRight' ? 1 : -1;
  event.preventDefault();
  buttons[(buttons.indexOf(event.target) + step + buttons.length) % buttons.length]?.focus();
});

newTab.addEventListener('click', () => tabCommand('/browser/tabs/new', {}));

selectCompatibility.addEventListener('click', () => {
  if (!state) return;
  const selected = state.scopes.find((scope) => scope.id === state.selectedScopeId);
  if (!selected) return;
  void request('/browser/select-compatibility', {
    enabled: selected.nativeSelectCompatibility !== true,
    generation: state.generation,
  });
});

address.addEventListener('input', () => {
  addressDirty = true;
});

const navigate = () => {
  if (!state || !address.value.trim()) return;
  const url = address.value.trim();
  void request('/browser/navigate', { url, generation: state.generation }).then((succeeded) => {
    if (!succeeded) return;
    addressDirty = false;
    render();
  });
};

address.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    navigate();
    return;
  }
  if (event.key !== 'Escape') return;
  addressDirty = false;
  render();
});

const selectedViewport = () => state?.scopes.find((scope) => scope.id === state.selectedScopeId)?.viewport ?? null;

const setViewport = (viewport) => {
  if (!state) return;
  void request('/browser/viewport', { ...viewport, generation: state.generation });
};

const closeCustomSize = () => {
  customSize.hidden = true;
  address.hidden = false;
  render();
};

viewportSelect.addEventListener('change', () => {
  const current = selectedViewport();
  if (!current) return;
  if (viewportSelect.value === 'custom') {
    widthInput.value = String(current.width);
    heightInput.value = String(current.height);
    address.hidden = true;
    customSize.hidden = false;
    widthInput.focus();
    widthInput.select();
    return;
  }
  const preset = VIEWPORT_PRESETS[viewportSelect.value];
  setViewport(preset
    ? { mode: 'fixed', width: preset.width, height: preset.height, mobile: preset.mobile }
    : { mode: 'auto', mobile: current.mobile });
});

rotate.addEventListener('click', () => {
  const current = selectedViewport();
  if (current?.mode !== 'fixed') return;
  setViewport({ mode: 'fixed', width: current.height, height: current.width, mobile: current.mobile });
});

mobileToggle.addEventListener('click', () => {
  const current = selectedViewport();
  if (!current) return;
  setViewport(current.mode === 'fixed'
    ? { mode: 'fixed', width: current.width, height: current.height, mobile: !current.mobile }
    : { mode: 'auto', mobile: !current.mobile });
});

// The host frames the dock without allow-forms, so this form never fires
// submit; Enter in a size field and the apply button call this instead.
const applyCustomSize = () => {
  const current = selectedViewport();
  if (!current || !customSize.reportValidity()) return;
  customSize.hidden = true;
  address.hidden = false;
  setViewport({ mode: 'fixed', width: Number(widthInput.value), height: Number(heightInput.value), mobile: current.mobile });
};

applySize.addEventListener('click', applyCustomSize);
cancelSize.addEventListener('click', closeCustomSize);
customSize.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCustomSize();
  } else if (event.key === 'Enter' && (event.target === widthInput || event.target === heightInput)) {
    event.preventDefault();
    applyCustomSize();
  }
});

let mounted = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  const { tokens } = context.theme;
  viewerTheme = {
    mode: context.theme.mode,
    elevated: tokens.elevated,
    elevatedForeground: tokens.elevatedForeground,
    border: tokens.border,
    hover: tokens.hover,
    muted: tokens.muted,
    font: tokens.font,
    radius: tokens.radius,
  };
  if (mounted) return;
  mounted = true;
  render();
  void refresh();
  window.setInterval(() => { void refresh(); }, 1_000);
});
