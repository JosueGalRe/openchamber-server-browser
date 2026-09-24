// Live development-server discovery for the egress proxy. Adapted from
// OpenChamber's dev-server scanner (MIT). The host knows its own and OpenCode's
// ports; this service does not, so it excludes by process instead and grants
// nothing when it cannot tell whose listener a port is.
import { spawn as spawnProcess } from 'node:child_process';
import fs from 'node:fs/promises';

const SCAN_TIMEOUT_MS = 2_500;
const CACHE_TTL_MS = 3_000;

// Listening, but never a page someone wants to open.
const IGNORED_PORTS = new Set([22, 53, 445, 631, 3306, 5432, 6379, 9229, 27017]);
const LOOPBACK_V4 = new Set(['127.0.0.1', 'localhost']);
const LOOPBACK_V6 = new Set(['[::1]', '::1']);
const WILDCARD = new Set(['*', '0.0.0.0', '[::]', '::']);

const toPort = (value) => {
  const port = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null;
};

// The loopback addresses a bind address answers on.
const loopbackHosts = (host) => {
  const value = String(host ?? '').trim().toLowerCase();
  if (WILDCARD.has(value)) return ['127.0.0.1', '::1'];
  if (LOOPBACK_V4.has(value)) return ['127.0.0.1'];
  if (LOOPBACK_V6.has(value)) return ['::1'];
  return [];
};

const splitHostPort = (value) => {
  const raw = String(value ?? '').trim();
  if (raw.startsWith('[')) {
    const close = raw.indexOf(']');
    return close === -1 || raw[close + 1] !== ':' ? null : { host: raw.slice(0, close + 1), port: raw.slice(close + 2) };
  }
  const separator = raw.lastIndexOf(':');
  return separator === -1 ? null : { host: raw.slice(0, separator), port: raw.slice(separator + 1) };
};

// `lsof -iTCP -sTCP:LISTEN -P -n -F pcn`: `p` opens a process record, and
// its `n` lines follow until the next `p`.
export const parseLsofListeners = (output) => {
  const listeners = [];
  let pid = null;
  for (const line of String(output ?? '').split('\n')) {
    if (line[0] === 'p') {
      const parsed = Number.parseInt(line.slice(1), 10);
      pid = Number.isInteger(parsed) ? parsed : null;
    } else if (line[0] === 'n' && !line.includes('->')) {
      const parsed = splitHostPort(line.slice(1));
      const port = toPort(parsed?.port);
      if (port !== null) listeners.push({ port, pid, hosts: loopbackHosts(parsed.host), inode: null });
    }
  }
  return listeners;
};

const PROC_LISTEN = '0A';
const PROC_V4 = { '00000000': ['127.0.0.1', '::1'], '0100007F': ['127.0.0.1'] };
const PROC_V6 = { '00000000000000000000000000000000': ['127.0.0.1', '::1'], '00000000000000000000000001000000': ['::1'] };

// `/proc/net/tcp` and `tcp6`: no pid, but the socket inode ties a listener to
// the process whose `/proc/<pid>/fd` holds it.
export const parseProcListeners = (output, family) => {
  const addresses = family === 6 ? PROC_V6 : PROC_V4;
  const listeners = [];
  for (const line of String(output ?? '').split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10 || parts[3] !== PROC_LISTEN) continue;
    const [address, portHex] = parts[1].split(':');
    const port = Number.parseInt(portHex, 16);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) continue;
    listeners.push({ port, pid: null, hosts: addresses[address?.toUpperCase()] ?? [], inode: parts[9] });
  }
  return listeners;
};

// Everything this service started, the host, and the host's other children
// (OpenCode, other extension services). Dev servers started from the host's
// terminal or by an agent are grandchildren of the host and stay eligible.
export const excludedProcesses = (parents, { selfPid, hostPid }) => {
  const excluded = new Set([selfPid, hostPid]);
  for (const [pid, parent] of parents) if (parent === hostPid) excluded.add(pid);
  const pending = [selfPid];
  while (pending.length) {
    const parent = pending.pop();
    for (const [pid, candidate] of parents) {
      if (candidate === parent && !excluded.has(pid)) {
        excluded.add(pid);
        pending.push(pid);
      }
    }
  }
  return excluded;
};

