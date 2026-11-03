// The chat's Work Status section. Hosts from OpenChamber 2.5.2 poll
// `GET /status` and draw these rows themselves; a button posts `{ id }` back.
import { spawn as spawnProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { runCommand } from './dev-servers.js';

// Memory is sampled every 30 seconds, since `top` costs about half a second of
// CPU, and at once when a browser opens or closes. The chart keeps half an hour.
const STEP_SECONDS = 30;
const CHART_POINTS = 60;
// After a longer gap, such as a hidden section, the chart starts over.
const CHART_GAP_MS = 3 * STEP_SECONDS * 1_000;
const LABEL_MAX = 60;
const TEXT_MAX = 200;

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// Row and control ids must match /^[a-z][a-z0-9-]{0,39}$/, and scope ids are JSON.
const scopeKey = (id) => crypto.createHash('sha256').update(id).digest('hex').slice(0, 16);

const formatBytes = (bytes) => (bytes >= 1024 ** 3
  ? `${(bytes / 1024 ** 3).toFixed(1)} GB`
  : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`);

const pageHost = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

const subtree = (processes, root) => {
  const children = new Map();
  for (const [pid, { parent }] of processes) {
    const siblings = children.get(parent);
    if (siblings) siblings.push(pid);
    else children.set(parent, [pid]);
  }
  const seen = new Set();
  const pending = [root];
  while (pending.length > 0) {
    const pid = pending.pop();
    if (seen.has(pid) || !processes.has(pid)) continue;
    seen.add(pid);
    pending.push(...(children.get(pid) ?? []));
  }
  return [...seen];
};

// pid → { parent, bytes } gives each Chrome's bytes with everything under it.
// A Chrome missing from the table is left out.
export const treeBytes = (processes, roots) => new Map(roots
  .filter((root) => processes.has(root))
  .map((root) => [root, subtree(processes, root).reduce((sum, pid) => sum + processes.get(pid).bytes, 0)]));

const UNITS = { B: 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

// `top -l 1 -stats pid,ppid,mem` on macOS. MEM is the physical footprint
// Activity Monitor shows.
export const parseTop = (output) => {
  const processes = new Map();
  for (const line of String(output ?? '').split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+(?:\.\d+)?)([BKMGT])[+-]?\s*$/.exec(line);
    if (match) processes.set(Number(match[1]), { parent: Number(match[2]), bytes: Math.round(Number(match[3]) * UNITS[match[4]]) });
  }
  return processes;
};

// `ps -A -o pid=,ppid=`, whose sizes come from /proc afterwards.
export const parsePs = (output) => {
  const processes = new Map();
  for (const line of String(output ?? '').split('\n')) {
    const [pid, parent] = line.trim().split(/\s+/).map(Number);
    if (Number.isInteger(pid) && Number.isInteger(parent)) processes.set(pid, { parent, bytes: 0 });
  }
  return processes;
};

// Resident sizes would count the Chromium code every helper process shares
// once per process, about three times the real figure. macOS gets the
// footprint from `top`, Linux the proportional size from /proc, and other
// systems no figure.
export const createMemoryReader = ({ platform = process.platform, spawn = spawnProcess, files = fs } = {}) => async (roots) => {
  if (platform === 'darwin') {
    const output = await runCommand(spawn, 'top', ['-l', '1', '-stats', 'pid,ppid,mem']);
    return output === null ? null : treeBytes(parseTop(output), roots);
  }
  if (platform !== 'linux') return null;
  const output = await runCommand(spawn, 'ps', ['-A', '-o', 'pid=,ppid=']);
  if (output === null) return null;
  const processes = parsePs(output);
  for (const pid of roots.flatMap((root) => subtree(processes, root))) {
    // A helper that just exited counts nothing. A Chrome without the file
    // (a kernel before 4.14) or one we may not read leaves the figure out.
    const rollup = await files.readFile(`/proc/${pid}/smaps_rollup`, 'utf8').catch((error) => (error?.code === 'ENOENT' ? '' : null));
    if (rollup === null || (rollup === '' && roots.includes(pid))) return null;
    processes.get(pid).bytes = Number(/^Pss:\s+(\d+) kB$/m.exec(rollup)?.[1] ?? 0) * 1024;
  }
  return treeBytes(processes, roots);
};

// The host sends the project directory but not the chat, so the rows are the
// project's browsers. Memory is per browser only when there is more than one.
export const statusView = (state, { directory = null, memory = null, history = [] } = {}) => {
  const rows = [];
  const scopes = state.scopes;
  const bytesOf = (scope) => memory?.get(scope.chromePid);
  if (memory) {
    const total = scopes.reduce((sum, scope) => sum + (bytesOf(scope) ?? 0), 0);
    rows.push({
      kind: 'line',
      id: 'chrome',
      label: 'Chrome',
      content: { kind: 'chart', values: history, unit: 'bytes', step: STEP_SECONDS },
      value: formatBytes(total),
      tooltip: `Memory of the server's Chrome for ${scopes.length === 1 ? 'one browser' : `${scopes.length} browsers`}, across all projects`,
    });
  }
  const own = directory ? scopes.filter((scope) => scope.directory === directory) : scopes;
  for (const scope of own) {
    const key = scopeKey(scope.id);
    const inControl = state.controller === 'user' && scope.selected;
    const activity = scope.agentActive ? 'Agent working' : inControl ? 'You have control' : 'Idle';
    const { errors = 0, warnings = 0 } = scope.problems ?? {};
    const tabs = scope.tabs?.length ?? 0;
    const bytes = scopes.length > 1 ? bytesOf(scope) : undefined;
    rows.push({
      kind: 'line',
      id: `browser-${key}`,
      label: clip(scope.title || pageHost(scope.url) || 'New tab', LABEL_MAX),
      dot: scope.agentActive ? 'warning' : inControl ? 'accent' : 'success',
      value: bytes === undefined ? undefined : formatBytes(bytes),
      valueTone: bytes === undefined ? undefined : 'muted',
      badge: errors > 0 ? { label: `✕ ${errors}`, tone: 'error' } : warnings > 0 ? { label: `⚠ ${warnings}`, tone: 'warning' } : undefined,
      tooltip: clip([
        activity,
        scope.url === 'about:blank' ? null : scope.url,
        `${tabs} ${tabs === 1 ? 'tab' : 'tabs'}`,
        `chat ${scope.sessionId}`,
      ].filter(Boolean).join(' · '), TEXT_MAX),
      actions: [{
        kind: 'button',
        id: `close-${key}`,
        label: 'Close',
        variant: 'outline',
        // The host shows this in the button itself.
        confirm: 'Close it?',
      }],
    });
  }
  if (own.length === 0) {
    rows.push({
      kind: 'note',
      id: 'none',
      tone: 'muted',
      text: `No browser ${directory ? 'in this project' : 'yet'}. The agent opens one with openchamber_web.`,
    });
  }
  return { rows };
};

