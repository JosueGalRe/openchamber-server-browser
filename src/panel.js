import { connectHost } from '@openchamber/sdk';
import { applyHostReady } from '@openchamber/sdk/ui';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing panel root');

// A native select: its popup is drawn by the browser, so the short dock does not clip it.
const scopeSelect = document.createElement('select');
scopeSelect.className = 'scope-select';
scopeSelect.setAttribute('aria-label', 'Browser session');

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
  addPath(svg, 'm7 15 5 5 5-5');
  addPath(svg, 'm7 9 5-5 5 5');
});

const devtoolsToggle = document.createElement('button');
devtoolsToggle.type = 'button';
devtoolsToggle.className = 'toolbar-button devtools-toggle';
devtoolsToggle.setAttribute('aria-pressed', 'false');
setIcon(devtoolsToggle, (svg) => {
  addPath(svg, 'm8 7-5 5 5 5');
  addPath(svg, 'm16 7 5 5-5 5');
  addLine(svg, { x1: '14', y1: '4', x2: '10', y2: '20' });
});

const address = document.createElement('input');
// A text field with the URL keyboard: Android's Chrome ignores enterkeyhint on
// type="url" and offers Next, which moves focus on instead of sending Enter.
address.type = 'text';
address.inputMode = 'url';
address.enterKeyHint = 'go';
address.autocapitalize = 'off';
address.placeholder = 'https://example.com';
address.autocomplete = 'off';
address.spellcheck = false;
address.setAttribute('aria-label', 'Address');

const omnibox = document.createElement('div');
omnibox.className = 'omnibox';

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
// Console problems on the visible page. The badge opens a compact list under
// the address bar and grows the dock; the Browser inspector page keeps the
// full console and network.
const CONSOLE_HEIGHT = 132;
let consoleOpen = false;
let consoleEntries = null;
const problems = document.createElement('button');
problems.type = 'button';
problems.className = 'problems';
problems.hidden = true;
problems.setAttribute('aria-controls', 'console');
problems.setAttribute('aria-expanded', 'false');
const errorCount = document.createElement('span');
errorCount.className = 'problem-errors';
const warningCount = document.createElement('span');
warningCount.className = 'problem-warnings';
problems.append(errorCount, warningCount);
omnibox.append(address, problems);

const consolePanel = document.createElement('section');
consolePanel.id = 'console';
consolePanel.className = 'console';
consolePanel.hidden = true;
consolePanel.setAttribute('aria-label', 'Page errors and warnings');
const consoleHeader = document.createElement('p');
consoleHeader.className = 'console-header';
consoleHeader.textContent = 'Errors and warnings since this page loaded. Browser inspector, under Extension pages, has the full console and network.';
const consoleList = document.createElement('ol');
consoleList.className = 'console-list';
consoleList.tabIndex = 0;
consoleList.setAttribute('role', 'log');
consoleList.setAttribute('aria-label', 'Errors and warnings since this page loaded');
consolePanel.append(consoleHeader, consoleList);

let consoleSignature = '';
const renderConsole = () => {
  root.classList.toggle('console-open', consoleOpen);
  consolePanel.hidden = !consoleOpen;
  const signature = JSON.stringify(consoleEntries);
  if (signature === consoleSignature) return;
  consoleSignature = signature;
  // Stay on the newest entry unless the reader scrolled up.
  const atEnd = consoleList.scrollTop + consoleList.clientHeight >= consoleList.scrollHeight - 4;
  const rows = (consoleEntries ?? []).map((entry) => {
    const row = document.createElement('li');
    row.className = 'console-row';
    row.dataset.level = entry.level;
    const level = document.createElement('span');
    level.className = 'console-level';
    level.textContent = entry.level === 'error' ? 'Error' : 'Warning';
    const message = document.createElement('span');
    message.className = 'console-message';
    message.textContent = entry.message;
    message.title = entry.message;
    const source = document.createElement('span');
    source.className = 'console-source';
    source.textContent = entry.source;
    row.append(level, message, source);
    return row;
  });
  if (consoleEntries?.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'console-empty';
    empty.textContent = 'No errors or warnings since this page loaded.';
    rows.push(empty);
  }
  consoleList.replaceChildren(...rows);
  if (atEnd) consoleList.scrollTop = consoleList.scrollHeight;
};

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
  newTab.hidden = !selected;
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

