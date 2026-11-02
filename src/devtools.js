import crypto from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { createDevToolsPolicy } from './devtools-policy.js';
import { applyViewport } from './viewports.js';

const FRONTEND_ORIGIN = 'devtools://devtools';
const MAX_MESSAGE_BYTES = 64 * 1024 * 1024;
// A side that stops reading is cut off instead of buffering without bound.
const MAX_BUFFERED_BYTES = 64 * 1024 * 1024;
const MAX_QUEUED_COMMANDS = 1_024;

const pageSocketUrl = (browserEndpoint, targetId) => {
  const url = new URL(browserEndpoint);
  url.pathname = `/devtools/page/${encodeURIComponent(targetId)}`;
  return url.href;
};

// Chrome DevTools for one tab at a time. The frontend is the one bundled with
// this Chrome, so it always speaks its protocol. It runs in a window of its own
// browser context, which the shared surface shows instead of the tab, and
// reaches the tab only through this relay and its policy. That context's proxy
// lets the relay through and sends everything else the frontend loads or opens
// through the scope's egress policy.
export const createDevTools = ({ cdp, endpoint, proxyAddress, scopeContextId }) => {
  let relayStart = null;
  let relay = null;
  let contextStart = null;
  let contextId = null;
  let session = null;
  let creation = Promise.resolve();
  // The panel's CSS size and the viewer's pixel ratio.
  const frontendViewport = (size) => ({ width: size.width, height: size.height, mobile: false, deviceScaleFactor: size.deviceScaleFactor });

  const connect = (client, request) => {
    const current = session;
    if (!current || request.url !== `/devtools/${current.token}`) {
      client.terminate();
      return;
    }
    current.link?.close();
    const policy = createDevToolsPolicy({ browserContextId: scopeContextId, targetId: current.targetId });
    const upstream = new WebSocket(pageSocketUrl(endpoint, current.targetId), { maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
    const queued = [];
    const link = {
      close() {
        client.terminate();
        upstream.terminate();
      },
    };
    current.link = link;
    const send = (socket, text) => {
      if (socket.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) link.close();
      else socket.send(text);
    };
    client.on('message', (data, isBinary) => {
      const result = isBinary ? { ok: false } : policy.command(data.toString('utf8'));
      if (result.ok) {
        const text = JSON.stringify(result.message);
        if (upstream.readyState !== WebSocket.CONNECTING) send(upstream, text);
        else if (queued.push(text) > MAX_QUEUED_COMMANDS) link.close();
      } else if (result.response) {
        send(client, JSON.stringify(result.response));
      } else {
        link.close();
      }
    });
    upstream.on('open', () => {
      for (const text of queued.splice(0)) send(upstream, text);
    });
    upstream.on('message', (data, isBinary) => {
      const text = isBinary ? null : data.toString('utf8');
      if (text !== null && policy.event(text).ok) send(client, text);
      else link.close();
    });
    for (const socket of [client, upstream]) {
      socket.on('close', () => link.close());
      socket.on('error', () => link.close());
    }
  };

  const ensureRelay = () => {
    relayStart ??= new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: '127.0.0.1',
        port: 0,
        maxPayload: MAX_MESSAGE_BYTES,
        perMessageDeflate: false,
        verifyClient: ({ origin, req }) => origin === FRONTEND_ORIGIN
          && session !== null && req.url === `/devtools/${session.token}`,
      });
      server.on('connection', connect);
      server.once('error', reject);
      server.once('listening', () => {
        relay = server;
        resolve(server.address().port);
      });
    }).catch((error) => {
      relayStart = null;
      throw error;
    });
    return relayStart;
  };

  const ensureContext = (relayPort) => {
    contextStart ??= cdp.send('Target.createBrowserContext', {
      proxyServer: proxyAddress,
      proxyBypassList: `<-loopback>;127.0.0.1:${relayPort}`,
    }).then((context) => {
      if (typeof context.browserContextId !== 'string') throw new Error('Chrome returned no browser context id');
      contextId = context.browserContextId;
      return contextId;
    }).catch((error) => {
      contextStart = null;
      throw error;
    });
    return contextStart;
  };

  const close = async () => {
    const current = session;
    session = null;
    if (!current) return;
    current.link?.close();
    const frontendTargetId = await current.created?.then((target) => target.targetId, () => null);
    if (frontendTargetId && cdp.isOpen) await cdp.send('Target.closeTarget', { targetId: frontendTargetId }).catch(() => {});
  };

  return {
    // The inspected tab, once its DevTools can be shown.
    get targetId() {
      return session?.page ? session.targetId : null;
    },
    get page() {
      return session?.page ?? null;
    },
    async open(targetId, { size, colorScheme = null }) {
      await close();
      const current = { targetId, token: crypto.randomBytes(32).toString('hex'), created: null, frontendTargetId: null, page: null, link: null };
      session = current;
      const stillOpening = () => {
        if (session !== current) throw new Error('DevTools closed while opening');
      };
      const port = await ensureRelay();
      stillOpening();
      const browserContextId = await ensureContext(port);
      stillOpening();
      current.created = cdp.send('Target.createTarget', {
        url: `devtools://devtools/bundled/inspector.html?ws=127.0.0.1:${port}/devtools/${current.token}`,
        browserContextId,
        // A window of its own keeps the inspected tab painting for DevTools' screencast.
        newWindow: true,
        background: true,
      }).then((target) => {
        if (typeof target.targetId !== 'string') throw new Error('Chrome returned no DevTools target id');
        current.frontendTargetId = target.targetId;
        return target;
      });
      creation = current.created.catch(() => {});
      await current.created;
      stillOpening();
      const sessionId = await cdp.attach(current.frontendTargetId);
      stillOpening();
      await applyViewport(cdp, sessionId, frontendViewport(size));
      // DevTools follows the system theme by default.
      if (colorScheme) {
        await cdp.sendSession(sessionId, 'Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: colorScheme }] });
      }
      stillOpening();
      current.page = { cdp, sessionId, targetId: current.frontendTargetId, devtools: true };
      return current.page;
    },
    close,
    resize(size) {
      return session?.page ? applyViewport(cdp, session.page.sessionId, frontendViewport(size)) : Promise.resolve();
    },
    // Pages the frontend opens, such as a link from the Network panel, would
    // sit in a window nobody sees.
    targetCreated(info) {
      if (info?.type !== 'page' || !contextId || info.browserContextId !== contextId) return;
      void creation.then(() => {
        if (info.targetId !== session?.frontendTargetId) return cdp.send('Target.closeTarget', { targetId: info.targetId });
      }).catch(() => {});
    },
    // Whether the frontend that was shown went away.
    targetDestroyed(targetId) {
      if (!session || session.frontendTargetId !== targetId) return false;
      session.link?.close();
      session = null;
      return true;
    },
    async dispose() {
      await close();
      for (const client of relay?.clients ?? []) client.terminate();
      await new Promise((resolve) => (relay ? relay.close(() => resolve()) : resolve()));
    },
  };
};