export const createStatusSection = ({ runtime, readMemory = createMemoryReader(), now = Date.now }) => {
  let memory = null;
  let history = [];
  let sampledAt = -Infinity;
  let sampledPids = '';
  let sampling = null;

  // Reads never touch a scope, so the section does not keep browsers alive.
  // Windows reading at the same time share one sample.
  const sample = (pids) => {
    const key = pids.join(' ');
    if (sampling) return sampling;
    if (now() - sampledAt < STEP_SECONDS * 1_000 && key === sampledPids) return Promise.resolve();
    sampling = (async () => {
      const at = now();
      const next = pids.length > 0 ? await readMemory(pids).catch(() => null) : null;
      if (!next || next.size === 0) {
        memory = null;
        history = [];
      } else {
        if (at - sampledAt > CHART_GAP_MS) history = [];
        memory = next;
        history = [...history, [...next.values()].reduce((sum, bytes) => sum + bytes, 0)].slice(-CHART_POINTS);
      }
      sampledAt = at;
      sampledPids = key;
    })().finally(() => { sampling = null; });
    return sampling;
  };

  return {
    async view(directory) {
      await sample(runtime.state().scopes.map((scope) => scope.chromePid).filter(Number.isInteger));
      return statusView(runtime.state(), { directory, memory, history });
    },
    async act(id) {
      const scope = runtime.state().scopes.find((candidate) => id === `close-${scopeKey(candidate.id)}`);
      if (!scope) throw new Error('This browser is already closed');
      await runtime.closeScope(scope.id);
    },
  };
};
