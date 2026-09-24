import { connectHost } from '@openchamber/sdk';
import { applyHostReady, mountBanner, mountButton, mountEmpty, mountSearchField, mountTabs } from '@openchamber/sdk/ui';

const host = connectHost();
const root = document.querySelector('#root');
if (!root) throw new Error('Missing inspector root');

const POLL_MS = 500;
const RETRY_MS = 2_000;
const MAX_CONSOLE_ROWS = 1_000;
const MAX_NETWORK_ROWS = 500;
const MAX_EXPRESSION_CHARS = 16_000;
const LEVELS = Object.freeze({ debug: 'Debug', info: 'Info', log: 'Log', warning: 'Warning', error: 'Error' });
const EVALUATION_ERRORS = Object.freeze({
  EVALUATION_TIMEOUT: 'JavaScript timed out. The page may still be running it.',
  EVALUATION_FAILED: 'Could not run the JavaScript. Try again.',
  INVALID_REQUEST: 'Another command is still running, or the JavaScript is too long.',
});
const REQUEST_ERRORS = Object.freeze({
  REQUEST_GONE: 'This request is no longer available.',
  REQUEST_FAILED: 'Could not load request details. Try again.',
});
const BODY_STATES = Object.freeze({
  'not-requested': 'Bodies are loaded only when you request them.',
  unavailable: 'Bodies are no longer available for this request.',
  unsupported: 'Body preview is not supported for this response.',
});