// Loopback grants for listeners nobody excluded. A port any excluded process
// listens on is never granted, on either address family.
export const devServerGrants = (listeners, isExcluded) => {
  const excludedPorts = new Set(listeners.filter(isExcluded).map((listener) => listener.port));
  const grants = new Map();
  for (const listener of listeners) {
    if (excludedPorts.has(listener.port) || IGNORED_PORTS.has(listener.port)) continue;
    for (const host of listener.hosts) grants.set(`${host} ${listener.port}`, { host, port: listener.port });
  }
  return [...grants.values()];
};

const runCommand = (spawn, command, args) => new Promise((resolve) => {
  let child;
  try {
    child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    resolve(null);
    return;
  }
  let stdout = '';
  let settled = false;
  const finish = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { child.kill(); } catch {}
    resolve(value);
  };
  const timer = setTimeout(() => finish(null), SCAN_TIMEOUT_MS);
  child.stdout?.on('data', (chunk) => { stdout += String(chunk); });
  child.on('error', () => finish(null));
  child.on('close', (code) => finish(code === 0 || stdout ? stdout : null));
});

export const createDevServerScanner = ({
  platform = process.platform,
  spawn = spawnProcess,
  files = fs,
  selfPid = process.pid,
  hostPid = process.ppid,
  now = Date.now,
} = {}) => {
  let cache = null;

  // pid → parent pid for every visible process, or null when unknown.
  const processParents = async () => {
    if (platform === 'linux') {
      const parents = new Map();
      for (const entry of await files.readdir('/proc')) {
        if (!/^\d+$/.test(entry)) continue;
        const stat = await files.readFile(`/proc/${entry}/stat`, 'utf8').catch(() => null);
        const fields = stat?.slice(stat.lastIndexOf(')') + 2).split(' ');
        const parent = Number.parseInt(fields?.[1] ?? '', 10);
        if (Number.isInteger(parent)) parents.set(Number(entry), parent);
      }
      return parents;
    }
    if (platform === 'darwin') {
      const output = await runCommand(spawn, 'ps', ['-A', '-o', 'pid=,ppid=']);
      if (output === null) return null;
      return new Map(output.trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number)).filter(([pid, parent]) => Number.isInteger(pid) && Number.isInteger(parent)));
    }
    return null;
  };

  const socketInodes = async (pids) => {
    const inodes = new Set();
    for (const pid of pids) {
      const entries = await files.readdir(`/proc/${pid}/fd`).catch((error) => (error?.code === 'ENOENT' ? [] : null));
      if (entries === null) return null;
      for (const entry of entries) {
        const target = await files.readlink(`/proc/${pid}/fd/${entry}`).catch(() => '');
        const match = /^socket:\[(\d+)\]$/.exec(target);
        if (match) inodes.add(match[1]);
      }
    }
    return inodes;
  };

  const discover = async () => {
    const parents = await processParents();
    if (!parents) return [];
    const excluded = excludedProcesses(parents, { selfPid, hostPid });
    const lsof = await runCommand(spawn, 'lsof', ['-iTCP', '-sTCP:LISTEN', '-P', '-n', '-F', 'pcn']);
    if (lsof !== null) {
      const listeners = parseLsofListeners(lsof);
      // Without a pid a listener's owner is unknown; treat it as excluded.
      return devServerGrants(listeners, (listener) => listener.pid === null || excluded.has(listener.pid));
    }
    if (platform !== 'linux') return [];
    const tables = await Promise.all([['/proc/net/tcp', 4], ['/proc/net/tcp6', 6]].map(async ([path, family]) => {
      const table = await files.readFile(path, 'utf8').catch(() => null);
      return table === null ? null : parseProcListeners(table, family);
    }));
    if (tables.every((table) => table === null)) return [];
    const inodes = await socketInodes(excluded);
    if (!inodes) return [];
    return devServerGrants(tables.flatMap((table) => table ?? []), (listener) => inodes.has(listener.inode));
  };

  return {
    // Grants for the loopback dev servers listening right now. A failed scan
    // grants nothing rather than something uncertain.
    async grants() {
      if (cache && now() - cache.at < CACHE_TTL_MS) return cache.grants;
      const grants = await discover().catch(() => []);
      cache = { at: now(), grants };
      return grants;
    },
  };
};
