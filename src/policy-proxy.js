import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';

const ALWAYS_DENIED_V4 = new net.BlockList();
const ALWAYS_DENIED_V6 = new net.BlockList();
const PRIVATE_V4 = new net.BlockList();
const PRIVATE_V6 = new net.BlockList();

for (const [network, prefix] of [
  ['0.0.0.0', 8], ['100.64.0.0', 10], ['169.254.0.0', 16], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) ALWAYS_DENIED_V4.addSubnet(network, prefix, 'ipv4');

for (const [network, prefix] of [
  ['::', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32],
  ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['::ffff:0:0', 96],
]) ALWAYS_DENIED_V6.addSubnet(network, prefix, 'ipv6');

for (const [network, prefix] of [
  ['10.0.0.0', 8], ['127.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16],
]) PRIVATE_V4.addSubnet(network, prefix, 'ipv4');
PRIVATE_V6.addAddress('::1', 'ipv6');

const normalizeHost = (host) => String(host || '').replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
const familyOf = (address) => net.isIP(address) === 6 ? 'ipv6' : 'ipv4';

const permanentlyDenied = (address) => {
  const family = familyOf(address);
  if (!net.isIP(address)) return 'DNS returned an invalid address';
  const denied = family === 'ipv6'
    ? ALWAYS_DENIED_V6.check(address, family)
    : ALWAYS_DENIED_V4.check(address, family);
  if (!denied) return null;
  if (family === 'ipv6' && address.toLowerCase().startsWith('::ffff:')) {
    return 'IPv4-mapped addresses are denied';
  }
  if (family === 'ipv4' && address.startsWith('169.254.')) return 'IPv4 link-local addresses are denied';
  return 'Unspecified, link-local, transition, multicast, CGNAT, or reserved addresses are denied';
};

const grantProtocol = (protocol) => protocol === 'ws:' ? 'http:' : protocol === 'wss:' ? 'https:' : protocol;

const hasGrant = (grants, hostname, address, port, protocol) => grants.some((grant) => (
  grant.port === port
  && (!grant.protocol || grant.protocol === grantProtocol(protocol))
  && (normalizeHost(grant.host) === hostname || normalizeHost(grant.host) === address)
));

export const classifyProxyTarget = async (target, { grants = [], lookup = dns.promises.lookup } = {}) => {
  let url;
  try {
    url = target instanceof URL ? new URL(target) : new URL(String(target));
  } catch {
    return { allowed: false, reason: 'Invalid proxy target' };
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    return { allowed: false, reason: 'Unsupported proxy target protocol' };
  }
  const hostname = normalizeHost(url.hostname);
  const port = Number(url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? 443 : 80));
  if (!hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
    return { allowed: false, reason: 'Invalid proxy target authority' };
  }
  if (hostname === 'metadata.google.internal') {
    return { allowed: false, reason: 'Cloud metadata host is denied' };
  }

  let answers;
  if (hostname === 'localhost' && hasGrant(grants, hostname, '127.0.0.1', port, url.protocol)) {
    answers = [{ address: '127.0.0.1', family: 4 }];
  } else if (net.isIP(hostname)) {
    answers = [{ address: hostname, family: net.isIP(hostname) }];
  } else {
    try {
      answers = await lookup(hostname, { all: true, verbatim: true });
    } catch {
      return { allowed: false, reason: 'DNS resolution failed' };
    }
  }
  if (!Array.isArray(answers) || answers.length === 0) {
    return { allowed: false, reason: 'DNS returned no addresses' };
  }
  for (const answer of answers) {
    const address = normalizeHost(answer?.address);
    const reason = permanentlyDenied(address);
    if (reason) return { allowed: false, reason };
    const family = familyOf(address);
    const privateAddress = family === 'ipv6'
      ? PRIVATE_V6.check(address, family)
      : PRIVATE_V4.check(address, family);
    if (privateAddress && !hasGrant(grants, hostname, address, port, url.protocol)) {
      return { allowed: false, reason: 'Private or loopback address requires an allowed origin' };
    }
  }
  const pinned = answers[0];
  return {
    allowed: true,
    address: normalizeHost(pinned.address),
    family: Number(pinned.family) || net.isIP(pinned.address),
    port,
    url,
  };
};

const denyHttp = (response, reason) => {
  response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8', connection: 'close' });
  response.end(`Forbidden: ${reason}\n`);
};

const denySocket = (socket, reason, status = '403 Forbidden') => {
  if (socket.destroyed || socket.writableEnded) return;
  socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\nForbidden: ${reason}\n`);
};

export const createPolicyProxy = (policy = {}) => {
  const downstreamSockets = new Set();
  const upstreamSockets = new Set();
  let listening = false;
  let closed = false;
  let closePromise = null;

  const track = (collection, socket) => {
    collection.add(socket);
    socket.once('close', () => collection.delete(socket));
    return socket;
  };

  const server = http.createServer((request, response) => {
    void (async () => {
      let upstream = null;
      let downstreamClosed = request.aborted || response.destroyed;
      const closeDownstream = () => {
        downstreamClosed = true;
        upstream?.destroy();
      };
      request.once('aborted', closeDownstream);
      response.once('close', closeDownstream);
      const decision = await classifyProxyTarget(request.url, policy);
      await new Promise((resolve) => setImmediate(resolve));
      if (downstreamClosed || response.writableEnded) return;
      if (closed) return denyHttp(response, 'Browser proxy is closed');
      if (!decision.allowed) return denyHttp(response, decision.reason);
      if (decision.url.protocol !== 'http:') return denyHttp(response, 'Plain proxy requests must use HTTP');
      const headers = { ...request.headers, host: decision.url.host };
      delete headers['proxy-connection'];
      upstream = http.request({
        hostname: decision.address,
        family: decision.family,
        port: decision.port,
        method: request.method,
        path: `${decision.url.pathname}${decision.url.search}`,
        headers,
        agent: false,
      }, (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(response);
      });
      upstream.on('socket', (socket) => track(upstreamSockets, socket));
      upstream.on('error', () => {
        if (!response.headersSent) response.writeHead(502, { connection: 'close' });
        response.end();
      });
      request.pipe(upstream);
    })().catch(() => denyHttp(response, 'Proxy classification failed'));
  });

  server.on('connection', (socket) => track(downstreamSockets, socket));
  server.on('connect', (request, client, head) => {
    void (async () => {
      let upstream = null;
      let downstreamClosed = client.destroyed;
      client.once('close', () => {
        downstreamClosed = true;
        upstream?.destroy();
      });
      const decision = await classifyProxyTarget(`https://${request.url}`, policy);
      await new Promise((resolve) => setImmediate(resolve));
      if (downstreamClosed) return;
      if (closed) return client.destroy();
      if (!decision.allowed) return denySocket(client, decision.reason);
      upstream = track(upstreamSockets, net.connect({
        host: decision.address,
        family: decision.family,
        port: decision.port,
      }));
      upstream.once('close', () => client.destroy());
      upstream.once('connect', () => {
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length > 0) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      upstream.once('error', () => denySocket(client, 'Upstream connection failed', '502 Bad Gateway'));
    })().catch(() => denySocket(client, 'Proxy classification failed'));
  });

  server.on('upgrade', (request, client, head) => {
    void (async () => {
      let upstream = null;
      let downstreamClosed = client.destroyed;
      client.once('close', () => {
        downstreamClosed = true;
        upstream?.destroy();
      });
      const decision = await classifyProxyTarget(request.url, policy);
      await new Promise((resolve) => setImmediate(resolve));
      if (downstreamClosed) return;
      if (closed) return client.destroy();
      if (!decision.allowed) return denySocket(client, decision.reason);
      if (decision.url.protocol !== 'ws:') return denySocket(client, 'Plain upgrades must use WebSocket');
      upstream = track(upstreamSockets, net.connect({
        host: decision.address,
        family: decision.family,
        port: decision.port,
      }));
      upstream.once('close', () => client.destroy());
      upstream.once('connect', () => {
        const lines = [`${request.method} ${decision.url.pathname}${decision.url.search} HTTP/${request.httpVersion}`];
        for (let index = 0; index < request.rawHeaders.length; index += 2) {
          const name = request.rawHeaders[index];
          const value = name.toLowerCase() === 'host' ? decision.url.host : request.rawHeaders[index + 1];
          lines.push(`${name}: ${value}`);
        }
        upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (head.length > 0) upstream.write(head);
        client.pipe(upstream).pipe(client);
      });
      upstream.once('error', () => denySocket(client, 'Upstream connection failed', '502 Bad Gateway'));
    })().catch(() => denySocket(client, 'Proxy classification failed'));
  });

  return {
    get address() {
      const value = server.address();
      return value && typeof value === 'object' ? `127.0.0.1:${value.port}` : null;
    },
    async listen() {
      if (listening) return this.address;
      if (closed) throw new Error('Browser proxy is closed');
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      listening = true;
      return this.address;
    },
    close() {
      if (closePromise) return closePromise;
      closed = true;
      closePromise = new Promise((resolve) => {
        if (listening) server.close(resolve);
        else resolve();
        for (const socket of downstreamSockets) socket.destroy();
        for (const socket of upstreamSockets) socket.destroy();
        listening = false;
      });
      return closePromise;
    },
  };
};
