import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrowserManager } from './browser-manager.js';
import { createBrowserRuntime } from './browser-runtime.js';
import { loadConfig } from './config.js';
import { createDevServerScanner } from './dev-servers.js';
import { createService } from './service.js';

const readPort = (value) => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('OPENCHAMBER_SERVICE_PORT must be an integer from 1 to 65535');
  }
  return port;
};

export { createBrowserManager, createBrowserRuntime, createService };

export const startService = async ({
  env = process.env,
  configPath,
  runtime,
} = {}) => {
  const token = env.OPENCHAMBER_SERVICE_TOKEN;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('OPENCHAMBER_SERVICE_TOKEN is required');
  }
  const config = loadConfig({ entryUrl: import.meta.url, configPath });
  // One scanner serves every scope; it caches the listener table briefly.
  const devServers = config.discoverDevServers ? createDevServerScanner() : null;
  const browserRuntime = runtime ?? createBrowserManager({
    createRuntime: () => createBrowserRuntime({ ...config, devServers }),
  });
  const service = createService({
    runtime: browserRuntime,
    token,
    port: readPort(env.OPENCHAMBER_SERVICE_PORT),
  });
  await service.listen();
  return service;
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  startService().then((service) => {
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      void service.close().finally(() => process.exit(0));
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
