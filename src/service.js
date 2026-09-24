import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import {
  BROWSER_PROVIDER_PATH,
  SURFACE_AGENT_ACTIVE_HEADER,
  SURFACE_CLIPBOARD_PATH,
  SURFACE_CONTROL_PATH,
  SURFACE_FRAME_PATH,
  SURFACE_FRAME_WAIT_MS,
  SURFACE_HEIGHT_HEADER,
  SURFACE_INPUT_PATH,
  SURFACE_RESIZE_PATH,
  SURFACE_SEQ_HEADER,
  SURFACE_TITLE_HEADER,
  SURFACE_TITLE_MAX,
  SURFACE_WIDTH_HEADER,
  readBrowserProviderRequest,
  readSurfaceControlNotice,
  readSurfaceInputBatch,
  readSurfaceResizeRequest,
} from '@openchamber/sdk';

const BODY_MAX_BYTES = 17 * 1024 * 1024;

const json = (response, status, body) => {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': bytes.length,
  });
  response.end(bytes);
};

const text = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(body);
};

const authorized = (request, token) => {
  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
};

// Typed dock addresses follow the omnibox: bare IPs and localhost are usually
// plain-HTTP dev servers, other hosts default to HTTPS.
const withScheme = (address) => {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(address)) return address;
  const host = address.split(/[/?#]/, 1)[0].replace(/:\d*$/, '').replace(/^\[(.*)\]$/, '$1').toLowerCase();
  return `${host === 'localhost' || net.isIP(host) ? 'http' : 'https'}://${address}`;
};

const readBody = async (request) => {
  const contentLength = Number(request.headers['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > BODY_MAX_BYTES) throw new Error('Request body is too large');
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > BODY_MAX_BYTES) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length).toString('utf8');
};

const queryInteger = (url, name, fallback, maximum) => {
  const raw = url.searchParams.get(name);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= maximum ? value : null;
};

const errorMessage = (error) => {
  if (error instanceof DOMException && error.name === 'AbortError') return 'Browser action was cancelled';
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'Unknown browser state';
};

const surfaceTitleHeader = (value) => Array.from(String(value ?? ''), (character) => {
  const codePoint = character.codePointAt(0);
  if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return ' ';
  if (codePoint > 255) return '?';
  return character;
}).join('').trim().slice(0, SURFACE_TITLE_MAX);

const readObjectBody = async (request) => {
  try {
    const parsed = JSON.parse(await readBody(request));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const stringProperty = (value, name) => (
  typeof value?.[name] === 'string' && value[name].length > 0 ? value[name] : null
);

const generationProperty = (value) => (
  Number.isInteger(value?.generation) && value.generation >= 0 ? value.generation : null
);

const dockErrorStatus = (error) => {
  const message = errorMessage(error);
  if (/surface is idle|browser view changed/i.test(message)) return 409;
  if (/no browser scope|no longer exists/i.test(message)) return 404;
  return 400;
};

export const createService = ({ runtime, token, port = 0 }) => {
  if (!runtime?.perform || !runtime?.close) throw new Error('createService requires a browser runtime');
  if (typeof token !== 'string' || token.length === 0) throw new Error('createService requires a bearer token');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Service port must be from 0 to 65535');
  const activeRequests = new Set();
  let listening = false;
  let closePromise = null;

  const handle = async (request, response, signal) => {
    if (!authorized(request, token)) return text(response, 401, 'Unauthorized\n');
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (request.method === 'GET' && url.pathname === '/health') return json(response, 200, { ok: true });

    if (request.method === 'POST' && url.pathname === BROWSER_PROVIDER_PATH) {
      const parsed = readBrowserProviderRequest(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid browser provider request\n');
      try {
        const data = await runtime.perform(parsed.action, parsed.parameters, signal, parsed.context);
        return json(response, 200, { ok: true, data });
      } catch (error) {
        return json(response, 200, { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'GET' && url.pathname === '/browser/state') {
      return json(response, 200, runtime.state());
    }

    if (request.method === 'POST' && url.pathname === '/browser/select') {
      const body = await readObjectBody(request);
      const id = stringProperty(body, 'scopeId');
      const generation = generationProperty(body);
      if (!id || generation === null) return text(response, 400, 'scopeId and generation are required\n');
      try {
        await runtime.selectScope(id, generation);
        return json(response, 200, runtime.state());
      } catch (error) {
        return json(response, dockErrorStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'POST' && url.pathname === '/browser/navigate') {
      const body = await readObjectBody(request);
      const target = stringProperty(body, 'url');
      const generation = generationProperty(body);
      if (!target || generation === null) return text(response, 400, 'url and generation are required\n');
      try {
        await runtime.navigate(withScheme(target), generation);
        return json(response, 200, runtime.state());
      } catch (error) {
        return json(response, dockErrorStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'POST' && (url.pathname === '/browser/back' || url.pathname === '/browser/forward' || url.pathname === '/browser/reload')) {
      const body = await readObjectBody(request);
      const generation = generationProperty(body);
      if (generation === null) return text(response, 400, 'generation is required\n');
      try {
        if (url.pathname === '/browser/back') await runtime.back(generation);
        else if (url.pathname === '/browser/forward') await runtime.forward(generation);
        else await runtime.reload(generation);
        return json(response, 200, runtime.state());
      } catch (error) {
        return json(response, dockErrorStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'POST' && url.pathname === '/browser/select-compatibility') {
      const body = await readObjectBody(request);
      const generation = generationProperty(body);
      const enabled = body?.enabled === true || body?.enabled === false ? body.enabled : null;
      if (enabled === null || generation === null) {
        return text(response, 400, 'enabled and generation are required\n');
      }
      try {
        await runtime.setNativeSelectCompatibility(enabled, generation);
        return json(response, 200, runtime.state());
      } catch (error) {
        return json(response, dockErrorStatus(error), { ok: false, error: errorMessage(error) });
      }
    }

    if (request.method === 'GET' && url.pathname === SURFACE_FRAME_PATH) {
      const after = queryInteger(url, 'after', 0, Number.MAX_SAFE_INTEGER);
      const wait = queryInteger(url, 'wait', 0, SURFACE_FRAME_WAIT_MS);
      if (after === null || wait === null) return text(response, 400, 'Invalid frame query\n');
      const frame = await runtime.surfaceFrame({ after, wait, signal });
      if (!frame) {
        response.writeHead(204);
        return response.end();
      }
      const headers = {
        'content-type': frame.mime,
        'content-length': frame.bytes.length,
        [SURFACE_SEQ_HEADER]: String(frame.sequence),
        [SURFACE_WIDTH_HEADER]: String(frame.width),
        [SURFACE_HEIGHT_HEADER]: String(frame.height),
      };
      const title = surfaceTitleHeader(frame.title);
      if (title) headers[SURFACE_TITLE_HEADER] = title;
      if (runtime.agentActive) headers[SURFACE_AGENT_ACTIVE_HEADER] = '1';
      response.writeHead(200, headers);
      return response.end(frame.bytes);
    }

    if (request.method === 'POST' && url.pathname === SURFACE_INPUT_PATH) {
      const parsed = readSurfaceInputBatch(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid surface input batch\n');
      await runtime.surfaceInput(parsed.events);
      response.writeHead(204);
      return response.end();
    }

    if (request.method === 'POST' && url.pathname === SURFACE_CONTROL_PATH) {
      const parsed = readSurfaceControlNotice(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid surface control notice\n');
      await runtime.surfaceControl(parsed.controller);
      response.writeHead(204);
      return response.end();
    }

    if (request.method === 'POST' && url.pathname === SURFACE_RESIZE_PATH) {
      const parsed = readSurfaceResizeRequest(await readBody(request));
      if (!parsed) return text(response, 400, 'Invalid surface resize request\n');
      return json(response, 200, await runtime.surfaceResize(parsed));
    }

    if (request.method === 'GET' && url.pathname === SURFACE_CLIPBOARD_PATH) {
      return json(response, 200, { text: await runtime.surfaceClipboard() });
    }
    return text(response, 404, 'Not found\n');
  };

  const server = http.createServer((request, response) => {
    const controller = new AbortController();
    activeRequests.add(controller);
    request.once('aborted', () => controller.abort(new DOMException('Request aborted', 'AbortError')));
    response.once('close', () => {
      activeRequests.delete(controller);
      if (!response.writableEnded) controller.abort(new DOMException('Client disconnected', 'AbortError'));
    });
    void handle(request, response, controller.signal).catch((error) => {
      activeRequests.delete(controller);
      if (!response.headersSent) json(response, 500, { ok: false, error: errorMessage(error) });
      else response.destroy();
    });
  });

  return {
    async listen() {
      if (listening) return this.address;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
      });
      listening = true;
      return this.address;
    },
    get address() {
      const value = server.address();
      return value && typeof value === 'object' ? { host: '127.0.0.1', port: value.port } : null;
    },
    close() {
      if (closePromise) return closePromise;
      closePromise = (async () => {
        for (const controller of activeRequests) {
          controller.abort(new DOMException('Service stopped', 'AbortError'));
        }
        await runtime.close();
        if (listening) {
          const closed = new Promise((resolve) => server.close(resolve));
          server.closeAllConnections?.();
          await closed;
        }
        listening = false;
      })();
      return closePromise;
    },
  };
};
