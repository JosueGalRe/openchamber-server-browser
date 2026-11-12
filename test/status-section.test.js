import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { guestStatusViewSchema } from '@openchamber/sdk/schemas';
import { createMemoryReader, createStatusSection, statusView } from '../src/status-section.js';

const MIB = 1024 * 1024;

const scope = (sessionId, overrides = {}) => ({
  id: JSON.stringify(['/repo', sessionId]),
  directory: '/repo',
  sessionId,
  selected: false,
  url: 'https://example.com/',
  title: 'Example Domain',
  tabs: [{ id: 't1' }],
  problems: { errors: 0, warnings: 0 },
  agentActive: false,
  chromePid: null,
  ...overrides,
});

const assertValid = (view) => {
  const parsed = guestStatusViewSchema.safeParse(JSON.parse(JSON.stringify(view)));
  assert.equal(parsed.success, true, parsed.error?.message);
};

const spawnWith = (outputs) => (command, args) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.kill = () => {};
  queueMicrotask(() => {
    const output = outputs[`${command} ${args.join(' ')}`];
    if (output === undefined) child.emit('error', new Error('not found'));
    else {
      child.stdout.emit('data', output);
      child.emit('close', 0);
    }
  });
  return child;
};

// Chrome 10 runs a GPU process 11 and a zygote 12 with renderer 13; Chrome 20
// runs 21; 30 is someone else's process.
const TOP = [
  'Processes: 1135 total, 6 running, 1129 sleeping, 6154 threads ',
  'PhysMem: 47G used (6916M wired, 11G compressor), 420M unused.',
  'Disks: 18438197/488G read, 18531459/351G written.',
  '',
  'PID    PPID  MEM  ',
  '1      0     26M  ',
  '10     1     100M ',
  '11     10    50M+ ',
  '12     10    10240K',
  '13     12    1.5G-',
  '20     1     20M  ',
  '21     20    10M  ',
  '30     1     999M ',
].join('\n');

const PS = ['    1     0', '   10     1', '   11    10', '   12    10', '   13    12', '   20     1', '   21    20', '   30     1'].join('\n');

