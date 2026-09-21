import net from 'node:net';
import { createPolicyProxy } from '../../src/policy-proxy.js';

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

const close = (server) => new Promise((resolve) => server.close(resolve));
const chunk = Buffer.alloc(256 * 1024, 65);

const upstream = net.createServer((socket) => {
  socket.on('error', () => {});
  const burst = () => {
    if (socket.destroyed) return;
    for (let index = 0; index < 32; index += 1) socket.write(chunk);
    setImmediate(burst);
  };
  burst();
});
const upstreamPort = await listen(upstream);
const proxy = createPolicyProxy({ grants: [{ host: '127.0.0.1', port: upstreamPort, protocol: 'https:' }] });
const proxyAddress = await proxy.listen();
const proxyPort = Number(proxyAddress.split(':').at(-1));

for (let iteration = 0; iteration < 50; iteration += 1) {
  await new Promise((resolve) => {
    const client = net.connect({ host: '127.0.0.1', port: proxyPort });
    client.on('error', resolve);
    client.on('close', resolve);
    client.once('data', () => client.destroy());
    client.write(`CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\nHost: 127.0.0.1:${upstreamPort}\r\n\r\n`);
  });
}

await proxy.close();
await close(upstream);
console.log('completed without uncaught socket error');
