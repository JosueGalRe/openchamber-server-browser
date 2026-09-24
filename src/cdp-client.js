import { WebSocket } from 'ws';

const commandError = (method, reason) => new Error(`CDP command ${method} failed: ${reason}`);

export const connectCdp = async (webSocketDebuggerUrl, {
  commandTimeoutMs = 30_000,
  handshakeTimeoutMs = 10_000,
} = {}) => {
  const socket = new WebSocket(webSocketDebuggerUrl, {
    maxPayload: 256 * 1024 * 1024,
    perMessageDeflate: false,
    handshakeTimeout: handshakeTimeoutMs,
  });
  const pending = new Map();
  const listeners = new Set();
  const closeListeners = new Set();
  let nextId = 1;
  let open = false;

  const rejectPending = (reason) => {
    for (const entry of pending.values()) {
      clearTimeout(entry.timeout);
      entry.reject(commandError(entry.method, reason));
    }
    pending.clear();
  };

  const disconnect = (reason) => {
    if (!open && pending.size === 0) return;
    open = false;
    rejectPending(reason);
    for (const listener of closeListeners) {
      try {
        listener(reason);
      } catch {}
    }
  };

  const sendCommand = (method, params = {}, sessionId) => {
    if (!open || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(commandError(method, 'connection is closed'));
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(commandError(method, `timed out after ${commandTimeoutMs}ms`));
      }, commandTimeoutMs);
      timeout.unref?.();
      pending.set(id, { method, sessionId, resolve, reject, timeout });
      try {
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(id);
        reject(commandError(method, error instanceof Error ? error.message : String(error)));
      }
    });
  };

  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString('utf8'));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (Number.isInteger(message.id)) {
      const entry = pending.get(message.id);
      if (!entry || entry.sessionId !== message.sessionId) return;
      pending.delete(message.id);
      clearTimeout(entry.timeout);
      if (message.error) entry.reject(commandError(entry.method, message.error.message || 'protocol error'));
      else entry.resolve(message.result ?? {});
      return;
    }
    if (typeof message.method !== 'string') return;
    for (const listener of listeners) {
      try {
        listener({ method: message.method, params: message.params ?? {}, sessionId: message.sessionId });
      } catch {}
    }
  });
  socket.on('close', () => disconnect('connection closed'));
  socket.on('error', (error) => disconnect(error instanceof Error ? error.message : 'connection error'));

  await new Promise((resolve, reject) => {
    const handshakeTimer = setTimeout(() => {
      cleanup();
      try { socket.terminate(); } catch {}
      reject(new Error(`WebSocket opening handshake timed out after ${handshakeTimeoutMs}ms`));
    }, handshakeTimeoutMs);
    handshakeTimer.unref?.();
    const cleanup = () => {
      clearTimeout(handshakeTimer);
      socket.off('open', onOpen);
      socket.off('error', onError);
      socket.off('close', onClose);
    };
    const onOpen = () => {
      cleanup();
      open = true;
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const onClose = () => {
      cleanup();
      reject(new Error('CDP connection closed before opening'));
    };
    socket.once('open', onOpen);
    socket.once('error', onError);
    socket.once('close', onClose);
  });

  return {
    send: (method, params = {}) => sendCommand(method, params),
    sendSession: (sessionId, method, params = {}) => sendCommand(method, params, sessionId),
    async attach(targetId) {
      const result = await sendCommand('Target.attachToTarget', { targetId, flatten: true });
      if (typeof result.sessionId !== 'string') throw new Error('Chrome returned no target session id');
      return result.sessionId;
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onClose(listener) {
      closeListeners.add(listener);
      return () => closeListeners.delete(listener);
    },
    close() {
      if (!open) return;
      disconnect('connection closed by client');
      try { socket.terminate(); } catch {}
    },
    get isOpen() {
      return open && socket.readyState === WebSocket.OPEN;
    },
  };
};
