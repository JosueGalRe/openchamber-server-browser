// Adapted from OpenChamber's server browser inspector (MIT). The original
// pushed batches over a socket; here the inspector page polls with a cursor.
import crypto from 'node:crypto';
import { boundedString, formatConsoleEvent, formatHeaders, formatRemoteObject, normalizeBody, redactUrl } from './inspector-format.js';

const MAX_CONSOLE_ROWS = 300;
const MAX_NETWORK_ROWS = 200;
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;
const MAX_BATCH_BYTES = 48 * 1024;
const MAX_BATCH_ROWS = 32;
const MAX_REPLY_BYTES = 64 * 1024;
const MAX_EXPRESSION_CHARS = 16_000;
const OPERATION_TIMEOUT_MS = 5_000;
// A capture nobody polls for this long ends, so a closed inspector page leaks nothing.
const CAPTURE_IDLE_MS = 30_000;

const MESSAGES = Object.freeze({
  UNAVAILABLE: 'The inspector needs an open browser tab',
  INVALID_REQUEST: 'The inspector request is invalid or another request is still running',
  CAPTURE_GONE: 'This inspector capture is no longer available',
  EVALUATION_FAILED: 'Could not run JavaScript in this page',
  EVALUATION_TIMEOUT: 'JavaScript evaluation exceeded the time limit',
  REQUEST_GONE: 'This captured request is no longer available',
  REQUEST_FAILED: 'Could not read the captured request',
  CAPTURE_FAILED: 'Could not start the browser inspector',
  AGENT_ACTIVE: 'The agent is using the browser; run JavaScript once its action finishes',
});

export class InspectorError extends Error {
  constructor(code) {
    super(MESSAGES[code]);
    this.code = code;
  }
}

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
const finiteOrNull = (value) => (Number.isFinite(value) && value >= 0 ? value : null);

const fitReply = (message) => {
  while (byteLength(message) >= MAX_REPLY_BYTES) {
    message.truncated = true;
    if (message.requestHeaders?.length || message.responseHeaders?.length) {
      const headers = message.requestHeaders.length >= message.responseHeaders.length ? message.requestHeaders : message.responseHeaders;
      headers.pop();
    } else if (message.requestBody?.length || message.responseBody?.length) {
      const key = (message.requestBody?.length ?? 0) >= (message.responseBody?.length ?? 0) ? 'requestBody' : 'responseBody';
      message[key] = message[key].slice(0, Math.floor(message[key].length / 2));
    } else {
      message.text = message.text.slice(0, Math.floor(message.text.length / 2));
    }
  }
  return message;
};

// Resolves to { value } or { error }, or { timedOut: true } after the deadline.
const withDeadline = (operation) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve({ timedOut: true }), OPERATION_TIMEOUT_MS);
  timer.unref?.();
  operation.then((value) => resolve({ value }), (error) => resolve({ error })).finally(() => clearTimeout(timer));
});