const procFiles = (pss, denied = new Set()) => ({
  async readFile(path) {
    const pid = Number(/^\/proc\/(\d+)\/smaps_rollup$/.exec(path)?.[1]);
    if (denied.has(pid)) throw Object.assign(new Error('denied'), { code: 'EACCES' });
    if (pss[pid] === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return `00400000-7fffffffffff ---p 00000000 00:00 0 [rollup]\nRss: ${pss[pid] * 3} kB\nPss: ${pss[pid]} kB\nPss_Anon: 1 kB\n`;
  },
});

test('counts each Chrome with everything under it as the system does, not by resident size', async () => {
  const mac = createMemoryReader({ platform: 'darwin', spawn: spawnWith({ 'top -l 1 -stats pid,ppid,mem': TOP }) });
  assert.deepEqual([...await mac([10, 20, 40])], [[10, 1696 * MIB], [20, 30 * MIB]]);

  // Linux: 11 exited between ps and /proc, which counts nothing.
  const linuxPs = spawnWith({ 'ps -A -o pid=,ppid=': PS });
  const linux = createMemoryReader({ platform: 'linux', spawn: linuxPs, files: procFiles({ 10: 102_400, 12: 10_240, 13: 204_800, 20: 20_480, 21: 10_240 }) });
  assert.deepEqual([...await linux([10, 20])], [[10, 310 * MIB], [20, 30 * MIB]]);

  // Windows: one Win32_Process query through PowerShell gives parents and private bytes.
  const WIN32 = ['0 0 0', '1 0 26214400', '10 1 104857600', '11 10 52428800', '12 10 10485760', '13 12 1610612736', '20 1 20971520', '21 20 10485760', '30 1 1047527424', ''].join('\r\n');
  const windowsSpawn = (command, args) => spawnWith({ [`${command} ${args.join(' ')}`]: WIN32 })(command, args);
  const windows = createMemoryReader({ platform: 'win32', spawn: (command, args) => {
    assert.equal(command, 'powershell');
    assert.match(args.at(-1), /Win32_Process/);
    return windowsSpawn(command, args);
  } });
  assert.deepEqual([...await windows([10, 20, 40])], [[10, 1696 * MIB], [20, 30 * MIB]]);

  // A process we may not read, or a Chrome without the file, leaves the figure out.
  assert.equal(await createMemoryReader({ platform: 'linux', spawn: linuxPs, files: procFiles({ 10: 1, 13: 1 }, new Set([13])) })([10]), null);
  assert.equal(await createMemoryReader({ platform: 'linux', spawn: linuxPs, files: procFiles({ 11: 1 }) })([10]), null);
  assert.equal(await createMemoryReader({ platform: 'win32', spawn: spawnWith({}) })([10]), null);
  assert.equal(await createMemoryReader({ platform: 'darwin', spawn: spawnWith({}) })([10]), null);
});

test('shows the project\'s browsers with their state, problems, and a Close button', () => {
  const state = {
    controller: 'user',
    scopes: [
      scope('ses_agent', { title: 'Dashboard', agentActive: true, problems: { errors: 2, warnings: 1 }, chromePid: 10, tabs: [{}, {}, {}] }),
      scope('ses_viewer', { selected: true, url: 'http://localhost:5173/login', title: '', problems: { errors: 0, warnings: 3 }, chromePid: 20 }),
      scope('ses_other', { directory: '/elsewhere', id: JSON.stringify(['/elsewhere', 'ses_other']), chromePid: 30 }),
    ],
  };
  const memory = new Map([[10, 600 * MIB], [20, 300 * MIB], [30, 1200 * MIB]]);

  const view = statusView(state, { directory: '/repo', memory, history: [1500 * MIB, 2100 * MIB] });

  assertValid(view);
  const [chrome, agent, viewer, ...rest] = view.rows;
  assert.equal(rest.length, 0, 'another project\'s browser is not listed');
  assert.deepEqual(chrome.content, { kind: 'chart', values: [1500 * MIB, 2100 * MIB], unit: 'bytes', step: 30 });
  assert.equal(chrome.value, '2.1 GB', 'every project\'s Chrome counts');
  assert.match(chrome.tooltip, /3 browsers, across all projects/);
  assert.equal(agent.label, 'Dashboard');
  assert.equal(agent.dot, 'warning');
  assert.deepEqual(agent.badge, { label: '✕ 2', tone: 'error' });
  assert.equal(agent.value, '600 MB');
  assert.match(agent.tooltip, /^Agent working · https:\/\/example\.com\/ · 3 tabs · chat ses_agent$/);
  assert.equal(viewer.label, 'localhost:5173');
  assert.equal(viewer.dot, 'accent');
  assert.deepEqual(viewer.badge, { label: '⚠ 3', tone: 'warning' });
  assert.match(viewer.tooltip, /^You have control/);
  assert.match(agent.actions[0].id, /^close-[0-9a-f]{16}$/);
  assert.notEqual(agent.actions[0].id, viewer.actions[0].id);
});

test('keeps one browser\'s memory on the Chrome line and says when the project has none', () => {
  const lone = statusView({ controller: 'none', scopes: [scope('ses_1', { chromePid: 10 })] }, { directory: '/repo', memory: new Map([[10, 400 * MIB]]) });
  assertValid(lone);
  assert.equal(lone.rows[0].value, '400 MB');
  assert.equal(lone.rows[1].value, undefined);
  assert.equal(lone.rows[1].dot, 'success');

  const elsewhere = statusView({ controller: 'none', scopes: [scope('ses_1')] }, { directory: '/other' });
  assertValid(elsewhere);
  assert.deepEqual(elsewhere.rows, [{ kind: 'note', id: 'none', tone: 'muted', text: 'No browser in this project. The agent opens one with openchamber_web.' }]);

  const long = statusView({ controller: 'none', scopes: [scope('ses_1', { title: 'T'.repeat(300), url: `https://example.com/${'p'.repeat(300)}` })] });
  assertValid(long);
});

test('samples memory every 30 seconds and when a browser opens, shared by every reader', async () => {
  let clock = 0;
  const reads = [];
  let scopes = [scope('ses_1', { chromePid: 10 })];
  const section = createStatusSection({
    runtime: { state: () => ({ controller: 'none', scopes }) },
    now: () => clock,
    readMemory: async (pids) => {
      reads.push(pids);
      return new Map(pids.map((pid) => [pid, reads.length * MIB]));
    },
  });
  const chart = async () => (await section.view('/repo')).rows[0].content.values;

  const together = await Promise.all([chart(), chart()]);
  assert.deepEqual(together, [[MIB], [MIB]], 'two windows reading at once share one sample');
  clock = 20_000;
  assert.deepEqual(await chart(), [MIB]);
  clock = 30_000;
  assert.deepEqual(await chart(), [MIB, 2 * MIB]);
  clock = 35_000;
  scopes = [...scopes, scope('ses_2', { chromePid: 20 })];
  assert.deepEqual(await chart(), [MIB, 2 * MIB, 6 * MIB], 'a new browser is measured at once');
  clock = 200_000;
  assert.deepEqual(await chart(), [8 * MIB], 'points from before a gap are dropped');
  assert.deepEqual(reads, [[10], [10], [10, 20], [10, 20]]);
});

test('leaves the memory line out without a figure, and measures nothing without a Chrome', async () => {
  let reads = 0;
  const unavailable = createStatusSection({
    runtime: { state: () => ({ controller: 'none', scopes: [scope('ses_1', { chromePid: 10 })] }) },
    readMemory: async () => { reads += 1; return null; },
  });
  const empty = createStatusSection({
    runtime: { state: () => ({ controller: 'none', scopes: [] }) },
    readMemory: async () => { reads += 1; return new Map(); },
  });

  assert.deepEqual((await unavailable.view('/repo')).rows.map((row) => row.id.split('-')[0]), ['browser']);
  assert.deepEqual((await empty.view(null)).rows.map((row) => row.id), ['none']);
  assert.equal(reads, 1);
});

test('closes the browser a Close button names, and refuses one that is gone', async () => {
  const closed = [];
  const scopes = [scope('ses_1'), scope('ses_2')];
  const section = createStatusSection({
    runtime: { state: () => ({ controller: 'none', scopes }), closeScope: async (id) => { closed.push(id); } },
    readMemory: async () => null,
  });
  const view = await section.view('/repo');

  await section.act(view.rows[1].actions[0].id);

  assert.deepEqual(closed, [scopes[1].id]);
  await assert.rejects(section.act('close-0000000000000000'), /already closed/);
});