const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Errors from the service carry a code the page acts on; host failures such
// as a stopped service carry the SDK's own code.
const call = async (method, path, { query, body } = {}) => {
  const result = await host.serviceRequest({
    method,
    path,
    ...(query ? { query } : {}),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let value = null;
  try {
    value = JSON.parse(result.body);
  } catch {}
  if (result.status === 200) return value;
  throw Object.assign(new Error(value?.error ?? `The browser service answered ${result.status}`), { code: value?.code ?? 'SERVICE_ERROR' });
};

const lastSegment = (url) => {
  try {
    const { pathname, host: urlHost } = new URL(url);
    return pathname.split('/').filter(Boolean).at(-1) ?? urlHost;
  } catch {
    return url;
  }
};

const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatTime = (timestamp) => new Date(timestamp).toLocaleTimeString([], { hour12: false });

// Header.
const header = element('header', 'header');
const titleRow = element('div', 'title-row');
const status = element('p', 'status', 'Starting capture');
status.setAttribute('role', 'status');
status.setAttribute('aria-live', 'polite');
titleRow.append(element('h1', '', 'Browser inspector'), status);
const toolbar = element('div', 'toolbar');
const tabsHost = element('div');
const filterHost = element('div', 'filter');
const clearHost = element('div');
const dropped = element('span', 'dropped');
toolbar.append(tabsHost, filterHost, clearHost, dropped);
const hint = element('p', 'hint', 'Capture starts when you open the inspector. Closing it clears captured data.');
header.append(titleRow, toolbar, hint);
const bannerHost = element('div', 'banner');

// Views.
const body = element('main', 'body');
const emptyHost = element('div', 'empty');
emptyHost.hidden = true;
mountEmpty(emptyHost, {
  title: 'Open a page in Server Browser to inspect it',
  body: 'The inspector follows the tab visible in Server Browser and checks again every two seconds.',
});

const consoleView = element('section', 'view console-view');
consoleView.setAttribute('aria-label', 'Console');
const consoleList = element('div', 'console-list');
consoleList.setAttribute('role', 'log');
consoleList.setAttribute('aria-label', 'Console messages');
const repl = element('form', 'repl');
const expressionInput = element('textarea', 'mono');
expressionInput.rows = 2;
expressionInput.placeholder = 'Run JavaScript in the page';
expressionInput.spellcheck = false;
expressionInput.setAttribute('aria-label', 'JavaScript to run in the page');
const replError = element('p', 'repl-error');
replError.setAttribute('role', 'alert');
const replActions = element('div', 'repl-actions');
const previousHost = element('div');
const nextHost = element('div');
const runHost = element('div');
replActions.append(previousHost, nextHost, runHost, element('p', 'hint', 'Ctrl/Cmd+Enter to run. Enter adds a new line.'));
repl.append(expressionInput, replError, replActions);
consoleView.append(consoleList, repl);

const networkView = element('section', 'view network-view');
networkView.setAttribute('aria-label', 'Network');
networkView.hidden = true;
const networkLayout = element('div', 'network-layout');
const networkList = element('div', 'network-list');
networkList.tabIndex = 0;
networkList.setAttribute('role', 'listbox');
networkList.setAttribute('aria-label', 'Captured requests');
const networkHead = element('div', 'network-head');
networkHead.setAttribute('aria-hidden', 'true');
for (const label of ['Method', 'Status', 'URL', 'Type', 'Size', 'Time']) networkHead.append(element('span', '', label));
networkList.append(networkHead);
const details = element('aside', 'details');
details.hidden = true;
details.setAttribute('aria-label', 'Request details');
networkLayout.append(networkList, details);
networkView.append(networkLayout);

body.append(emptyHost, consoleView, networkView);
root.append(header, bannerHost, body);

// State.
let captureId = null;
let cursor = 0;
let view = 'console';
let filter = '';
let polling = false;
let starting = false;
let timer = null;
let tabLabel = '';
let noticeUntil = 0;
let droppedConsole = 0;
let droppedNetwork = 0;
let consoleCount = 0;
let running = false;
let selectedRequest = null;
let detailsToken = 0;
const networkRows = new Map();
const history = [];
let historyIndex = 0;

const tabs = mountTabs(tabsHost, {
  items: [{ id: 'console', label: 'Console', count: 0 }, { id: 'network', label: 'Network', count: 0 }],
  activeId: view,
  onChange: (next) => {
    view = next;
    consoleView.hidden = view !== 'console';
    networkView.hidden = view !== 'network';
    tabs.update({ activeId: view });
    renderCounts();
  },
});

const filterField = mountSearchField(filterHost, {
  value: '',
  placeholder: 'Filter messages or requests',
  label: 'Filter inspector entries',
  onChange: (value) => {
    filter = value.trim().toLowerCase();
    filterField.update({ value });
    for (const row of consoleList.children) row.hidden = !matches(row);
    for (const entry of networkRows.values()) entry.element.hidden = !matches(entry.element);
  },
});

const matches = (node) => !filter || node.dataset.search.includes(filter);

const renderCounts = () => {
  tabs.update({ items: [
    { id: 'console', label: 'Console', count: consoleCount },
    { id: 'network', label: 'Network', count: networkRows.size },
  ] });
  const omitted = view === 'console' ? droppedConsole : droppedNetwork;
  dropped.textContent = omitted > 0 ? `Entries omitted: ${omitted}` : '';
};

const setStatus = (text) => {
  if (Date.now() < noticeUntil) return;
  status.textContent = text;
};

let banner = null;
const showBanner = (props) => {
  banner?.dispose();
  banner = props ? mountBanner(bannerHost, props) : null;
};

const showEmpty = (empty) => {
  emptyHost.hidden = !empty;
  consoleView.hidden = empty || view !== 'console';
  networkView.hidden = empty || view !== 'network';
};

// Console.
const appendConsole = (row) => {
  const pinned = consoleList.scrollHeight - consoleList.scrollTop - consoleList.clientHeight < 24;
  const item = element('div', 'console-row');
  const kind = row.kind ?? 'message';
  item.dataset.kind = kind;
  item.dataset.level = row.isError ? 'error' : row.level ?? 'log';
  const label = kind === 'command' ? '›' : kind === 'result' ? '‹' : LEVELS[row.level] ?? 'Log';
  const level = element('span', 'level', label);
  if (kind !== 'message') level.setAttribute('aria-label', kind === 'command' ? 'Command' : row.isError ? 'Error result' : 'Result');
  const text = element('pre', 'text mono', row.text);
  const meta = element('span', 'meta');
  if (row.truncated) meta.append(element('span', 'tag', 'Truncated'));
  if (row.source) {
    const source = element('span', '', `${lastSegment(row.source)}${Number.isInteger(row.line) ? `:${row.line + 1}` : ''}`);
    source.title = row.source;
    meta.append(source);
  }
  if (row.timestamp) meta.append(element('span', '', formatTime(row.timestamp)));
  item.append(level, text, meta);
  item.dataset.search = `${row.text}\n${row.source ?? ''}`.toLowerCase();
  item.hidden = !matches(item);
  consoleList.append(item);
  while (consoleList.childElementCount > MAX_CONSOLE_ROWS) consoleList.firstElementChild.remove();
  if (pinned) consoleList.scrollTop = consoleList.scrollHeight;
};

const clearConsole = () => {
  consoleList.replaceChildren();
  consoleCount = 0;
};

// Network.
const statusLabel = (row) => {
  if (row.state === 'pending') return 'Pending';
  if (row.state === 'failed') return 'Failed';
  return row.status === null ? '' : String(row.status);
};

const renderNetworkRow = (entry) => {
  const { row } = entry;
  const cells = [
    element('span', 'mono', row.method),
    element('span', 'status', statusLabel(row)),
    element('span', 'mono', row.url),
    element('span', '', row.fromCache ? `${row.resourceType} (cache)` : row.resourceType),
    element('span', 'numeric', formatBytes(row.encodedBytes)),
    element('span', 'numeric', Number.isFinite(row.durationMs) ? `${Math.round(row.durationMs)} ms` : ''),
  ];
  cells[1].title = row.failureText ?? row.statusText ?? '';
  cells[2].title = row.url;
  entry.element.replaceChildren(...cells);
  entry.element.dataset.state = row.state;
  entry.element.dataset.search = `${row.method} ${statusLabel(row)} ${row.url}`.toLowerCase();
  entry.element.setAttribute('aria-label', `${row.method} ${row.url} ${statusLabel(row)}`);
  entry.element.hidden = !matches(entry.element);
};

const upsertNetwork = (row) => {
  let entry = networkRows.get(row.id);
  if (!entry) {
    const item = element('div', 'network-row');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', 'false');
    item.id = `request-${networkRows.size}-${Date.now()}`;
    item.addEventListener('click', () => selectRequest(row.id));
    entry = { row, element: item };
    networkRows.set(row.id, entry);
    networkList.append(item);
    while (networkRows.size > MAX_NETWORK_ROWS) {
      const [oldestId, oldest] = networkRows.entries().next().value;
      oldest.element.remove();
      networkRows.delete(oldestId);
      if (selectedRequest === oldestId) closeDetails();
    }
  }
  entry.row = row;
  renderNetworkRow(entry);
  if (selectedRequest === row.id) renderGeneral(row);
};

const clearNetwork = () => {
  for (const entry of networkRows.values()) entry.element.remove();
  networkRows.clear();
  closeDetails();
};

// Request details.
const generalSection = element('section');
const requestHeadersSection = element('section');
const responseHeadersSection = element('section');
const bodiesSection = element('section');
const detailsTitle = element('h2', 'mono');
const closeDetailsButton = element('button', 'icon-button', '✕');
closeDetailsButton.type = 'button';
closeDetailsButton.title = 'Close request details';
closeDetailsButton.setAttribute('aria-label', closeDetailsButton.title);
const detailsHead = element('div', 'details-head');
detailsHead.append(detailsTitle, closeDetailsButton);
details.append(detailsHead, generalSection, requestHeadersSection, responseHeadersSection, bodiesSection);

const pairs = (entries) => {
  const list = element('dl', 'pairs');
  for (const [name, value] of entries) list.append(element('dt', '', name), element('dd', '', value));
  return list;
};

const renderGeneral = (row) => {
  detailsTitle.textContent = row.url;
  generalSection.replaceChildren(element('h3', '', 'General'), pairs([
    ['Method', row.method],
    ['URL', row.url],
    ['Status', row.status === null ? statusLabel(row) : `${row.status} ${row.statusText}`.trim()],
    ['Type', row.resourceType || 'Unavailable'],
    ['Content type', row.mimeType || 'Unavailable'],
    ['State', row.state === 'complete' ? 'Complete' : row.state === 'failed' ? 'Failed' : 'Pending'],
    ['Duration', Number.isFinite(row.durationMs) ? `${Math.round(row.durationMs)} ms` : 'Unavailable'],
    ['Transferred', formatBytes(row.encodedBytes) || 'Unavailable'],
    ['From cache', row.fromCache ? 'Yes' : 'No'],
    ...(row.failureText ? [['Failure', row.failureText]] : []),
  ]));
};

const headerSection = (section, title, headers) => {
  section.replaceChildren(element('h3', '', title), headers.length
    ? pairs(headers.map(({ name, value }) => [name, value]))
    : element('p', 'note', 'No headers available.'));
};

const renderBodies = (result, loading = false) => {
  const load = element('div');
  bodiesSection.replaceChildren(element('h3', '', 'Bodies'), load);
  mountButton(load, {
    label: 'Load bodies',
    size: 'sm',
    variant: 'outline',
    loading,
    disabled: loading || result?.bodyState === 'available',
    onClick: () => loadDetails(selectedRequest, true),
  });
  if (!result) return;
  if (result.bodyState !== 'available') {
    bodiesSection.append(element('p', 'note', BODY_STATES[result.bodyState] ?? ''));
    return;
  }
  for (const [label, text] of [['Request body', result.requestBody], ['Response body', result.responseBody]]) {
    bodiesSection.append(element('h3', '', label));
    bodiesSection.append(text === null ? element('p', 'note', 'No body available.') : element('pre', 'body-text mono', text));
  }
  if (result.truncated) bodiesSection.append(element('p', 'note', 'Preview truncated.'));
};

const loadDetails = async (entryId, includeBody) => {
  const token = ++detailsToken;
  if (includeBody) renderBodies(null, true);
  try {
    const result = await call('POST', '/inspector/request', { body: { captureId, entryId, includeBody } });
    if (token !== detailsToken || selectedRequest !== entryId) return;
    headerSection(requestHeadersSection, 'Request headers', result.requestHeaders);
    headerSection(responseHeadersSection, 'Response headers', result.responseHeaders);
    renderBodies(result);
  } catch (error) {
    if (token !== detailsToken || selectedRequest !== entryId) return;
    renderBodies(null);
    bodiesSection.append(element('p', 'note', REQUEST_ERRORS[error.code] ?? error.message));
  }
};

const selectRequest = (entryId) => {
  const entry = networkRows.get(entryId);
  if (!entry) return;
  if (selectedRequest) networkRows.get(selectedRequest)?.element.setAttribute('aria-selected', 'false');
  selectedRequest = entryId;
  entry.element.setAttribute('aria-selected', 'true');
  entry.element.scrollIntoView({ block: 'nearest' });
  networkList.setAttribute('aria-activedescendant', entry.element.id);
  details.hidden = false;
  networkLayout.classList.add('with-details');
  renderGeneral(entry.row);
  requestHeadersSection.replaceChildren();
  responseHeadersSection.replaceChildren();
  renderBodies(null);
  void loadDetails(entryId, false);
};

function closeDetails() {
  if (selectedRequest) networkRows.get(selectedRequest)?.element.setAttribute('aria-selected', 'false');
  selectedRequest = null;
  detailsToken += 1;
  details.hidden = true;
  networkLayout.classList.remove('with-details');
  networkList.removeAttribute('aria-activedescendant');
}

closeDetailsButton.addEventListener('click', () => {
  closeDetails();
  networkList.focus();
});

networkList.addEventListener('keydown', (event) => {
  const visible = [...networkRows.keys()].filter((id) => !networkRows.get(id).element.hidden);
  if (event.key === 'Escape') {
    closeDetails();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return;
  event.preventDefault();
  if (!visible.length) return;
  const index = visible.indexOf(selectedRequest);
  if (event.key === 'Enter') {
    selectRequest(visible[Math.max(0, index)]);
    return;
  }
  const next = event.key === 'ArrowDown' ? Math.min(visible.length - 1, index + 1) : Math.max(0, index - 1);
  selectRequest(visible[index === -1 ? 0 : next]);
});

// Capture.
const resetRows = () => {
  clearConsole();
  clearNetwork();
  droppedConsole = 0;
  droppedNetwork = 0;
  cursor = 0;
  renderCounts();
};

const schedule = (delay) => {
  clearTimeout(timer);
  timer = setTimeout(() => { void tick(); }, delay);
};

const startCapture = async () => {
  if (starting) return;
  starting = true;
  captureId = null;
  resetRows();
  try {
    const started = await call('POST', '/inspector/start', { body: {} });
    captureId = started.captureId;
    showEmpty(false);
    showBanner(null);
    schedule(0);
  } catch (error) {
    if (error.code === 'UNAVAILABLE') {
      showEmpty(true);
      setStatus('No browser page is visible');
      schedule(RETRY_MS);
    } else if (error.code === 'CAPTURE_FAILED') {
      setStatus(error.message);
      showBanner({ tone: 'error', title: 'Could not start capture', body: error.message, action: { label: 'Try again', onClick: () => { void startCapture(); } } });
    } else {
      setStatus(error.message);
      schedule(RETRY_MS);
    }
  } finally {
    starting = false;
  }
};

async function tick() {
  if (document.visibilityState !== 'visible' || polling || starting) return;
  if (!captureId) {
    await startCapture();
    return;
  }
  polling = true;
  let next = POLL_MS;
  try {
    const batch = await call('GET', '/inspector/events', { query: { captureId, after: String(cursor) } });
    cursor = batch.cursor;
    droppedConsole = batch.droppedConsole;
    droppedNetwork = batch.droppedNetwork;
    for (const row of batch.console) appendConsole(row);
    consoleCount += batch.console.length;
    for (const row of batch.network) upsertNetwork(row);
    renderCounts();
    tabLabel = batch.tab?.title || batch.tab?.url || 'the visible tab';
    setStatus(`Capturing ${tabLabel}`);
    if (batch.more) next = 0;
  } catch (error) {
    if (error.code === 'CAPTURE_GONE') {
      captureId = null;
      status.textContent = 'Capturing a new tab';
      noticeUntil = Date.now() + 2_000;
      next = 0;
    } else if (error.code === 'UNAVAILABLE') {
      captureId = null;
      showEmpty(true);
      setStatus('No browser page is visible');
      next = RETRY_MS;
    } else {
      setStatus(error.message);
      next = RETRY_MS;
    }
  } finally {
    polling = false;
  }
  schedule(next);
}

// Clear and JavaScript.
mountButton(clearHost, {
  label: 'Clear',
  size: 'sm',
  variant: 'ghost',
  onClick: () => {
    const scope = view;
    if (scope === 'console') clearConsole();
    else clearNetwork();
    if (scope === 'console') droppedConsole = 0;
    else droppedNetwork = 0;
    renderCounts();
    if (captureId) void call('POST', '/inspector/clear', { body: { captureId, scope } }).catch(() => {});
  },
});

const recall = (step) => {
  if (!history.length) return;
  historyIndex = Math.min(history.length, Math.max(0, historyIndex + step));
  expressionInput.value = history[historyIndex] ?? '';
  expressionInput.focus();
};
mountButton(previousHost, { label: 'Previous command', size: 'sm', variant: 'ghost', onClick: () => recall(-1) });
mountButton(nextHost, { label: 'Next command', size: 'sm', variant: 'ghost', onClick: () => recall(1) });

const runButton = mountButton(runHost, { label: 'Run', size: 'sm', onClick: () => { void run(); } });

async function run() {
  const expression = expressionInput.value;
  replError.textContent = '';
  if (running || !expression.trim()) return;
  if (expression.length > MAX_EXPRESSION_CHARS) {
    replError.textContent = 'Enter JavaScript with at most 16,000 characters.';
    return;
  }
  if (!captureId) {
    replError.textContent = 'The inspector is not capturing a page yet.';
    return;
  }
  running = true;
  runButton.update({ label: 'Running', loading: true });
  history.push(expression);
  historyIndex = history.length;
  appendConsole({ kind: 'command', text: expression });
  try {
    const result = await call('POST', '/inspector/evaluate', { body: { captureId, expression } });
    appendConsole({ kind: 'result', text: result.text, isError: result.isError, truncated: result.truncated });
    expressionInput.value = '';
  } catch (error) {
    appendConsole({ kind: 'result', isError: true, text: EVALUATION_ERRORS[error.code] ?? error.message });
  } finally {
    running = false;
    runButton.update({ label: 'Run', loading: false });
  }
}

expressionInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    void run();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') schedule(0);
});

window.addEventListener('pagehide', () => {
  if (captureId) void call('POST', '/inspector/stop', { body: { captureId } }).catch(() => {});
});

let mounted = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (mounted) return;
  mounted = true;
  renderCounts();
  schedule(0);
});