const createCapture = ({ captureId, tab, startedAt }) => {
  const consoleRows = new Map();
  const networkRows = new Map();
  const activeRequests = new Map();
  let revision = 0;
  let retainedBytes = 0;
  let nextId = 0;
  let droppedConsole = 0;
  let droppedNetwork = 0;

  const store = (rows, entry) => {
    const previous = rows.get(entry.row.id);
    if (previous) retainedBytes -= previous.bytes;
    revision += 1;
    const stored = { ...entry, revision, bytes: byteLength(entry) };
    rows.delete(entry.row.id);
    rows.set(entry.row.id, stored);
    retainedBytes += stored.bytes;
  };

  const evict = (rows, id) => {
    const entry = rows.get(id);
    if (!entry) return;
    rows.delete(id);
    retainedBytes -= entry.bytes;
    if (rows === networkRows) {
      if (activeRequests.get(entry.requestId) === id) activeRequests.delete(entry.requestId);
      droppedNetwork += 1;
    } else {
      droppedConsole += 1;
    }
  };

  const trim = () => {
    while (consoleRows.size > MAX_CONSOLE_ROWS) evict(consoleRows, consoleRows.keys().next().value);
    while (networkRows.size > MAX_NETWORK_ROWS) evict(networkRows, networkRows.keys().next().value);
    while (retainedBytes > MAX_CAPTURE_BYTES && (consoleRows.size || networkRows.size)) {
      const rows = consoleRows.size ? consoleRows : networkRows;
      evict(rows, rows.keys().next().value);
    }
  };

  const completeResponse = (entry, response, timestamp, state = 'pending') => {
    const headers = formatHeaders(response?.headers);
    return {
      ...entry,
      responseHeaders: headers.headers,
      truncated: entry.truncated || headers.truncated,
      row: {
        ...entry.row,
        status: Number.isInteger(response?.status) ? finiteOrNull(response.status) : null,
        statusText: boundedString(response?.statusText, 128),
        mimeType: boundedString(response?.mimeType, 128),
        encodedBytes: finiteOrNull(response?.encodedDataLength),
        state,
        durationMs: state === 'complete' && Number.isFinite(timestamp)
          ? finiteOrNull(Math.max(0, (timestamp - entry.started) * 1_000)) : null,
        fromCache: entry.row.fromCache || response?.fromDiskCache === true || response?.fromServiceWorker === true
          || response?.fromPrefetchCache === true,
      },
    };
  };

  const event = (method, params) => {
    if (method === 'Runtime.consoleAPICalled' || method === 'Runtime.exceptionThrown') {
      if (Number.isFinite(params?.timestamp) && params.timestamp < startedAt) return;
      const row = formatConsoleEvent(method, params, `${captureId}:c${++nextId}`);
      if (!row) return;
      store(consoleRows, { row });
      trim();
      return;
    }
    const requestId = boundedString(params?.requestId, 129);
    if (!requestId || requestId.length > 128) return;
    const current = networkRows.get(activeRequests.get(requestId));
    if (method === 'Network.requestWillBeSent') {
      if (!params.request || !Number.isFinite(params.timestamp)) return;
      if (current) {
        if (!params.redirectResponse) return;
        store(networkRows, { ...completeResponse(current, params.redirectResponse, params.timestamp, 'complete'), redirected: true });
      }
      const headers = formatHeaders(params.request.headers);
      const timestamp = params.wallTime * 1_000;
      const row = {
        id: `${captureId}:n${++nextId}`,
        timestamp: Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= 8.64e15 ? timestamp : Date.now(),
        method: boundedString(params.request.method, 128),
        url: redactUrl(params.request.url),
        resourceType: boundedString(params.type, 128),
        status: null,
        statusText: '',
        mimeType: '',
        durationMs: null,
        encodedBytes: null,
        state: 'pending',
        failureText: null,
        fromCache: false,
      };
      activeRequests.set(requestId, row.id);
      store(networkRows, {
        row,
        requestId,
        started: params.timestamp,
        requestHeaders: headers.headers,
        responseHeaders: [],
        hasPostData: params.request.hasPostData === true,
        redirected: false,
        truncated: headers.truncated,
      });
      trim();
      return;
    }
    if (!current) return;
    if (method === 'Network.responseReceived') {
      store(networkRows, completeResponse(current, params.response, params.timestamp));
    } else if (method === 'Network.requestServedFromCache') {
      store(networkRows, { ...current, row: { ...current.row, fromCache: true } });
    } else if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const failed = method === 'Network.loadingFailed';
      const networkError = boundedString(params.errorText, 1_024);
      store(networkRows, {
        ...current,
        row: {
          ...current.row,
          state: failed ? 'failed' : 'complete',
          encodedBytes: failed ? current.row.encodedBytes : finiteOrNull(params.encodedDataLength),
          durationMs: Number.isFinite(params.timestamp) ? finiteOrNull(Math.max(0, (params.timestamp - current.started) * 1_000)) : null,
          failureText: failed
            ? (params.canceled === true ? 'Request canceled'
              : /^net::ERR_[A-Z0-9_]+$/.test(networkError) ? networkError : params.blockedReason ? 'Request blocked' : 'Request failed')
            : null,
        },
      });
    } else {
      return;
    }
    trim();
  };

  // Rows changed after the cursor, oldest change first, within one reply's bounds.
  const batch = (after) => {
    const changed = [...consoleRows.values(), ...networkRows.values()]
      .filter((entry) => entry.revision > after)
      .sort((left, right) => left.revision - right.revision);
    const reply = { cursor: after, more: false, console: [], network: [], droppedConsole, droppedNetwork };
    let bytes = byteLength(reply);
    for (const entry of changed) {
      const rowBytes = byteLength(entry.row) + 1;
      if (reply.console.length + reply.network.length === MAX_BATCH_ROWS || bytes + rowBytes > MAX_BATCH_BYTES) {
        reply.more = true;
        break;
      }
      (consoleRows.get(entry.row.id) === entry ? reply.console : reply.network).push(entry.row);
      reply.cursor = entry.revision;
      bytes += rowBytes;
    }
    return reply;
  };

  const clear = (scope) => {
    const rows = scope === 'console' ? consoleRows : networkRows;
    for (const entry of rows.values()) retainedBytes -= entry.bytes;
    rows.clear();
    if (scope === 'console') droppedConsole = 0;
    else {
      activeRequests.clear();
      droppedNetwork = 0;
    }
  };

  return {
    captureId,
    tab,
    event,
    batch,
    clear,
    request: (entryId) => networkRows.get(entryId) ?? null,
  };
};

