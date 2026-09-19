import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { connectCdp } from './cdp-client.js';

const MINIMUM_CHROME_MAJOR_VERSION = 109;
const SYSTEM_NAMES = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];

const executable = (candidate) => {
  try {
    fs.accessSync(candidate, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const systemCandidates = () => {
  if (process.platform === 'darwin') {
    return ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  }
  if (process.platform === 'win32') {
    const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    return roots.map((root) => path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  }
  const entries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return [...entries, '/usr/bin', '/usr/sbin', '/usr/local/bin', '/snap/bin']
    .flatMap((entry) => SYSTEM_NAMES.map((name) => path.join(entry, name)));
};

export const resolveChromePath = (configuredPath) => {
  if (configuredPath) {
    if (executable(configuredPath)) return configuredPath;
    throw new Error(`config.chromePath is not an executable Chrome or Chromium binary: ${configuredPath}`);
  }
  const discovered = systemCandidates().find(executable);
  if (discovered) return discovered;
  throw new Error('Chrome or Chromium was not found. Set chromePath in config.json.');
};

const parseEndpoint = (contents) => {
  const [portLine, socketPath] = contents.split(/\r?\n/);
  const port = Number.parseInt(portLine?.trim() || '', 10);
  const suffix = socketPath?.trim() || '';
  if (!Number.isInteger(port) || !suffix.startsWith('/devtools/browser/')) return null;
  return `ws://127.0.0.1:${port}${suffix}`;
};

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const probeVersion = async (endpoint) => {
  const cdp = await connectCdp(endpoint, { commandTimeoutMs: 5_000 });
  try {
    const version = await cdp.send('Browser.getVersion');
    const match = `${version.product ?? ''} ${version.userAgent ?? ''}`.match(/(?:Chrome|Chromium)\/(\d+)/i);
    if (!match) throw new Error('Chrome returned no recognizable major version');
    const major = Number.parseInt(match[1], 10);
    if (major < MINIMUM_CHROME_MAJOR_VERSION) {
      throw new Error(`Chrome ${MINIMUM_CHROME_MAJOR_VERSION}+ is required, but Chrome ${major} was found`);
    }
    return { ...version, major };
  } finally {
    cdp.close();
  }
};

export const createChromeProcess = ({ chromePath = null, startupTimeoutMs = 15_000 } = {}) => {
  let launchPromise = null;
  let child = null;
  let profileDir = null;
  let result = null;
  let closed = false;

  const removeProfile = async () => {
    if (!profileDir) return;
    const directory = profileDir;
    profileDir = null;
    await fs.promises.rm(directory, { recursive: true, force: true });
  };

  const killChild = () => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    try { child.kill('SIGKILL'); } catch {}
  };

  const waitForExit = (processToWait) => {
    if (!processToWait || processToWait.exitCode !== null || processToWait.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => processToWait.once('exit', resolve));
  };

  const launch = async () => {
    const binary = resolveChromePath(chromePath);
    profileDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'openchamber-server-browser-'));
    await fs.promises.chmod(profileDir, 0o700);
    if (closed) throw new Error('Chrome launch was cancelled');
    child = spawn(binary, [
      '--headless=new',
      '--webrtc-ip-handling-policy=disable_non_proxied_udp',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--password-store=basic',
      'about:blank',
    ], {
      env: { ...process.env },
      stdio: ['ignore', 'ignore', 'ignore'],
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    let exitError = null;
    child.once('error', (error) => { exitError = new Error(`Chrome failed to spawn: ${error.message}`); });
    child.once('exit', (code, signal) => {
      if (!closed && !result) exitError = new Error(`Chrome exited during startup (code ${code ?? 'null'}, signal ${signal ?? 'none'})`);
    });

    const deadline = Date.now() + startupTimeoutMs;
    const activePortPath = path.join(profileDir, 'DevToolsActivePort');
    let endpoint = null;
    while (!endpoint && Date.now() < deadline) {
      if (closed) throw new Error('Chrome launch was cancelled');
      if (exitError) throw exitError;
      try {
        endpoint = parseEndpoint(await fs.promises.readFile(activePortPath, 'utf8'));
      } catch {}
      if (!endpoint) await wait(40);
    }
    if (!endpoint) throw new Error('Timed out waiting for Chrome DevTools readiness');
    const version = await probeVersion(endpoint);
    if (closed) throw new Error('Chrome launch was cancelled');
    result = { endpoint, version, process: child, profileDir };
    return result;
  };

  return {
    ensure() {
      if (closed) return Promise.reject(new Error('Chrome process manager is closed'));
      if (result) return Promise.resolve(result);
      if (!launchPromise) {
        launchPromise = launch().catch(async (error) => {
          killChild();
          await removeProfile();
          throw error;
        });
      }
      return launchPromise;
    },
    async close() {
      if (closed) return;
      closed = true;
      const processToWait = child;
      const exited = waitForExit(processToWait);
      killChild();
      await launchPromise?.catch(() => {});
      await exited;
      await removeProfile();
      child = null;
      result = null;
    },
    get process() {
      return child;
    },
    get profileDir() {
      return profileDir;
    },
  };
};