const divider = () => {
  const element = document.createElement('span');
  element.className = 'divider';
  element.setAttribute('aria-hidden', 'true');
  return element;
};

const viewportGroup = document.createElement('div');
viewportGroup.className = 'viewport-group';
viewportGroup.setAttribute('role', 'group');
viewportGroup.setAttribute('aria-label', 'Viewport');
viewportGroup.append(mobileToggle, viewportSelect, rotate);

const tabStrip = document.createElement('div');
tabStrip.className = 'row tab-strip';
tabStrip.append(scopeSelect, divider(), pageTabs, newTab, status, chatButton);

const navigationRow = document.createElement('div');
navigationRow.className = 'row navigation-row';
navigationRow.append(back, forward, reload, omnibox, customSize, divider(), viewportGroup, divider(), devtoolsToggle, selectCompatibility);
root.append(tabStrip, navigationRow, consolePanel);

// The dock asks for the height its rows take, which grows when a narrow panel
// wraps them or a touch screen makes them taller, plus the open console.
let requestedHeight = null;
const syncHeight = () => {
  // A hidden frame has no layout to measure.
  if (!root.clientWidth) return;
  const height = Math.ceil(navigationRow.getBoundingClientRect().bottom) + (consoleOpen ? CONSOLE_HEIGHT : 0);
  if (height === requestedHeight) return;
  requestedHeight = height;
  void host.setHeight(height).catch(() => { requestedHeight = null; });
};