// Console and network capture for the inspector page, bound to one tab.
export const createInspector = ({ send }) => {
  const captures = new Map();
  const networkUsers = new Map();

  const end = (capture) => {
    if (captures.get(capture.captureId) !== capture) return;
    captures.delete(capture.captureId);
    clearTimeout(capture.idleTimer);
    const users = (networkUsers.get(capture.tab.sessionId) ?? 1) - 1;
    if (users > 0) {
      networkUsers.set(capture.tab.sessionId, users);
      return;
    }
    networkUsers.delete(capture.tab.sessionId);
    void send(capture.tab.sessionId, 'Network.disable').catch(() => {});
  };

  const keepAlive = (capture) => {
    clearTimeout(capture.idleTimer);
    capture.idleTimer = setTimeout(() => end(capture), CAPTURE_IDLE_MS);
    capture.idleTimer.unref?.();
  };

  const requireCapture = (captureId) => {
    const capture = captures.get(captureId);
    if (!capture) throw new InspectorError('CAPTURE_GONE');
    keepAlive(capture);
    return capture;
  };

  return {
    async start(tab) {
      if (!tab) throw new InspectorError('UNAVAILABLE');
      const capture = createCapture({ captureId: crypto.randomUUID(), tab, startedAt: Date.now() });
      capture.navigationRevision = 0;
      capture.evaluating = false;
      capture.reading = false;
      const users = networkUsers.get(tab.sessionId) ?? 0;
      networkUsers.set(tab.sessionId, users + 1);
      captures.set(capture.captureId, capture);
      keepAlive(capture);
      if (users === 0) {
        try {
          await send(tab.sessionId, 'Network.enable');
        } catch {
          end(capture);
          throw new InspectorError('CAPTURE_FAILED');
        }
      }
      return { captureId: capture.captureId };
    },
    // Page events of every tab; each capture keeps its own tab's.
    event(sessionId, method, params) {
      for (const capture of captures.values()) {
        if (capture.tab.sessionId !== sessionId) continue;
        const mainNavigation = method === 'Page.frameNavigated' && params?.frame && !params.frame.parentId;
        if (mainNavigation || method === 'Runtime.executionContextsCleared'
          || (method === 'Page.navigatedWithinDocument' && params?.frameId === capture.tab.mainFrameId)) {
          capture.navigationRevision += 1;
        }
        capture.event(method, params);
      }
    },
    events(captureId, after) {
      const capture = requireCapture(captureId);
      return { ...capture.batch(after), tab: { id: capture.tab.targetId, url: capture.tab.url, title: capture.tab.title } };
    },
    clear(captureId, scope) {
      requireCapture(captureId).clear(scope);
    },
    stop(captureId) {
      const capture = captures.get(captureId);
      if (capture) end(capture);
    },
    // The tab went away or another one came forward.
    endTab(sessionId) {
      for (const capture of [...captures.values()]) if (capture.tab.sessionId === sessionId) end(capture);
    },
    async evaluate(captureId, expression) {
      const capture = requireCapture(captureId);
      if (typeof expression !== 'string' || expression.length > MAX_EXPRESSION_CHARS || capture.evaluating) {
        throw new InspectorError('INVALID_REQUEST');
      }
      capture.evaluating = true;
      const navigationRevision = capture.navigationRevision;
      const { sessionId } = capture.tab;
      const objectGroup = `openchamber-inspector-${crypto.randomUUID()}`;
      const release = () => { void send(sessionId, 'Runtime.releaseObjectGroup', { objectGroup }).catch(() => {}); };
      const pending = (async () => {
        let result = await send(sessionId, 'Runtime.evaluate', {
          expression,
          objectGroup,
          awaitPromise: true,
          returnByValue: false,
          generatePreview: true,
          timeout: 1_000,
          silent: true,
          replMode: true,
          includeCommandLineAPI: true,
        });
        if (result?.result?.subtype === 'promise' && !result.exceptionDetails) {
          result = await send(sessionId, 'Runtime.awaitPromise', {
            promiseObjectId: result.result.objectId,
            returnByValue: false,
            generatePreview: true,
          });
        }
        return result;
      })();
      // A late result still owns objects in the group.
      pending.finally(release).catch(() => {});
      const outcome = await withDeadline(pending);
      capture.evaluating = false;
      if (outcome.timedOut) throw new InspectorError('EVALUATION_TIMEOUT');
      if (outcome.error) {
        throw new InspectorError(/timed out|timeout|execution was terminated/i.test(boundedString(outcome.error.message, 512))
          ? 'EVALUATION_TIMEOUT' : 'EVALUATION_FAILED');
      }
      const result = outcome.value;
      if (captures.get(captureId) !== capture || capture.navigationRevision !== navigationRevision
        || (!result?.result && !result?.exceptionDetails)) {
        throw new InspectorError('EVALUATION_FAILED');
      }
      const exception = result.exceptionDetails;
      const formatted = formatRemoteObject(exception?.exception ?? (exception ? { type: 'string', value: exception.text } : result.result), 8_000);
      return fitReply({ ...formatted, isError: Boolean(exception) });
    },
    async request(captureId, entryId, includeBody) {
      const capture = requireCapture(captureId);
      if (capture.reading) throw new InspectorError('INVALID_REQUEST');
      const entry = capture.request(entryId);
      if (!entry) throw new InspectorError('REQUEST_GONE');
      const response = {
        entryId,
        requestHeaders: entry.requestHeaders.slice(),
        responseHeaders: entry.responseHeaders.slice(),
        requestBody: null,
        responseBody: null,
        bodyState: 'not-requested',
        truncated: entry.truncated,
      };
      if (!includeBody) return fitReply(response);
      if (entry.redirected) return fitReply({ ...response, bodyState: 'unsupported' });
      capture.reading = true;
      const { sessionId } = capture.tab;
      const outcome = await withDeadline((async () => {
        let unavailable = false;
        let unsupported = false;
        const requestMime = entry.requestHeaders.find((header) => header.name.toLowerCase() === 'content-type')?.value ?? '';
        if (entry.hasPostData && !normalizeBody('', false, requestMime).supported) unsupported = true;
        else if (entry.hasPostData) {
          try {
            const result = await send(sessionId, 'Network.getRequestPostData', { requestId: entry.requestId });
            const body = normalizeBody(result.postData, false, requestMime);
            response.requestBody = body.text;
            response.truncated ||= body.truncated;
            unsupported ||= !body.supported;
          } catch {
            unavailable = true;
          }
        }
        const current = capture.request(entryId);
        if (!current) throw new InspectorError('REQUEST_GONE');
        if (current.redirected) return { ...response, requestBody: null, bodyState: 'unsupported' };
        if (current.row.state !== 'complete') unavailable = true;
        else if (!normalizeBody('', false, current.row.mimeType).supported) unsupported = true;
        else {
          try {
            const result = await send(sessionId, 'Network.getResponseBody', { requestId: entry.requestId });
            const body = normalizeBody(result.body, result.base64Encoded, current.row.mimeType);
            response.responseBody = body.text;
            response.truncated ||= body.truncated;
            unsupported ||= !body.supported;
          } catch {
            unavailable = true;
          }
        }
        response.bodyState = unavailable ? 'unavailable' : unsupported ? 'unsupported' : 'available';
        return response;
      })());
      capture.reading = false;
      if (outcome.error instanceof InspectorError) throw outcome.error;
      if (outcome.timedOut || outcome.error || captures.get(captureId) !== capture || !capture.request(entryId)) {
        throw new InspectorError('REQUEST_FAILED');
      }
      return fitReply(outcome.value);
    },
    close() {
      for (const capture of [...captures.values()]) end(capture);
    },
  };
};
