import assert from 'node:assert/strict';
import net from 'node:net';
import test from 'node:test';
import { connectCdp } from '../src/cdp-client.js';

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

test('bounds a WebSocket peer that accepts TCP without completing the handshake', async (context) => {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  const port = await listen(server);
  context.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });

  await assert.rejects(
    connectCdp(`ws://127.0.0.1:${port}/devtools/browser/stalled`, { handshakeTimeoutMs: 25 }),
    /timed out|opening handshake/i,
  );
});