let state = null;
let requestPending = false;
let refreshPending = false;
let commandError = null;
let serviceError = null;
let addressDirty = false;
let scopeOptionsSignature = '';

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
  // One browser needs no picker; the chat it belongs to is the one in view.
  scopeSelect.hidden = scopes.length < 2;
  scopeSelect.disabled = requestPending || !usable;
  const chat = currentChat();
  chatButton.hidden = !chat || Boolean(scopeForChat(chat));
  chatButton.disabled = requestPending || !usable;
  if (chat) chatButton.title = `Open a browser for ${chat.title}`;
  const options = scopes.map((scope) => [String(scope.id), scopeLabel(scope)]);
  const signature = JSON.stringify(options);
  if (signature !== scopeOptionsSignature) {
    scopeOptionsSignature = signature;
    scopeSelect.replaceChildren(...options.map(([id, label]) => new Option(label, id)));
  }
  // A pick in flight keeps showing until the service answers with it.
  if (!requestPending) scopeSelect.value = selected ? String(selected.id) : '';
  const page = selected?.title || (selected?.url === 'about:blank' ? '' : selected?.url);
  scopeSelect.title = selected ? `${page ? `${page} — ` : ''}${selected.directory} · ${selected.sessionId}` : '';
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
  const devtoolsOpen = selected?.devtools === true;
  devtoolsToggle.disabled = disabled;
  devtoolsToggle.setAttribute('aria-pressed', String(devtoolsOpen));
  const devtoolsLabel = devtoolsOpen ? 'Close Chrome DevTools and show the page' : 'Open Chrome DevTools for this page';
  devtoolsToggle.title = devtoolsLabel;
  devtoolsToggle.setAttribute('aria-label', devtoolsLabel);

  const { errors = 0, warnings = 0 } = selected?.problems ?? {};
  // An open console keeps its toggle even once the page has no problems.
  problems.hidden = errors + warnings === 0 && !consoleOpen;
  errorCount.textContent = errors || !warnings ? `✕ ${errors}` : '';
  warningCount.textContent = warnings ? `⚠ ${warnings}` : '';
  problems.setAttribute('aria-expanded', String(consoleOpen));
  const problemsLabel = `${errors} ${errors === 1 ? 'error' : 'errors'} and ${warnings} ${warnings === 1 ? 'warning' : 'warnings'} on this page. ${consoleOpen ? 'Hide the list.' : 'Show them under the address bar.'}`;
  problems.title = problemsLabel;
  problems.setAttribute('aria-label', problemsLabel);
  renderConsole();

  const viewport = selected?.viewport ?? null;
  const choice = viewportChoice(viewport);
  currentCustomOption.textContent = choice === 'custom' ? `Custom ${viewport.width} × ${viewport.height}` : '';
  if (customSize.hidden) viewportSelect.value = choice === 'custom' ? 'current' : choice;
  viewportSelect.disabled = disabled || !viewport;
  viewportSelect.title = viewport?.mode === 'fixed' && viewport.source === 'agent'
    ? 'The agent chose this viewport. Pick another size to take it over.'
    : 'Viewport size';
  rotate.hidden = viewport?.mode !== 'fixed';
  rotate.disabled = disabled;
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
  // The host's bar under the dock already says who holds control. Only the dot
  // goes, so the live region stays in place to announce errors.
  status.dataset.quiet = String(statusState === 'ready' || (statusState === 'user' && usable));
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
// The host writes the clipboard where it can, which needs its window focused;
// otherwise a toast offers its own Copy button.
const offerCopy = (copy) => {
  if (!copy || copy.id === lastCopyId) return;
  lastCopyId = copy.id;
  if (copy.text === null) {
    void host.toast({ kind: 'error', message: 'This text is too long to copy from the shared browser.' }).catch(() => {});
    return;
  }
  if (!copy.text) {
    void host.toast({ kind: 'info', message: 'Select text on the page to copy it.' }).catch(() => {});
    return;
  }
  void host.writeClipboard(copy.text).catch(() => host.toast({ kind: 'info', message: 'The copied text is ready.', copy: { text: copy.text } })).catch(() => {});
};

const refresh = async () => {
  if (refreshPending || requestPending) return;
  refreshPending = true;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/browser/state', ...(consoleOpen ? { query: { problems: '1' } } : {}) });
    if (result.status === 200) {
      state = parseState(result.body);
      // Command answers carry no list, so the console keeps the last one it got.
      if (consoleOpen && Array.isArray(state.consoleProblems)) consoleEntries = state.consoleProblems;
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

problems.addEventListener('click', () => {
  consoleOpen = !consoleOpen;
  consoleEntries = null;
  render();
  syncHeight();
  void refresh();
});

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

scopeSelect.addEventListener('change', () => {
  if (!state || requestPending || !dockUsable()) return;
  void request('/browser/select', { scopeId: scopeSelect.value, generation: state.generation }).then((succeeded) => {
    if (succeeded) addressDirty = false;
    render();
  });
});

devtoolsToggle.addEventListener('click', () => {
  if (!state) return;
  const selected = state.scopes.find((scope) => scope.id === state.selectedScopeId);
  if (!selected) return;
  void request('/browser/devtools', { open: selected.devtools !== true, generation: state.generation });
});

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
  omnibox.hidden = false;
  render();
};

viewportSelect.addEventListener('change', () => {
  const current = selectedViewport();
  if (!current) return;
  if (viewportSelect.value === 'custom') {
    widthInput.value = String(current.width);
    heightInput.value = String(current.height);
    omnibox.hidden = true;
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
  omnibox.hidden = false;
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
  // Its first call also sizes a reloaded dock, which starts closed whatever
  // height the host kept for it.
  const rows = new ResizeObserver(syncHeight);
  rows.observe(tabStrip);
  rows.observe(navigationRow);
  void refresh();
  window.setInterval(() => { void refresh(); }, 1_000);
});
