import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import test from 'node:test';
import { classifyProxyTarget, createPolicyProxy } from '../src/policy-proxy.js';

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve) => server.close(resolve));

test('denies private destinations unless their exact host and port are allowed', async () => {
  const lookup = async () => [{ address: '127.0.0.1', family: 4 }];

  const denied = await classifyProxyTarget('http://local.test:4123/', { lookup });
  const allowed = await classifyProxyTarget('http://local.test:4123/', {
    lookup,
    grants: [{ host: 'local.test', port: 4123, protocol: 'http:' }],
  });
  const wrongScheme = await classifyProxyTarget('https://local.test:4123/', {
    lookup,
    grants: [{ host: 'local.test', port: 4123, protocol: 'http:' }],
  });
  const websocket = await classifyProxyTarget('ws://local.test:4123/socket', {
    lookup,
    grants: [{ host: 'local.test', port: 4123, protocol: 'http:' }],
  });

  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'Private or loopback address requires an allowed origin');
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.address, '127.0.0.1');
  assert.equal(wrongScheme.allowed, false);
  assert.equal(websocket.allowed, true);
});

test('allows a private network block only on its listed ports', async () => {
  const block = new net.BlockList();
  block.addSubnet('192.168.1.0', 24, 'ipv4');
  const grants = [{ block, ports: [[3000, 3200]] }];

  const allowed = await classifyProxyTarget('https://192.168.1.20:3100/', { grants });
  const otherPort = await classifyProxyTarget('http://192.168.1.20:22/', { grants });
  const otherNetwork = await classifyProxyTarget('http://192.168.2.20:3100/', { grants });
  const loopback = await classifyProxyTarget('http://localhost:3100/', {
    grants,
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
  });

  assert.equal(allowed.allowed, true);
  assert.deepEqual([otherPort.allowed, otherNetwork.allowed, loopback.allowed], [false, false, false]);
});

test('denies a hostname when any DNS answer is unsafe', async () => {
  const lookup = async () => [
    { address: '93.184.216.34', family: 4 },
    { address: '169.254.169.254', family: 4 },
  ];

  const decision = await classifyProxyTarget('https://rebinding.test/', { lookup });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, 'IPv4 link-local addresses are denied');
});

test('explains how to allow a blocked private origin', async (context) => {
  const proxy = createPolicyProxy({ configPath: '/extension/config.json' });
  const proxyAddress = await proxy.listen();
  context.after(() => proxy.close());
  const proxyPort = Number(proxyAddress.split(':').at(-1));
  const response = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: proxyPort, path: 'http://192.168.1.21:3100/app' }, resolve).once('error', reject);
  });
  response.setEncoding('utf8');
  let body = '';
  for await (const chunk of response) body += chunk;

  assert.equal(response.statusCode, 403);
  assert.match(response.headers['content-type'], /^text\/html/);
  assert.match(response.headers['content-security-policy'], /default-src 'none'/);
  assert.match(body, /<title>Blocked: http:\/\/192\.168\.1\.21:3100<\/title>/);
  assert.ok(body.includes('<code>/extension/config.json</code>'));
  assert.ok(body.includes('[&#34;http://192.168.1.21:3100&#34;]'));
});

test('closes an HTTP upstream when its browser connection aborts', async (context) => {
  const upstreamAccepted = Promise.withResolvers();
  const upstreamClosed = Promise.withResolvers();
  const upstream = http.createServer(() => {});
  upstream.on('connection', (socket) => {
    upstreamAccepted.resolve();
    socket.once('close', () => upstreamClosed.resolve());
  });
  const upstreamPort = await listen(upstream);
  context.after(() => close(upstream));
  const proxy = createPolicyProxy({ grants: [{ host: '127.0.0.1', port: upstreamPort, protocol: 'http:' }] });
  const proxyAddress = await proxy.listen();
  context.after(() => proxy.close());
  const proxyPort = Number(proxyAddress.split(':').at(-1));
  const request = http.request({
    host: '127.0.0.1', port: proxyPort, method: 'GET',
    path: `http://127.0.0.1:${upstreamPort}/never-finishes`,
  });
  request.on('error', () => {});
  request.end();

  await upstreamAccepted.promise;
  request.destroy();

  await upstreamClosed.promise;
  assert.equal(request.destroyed, true);
});

test('does not open an upstream after the browser aborts during DNS lookup', async (context) => {
  const lookupStarted = Promise.withResolvers();
  const lookupResult = Promise.withResolvers();
  let upstreamConnections = 0;
  const upstream = net.createServer((socket) => {
    upstreamConnections += 1;
    socket.destroy();
  });
  const upstreamPort = await listen(upstream);
  context.after(() => close(upstream));
  const proxy = createPolicyProxy({
    grants: [{ host: 'deferred.test', port: upstreamPort, protocol: 'http:' }],
    lookup: async () => {
      lookupStarted.resolve();
      return lookupResult.promise;
    },
  });
  const proxyAddress = await proxy.listen();
  context.after(() => proxy.close());
  const proxyPort = Number(proxyAddress.split(':').at(-1));
  const request = http.request({
    host: '127.0.0.1', port: proxyPort, method: 'GET',
    path: `http://deferred.test:${upstreamPort}/deferred`,
  });
  request.on('error', () => {});
  request.end();

  await lookupStarted.promise;
  const requestClosed = new Promise((resolve) => request.once('close', resolve));
  request.destroy();
  await requestClosed;
  await new Promise((resolve) => setImmediate(resolve));
  lookupResult.resolve([{ address: '127.0.0.1', family: 4 }]);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(upstreamConnections, 0);
});

test('closes a CONNECT upstream when its browser socket closes', async (context) => {
  const upstreamAccepted = Promise.withResolvers();
  const upstreamClosed = Promise.withResolvers();
  const upstream = net.createServer((socket) => {
    upstreamAccepted.resolve();
    socket.once('close', () => upstreamClosed.resolve());
  });
  const upstreamPort = await listen(upstream);
  context.after(() => close(upstream));
  const proxy = createPolicyProxy({ grants: [{ host: '127.0.0.1', port: upstreamPort, protocol: 'https:' }] });
  const proxyAddress = await proxy.listen();
  context.after(() => proxy.close());
  const proxyPort = Number(proxyAddress.split(':').at(-1));
  const client = net.connect({ host: '127.0.0.1', port: proxyPort });
  const connected = Promise.withResolvers();
  client.on('data', (chunk) => {
    if (chunk.toString().includes('200 Connection Established')) connected.resolve();
  });
  client.write(`CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\nHost: 127.0.0.1:${upstreamPort}\r\n\r\n`);

  await upstreamAccepted.promise;
  await connected.promise;
  client.destroy();

  await upstreamClosed.promise;
  assert.equal(client.destroyed, true);
});

test('survives repeated CONNECT aborts while the upstream is writing', { timeout: 10_000 }, async (context) => {
  const fixture = new URL('./fixtures/policy-proxy-epipe.js', import.meta.url);
  const child = spawn(process.execPath, [fixture.pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
  context.after(() => {
    if (child.exitCode === null) child.kill();
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });

  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  assert.equal(code, 0, stderr);
  assert.match(stdout, /completed without uncaught socket error/);
});
