import assert from 'node:assert/strict';
import test from 'node:test';
import { networkGrants, originGrants, parseConfig } from '../src/config.js';

test('defaults to no private origin grants', () => {
  const config = parseConfig({});

  assert.deepEqual(config, { chromePath: null, allowedOrigins: [], allowedNetworks: [] });
  assert.deepEqual(originGrants(config.allowedOrigins), []);
});

test('normalizes explicit origins into exact host and port grants', () => {
  const config = parseConfig({
    chromePath: '/opt/chrome',
    allowedOrigins: ['http://localhost:3000', 'https://device.example'],
  });

  assert.equal(config.chromePath, '/opt/chrome');
  assert.deepEqual(originGrants(config.allowedOrigins), [
    { host: 'localhost', port: 3000, protocol: 'http:' },
    { host: 'device.example', port: 443, protocol: 'https:' },
  ]);
});

test('rejects allowlist entries that are not exact http origins', () => {
  assert.throws(
    () => parseConfig({ allowedOrigins: ['http://localhost:3000/private'] }),
    /must be an http\(s\) origin/,
  );
  assert.throws(
    () => parseConfig({ allowedOrigins: ['file:///tmp/page.html'] }),
    /must be an http\(s\) origin/,
  );
});

test('parses private network blocks with explicit ports and ranges', () => {
  const config = parseConfig({ allowedNetworks: [{ cidr: '192.168.1.0/24', ports: [3000, '5173-5199', '8080'] }] });
  const [grant] = networkGrants(config.allowedNetworks);

  assert.deepEqual(config.allowedNetworks[0].ports, [[3000, 3000], [5173, 5199], [8080, 8080]]);
  assert.equal(grant.block.check('192.168.1.20', 'ipv4'), true);
  assert.equal(grant.block.check('192.168.2.20', 'ipv4'), false);
});

test('rejects network blocks that are public, too broad, or missing explicit ports', () => {
  for (const network of [
    { cidr: '8.8.8.0/24', ports: [3000] },
    { cidr: '10.0.0.0/7', ports: [3000] },
    { cidr: '192.168.1.0/24' },
    { cidr: '192.168.1.0/24', ports: ['*'] },
    { cidr: '192.168.1.0/24', ports: ['3000-2000'] },
  ]) {
    assert.throws(() => parseConfig({ allowedNetworks: [network] }), /config\.allowedNetworks\[0\]/);
  }
});
