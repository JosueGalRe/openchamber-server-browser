import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

const parseAllowedOrigin = (value, index) => {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    throw new Error(`config.allowedOrigins[${index}] must be a non-empty origin`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`config.allowedOrigins[${index}] is not a valid URL origin`);
  }
  if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`config.allowedOrigins[${index}] must be an http(s) origin without credentials, path, query, or hash`);
  }
  return url.origin;
};

export const extensionRootFrom = (entryUrl) => path.resolve(path.dirname(fileURLToPath(entryUrl)), '..');

export const parseConfig = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('config.json must contain an object');
  }
  const chromePath = value.chromePath;
  if (chromePath !== undefined && (typeof chromePath !== 'string' || chromePath.trim().length === 0)) {
    throw new Error('config.chromePath must be a non-empty string when provided');
  }
  if (value.allowedOrigins !== undefined && !Array.isArray(value.allowedOrigins)) {
    throw new Error('config.allowedOrigins must be an array');
  }
  const allowedOrigins = (value.allowedOrigins ?? []).map(parseAllowedOrigin);
  return Object.freeze({
    chromePath: chromePath?.trim() ?? null,
    allowedOrigins: Object.freeze([...new Set(allowedOrigins)]),
  });
};

export const loadConfig = ({ entryUrl = import.meta.url, configPath } = {}) => {
  const resolvedPath = configPath ?? path.join(extensionRootFrom(entryUrl), 'config.json');
  let value = {};
  try {
    value = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON in ${resolvedPath}: ${error.message}`);
    if (error?.code !== 'ENOENT') throw error;
  }
  return Object.freeze({ ...parseConfig(value), configPath: resolvedPath });
};

export const originGrants = (allowedOrigins) => allowedOrigins.map((origin) => {
  const url = new URL(origin);
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    protocol: url.protocol,
  };
});
