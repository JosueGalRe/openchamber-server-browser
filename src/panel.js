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
reload.title = 'Reload';
reload.setAttribute('aria-label', 'Reload');
setIcon(reload, (svg) => {
  addPath(svg, 'M20 11a8 8 0 1 0-2.34 5.66');
  addPath(svg, 'M20 4v7h-7');
});

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

const scopeRow = document.createElement('div');
scopeRow.className = 'row scope-row';
scopeRow.append(scopeSelect, status);

const navigationRow = document.createElement('div');
navigationRow.className = 'row navigation-row';
navigationRow.append(back, forward, reload, address, selectCompatibility);
root.append(scopeRow, navigationRow);

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
    if (!state || requestPending || state.controller !== 'none') return;
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

const render = () => {
  const scopes = state?.scopes ?? [];
  const selected = scopes.find((scope) => scope.id === state?.selectedScopeId) ?? null;
  const idle = state?.controller === 'none';
  scopeSelect.disabled = requestPending || scopes.length < 2 || !idle;
  const items = scopes.map((scope) => ({ id: String(scope.id), label: scopeLabel(scope) }));
  const activeId = selected ? String(selected.id) : '';
  const signature = JSON.stringify([items, activeId]);
  if (signature !== tabsSignature) {
    const focusedId = pendingTabFocusId ?? document.activeElement?.dataset.id;
    tabs.update({ items, activeId });
    tabsSignature = signature;
    for (const button of scopeSelect.querySelectorAll('[role="tab"]')) {
      const scope = scopes.find((item) => String(item.id) === button.dataset.id);
      button.title = `${scope.directory} · ${scope.sessionId}`;
      if (button.dataset.id === focusedId) {
        button.focus();
        pendingTabFocusId = null;
      }
    }
  }
  if (!addressDirty) address.value = selected?.url === 'about:blank' ? '' : String(selected?.url ?? '');

  const disabled = requestPending || !selected || !idle;
  back.disabled = disabled;
  forward.disabled = disabled;
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

  let statusState = 'ready';
  let statusMessage = '';
  let statusTitle = 'Click or type in the page to take control. Enter an address and press Enter to navigate.';
  if (commandError || serviceError || selected?.nativeSelectCompatibilityError) {
    statusState = 'error';
    statusMessage = commandError ?? serviceError ?? selected.nativeSelectCompatibilityError;
    statusTitle = statusMessage;
  } else if (!selected) {
    statusState = 'waiting';
    statusMessage = 'Waiting for a scoped browser action';
    statusTitle = statusMessage;
  } else if (state.controller === 'user') {
    statusState = 'user';
    statusTitle = 'A viewer has control of the page. Release control to change sessions or use the browser toolbar. The SDK cannot identify which viewer is using this toolbar.';
  } else if (!idle) {
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

const refresh = async () => {
  if (refreshPending || requestPending) return;
  refreshPending = true;
  try {
    const result = await host.serviceRequest({ method: 'GET', path: '/browser/state' });
    if (result.status === 200) {
      state = parseState(result.body);
      serviceError = null;
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
  void request('/browser/reload', { generation: state.generation }).then((succeeded) => {
    if (!succeeded) return;
    addressDirty = false;
    render();
  });
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

let mounted = false;
host.onReady((context) => {
  applyHostReady(context, document.documentElement);
  if (mounted) return;
  mounted = true;
  render();
  void refresh();
  window.setInterval(() => { void refresh(); }, 1_000);
});
