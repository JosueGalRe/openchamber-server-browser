// HTTP authentication (Basic, Digest, NTLM) for the pages the service opens.
// Chrome runs headless and shows no sign-in dialog, so the service answers the
// challenge itself, with credentials from config.json or ones the user handed
// over through the intake route. Credentials stay in this process's memory and
// never reach a page, the agent, or a log.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const BASIC_AUTH_PATH_PREFIX = '/basic-auth/';
export const BASIC_AUTH_USERNAME_ENV = 'SERVER_BROWSER_USERNAME';
export const BASIC_AUTH_PASSWORD_ENV = 'SERVER_BROWSER_PASSWORD';
const CHALLENGE_TTL_MS = 15 * 60_000;
const MAX_CHALLENGES = 32;
const FIELD_MAX = 1_024;
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);

export const parseBasicAuthEntry = (value, index) => {
  const label = `config.basicAuth[${index}]`;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object with origin, username and passwordFile`);
  }
  let url;
  try {
    url = new URL(value.origin);
  } catch {
    throw new Error(`${label}.origin is not a valid URL origin`);
  }
  if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${label}.origin must be an http(s) origin without credentials, path, query, or hash`);
  }
  if (typeof value.username !== 'string' || value.username.length === 0 || value.username.length > FIELD_MAX) {
    throw new Error(`${label}.username must be a non-empty string`);
  }
  if (typeof value.passwordFile !== 'string' || !path.isAbsolute(value.passwordFile)) {
    throw new Error(`${label}.passwordFile must be an absolute path`);
  }
  return Object.freeze({ origin: url.origin, username: value.username, passwordFile: value.passwordFile });
};

const originOf = (value) => {
  try {
    const url = new URL(value);
    return HTTP_PROTOCOLS.has(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
};

// The realm is text the server chose; it goes to the agent only as a short,
// quoted label.
export const safeRealm = (value) => String(value ?? '').replace(/[^\p{L}\p{N} ._:@/-]/gu, '').trim().slice(0, 80);

const readPasswordFile = (file) => {
  try {
    return fs.readFileSync(file, 'utf8').replace(/\r?\n$/, '');
  } catch {
    return null;
  }
};

export const createBasicAuthStore = ({ entries = [], now = () => Date.now() } = {}) => {
  const given = new Map();
  const challenges = new Map();
  let intakeBase = null;

  const prune = () => {
    const time = now();
    for (const [id, challenge] of challenges) if (challenge.expires <= time) challenges.delete(id);
  };

  return {
    // The service's own loopback address, once it listens.
    setIntakeBase(base) {
      intakeBase = base;
    },
    lookup(origin) {
      const key = originOf(origin);
      if (!key) return null;
      const handed = given.get(key);
      if (handed) return { ...handed, from: 'user' };
      const entry = entries.find((candidate) => candidate.origin === key);
      if (!entry) return null;
      const password = readPasswordFile(entry.passwordFile);
      return password === null ? null : { username: entry.username, password, from: 'config' };
    },
    // Chrome asked again after the stored credentials, so the server refused them.
    reject(origin) {
      const key = originOf(origin);
      if (key) given.delete(key);
    },
    // A one-time address that takes credentials for this origin. Whoever knows
    // it can only hand credentials over, never read any.
    challenge(origin) {
      const key = originOf(origin);
      if (!key || !intakeBase) return null;
      prune();
      for (const [id, challenge] of challenges) {
        if (challenge.origin === key) return { id, url: `${intakeBase}${BASIC_AUTH_PATH_PREFIX}${id}` };
      }
      if (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value);
      const id = crypto.randomBytes(32).toString('base64url');
      challenges.set(id, { origin: key, expires: now() + CHALLENGE_TTL_MS });
      return { id, url: `${intakeBase}${BASIC_AUTH_PATH_PREFIX}${id}` };
    },
    accept(id, body) {
      prune();
      const challenge = challenges.get(id);
      if (!challenge) return null;
      const { username, password } = body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string') return null;
      if (username.length === 0 || username.length > FIELD_MAX || password.length > FIELD_MAX) return null;
      challenges.delete(id);
      given.set(challenge.origin, { username, password });
      return challenge.origin;
    },
  };
};

// The text the agent reads in consoleProblems when a page asks for a sign-in
// that the service cannot answer.
export const authNoticeText = ({ origin, realm, intakeUrl, nodePath, entryPath, rejected }) => {
  const realmText = realm ? ` (realm "${realm}")` : '';
  const first = rejected
    ? `${origin}${realmText} refused the username and password the browser had.`
    : `${origin}${realmText} asks for a username and password (HTTP authentication), and the browser has none for it.`;
  if (!intakeUrl) return `${first} Add it to basicAuth in the extension's config.json.`;
  return `${first} Ask the user for them with the openchamber_secret tool, action secret.run: program ${JSON.stringify(nodePath)}, `
    + `args ${JSON.stringify([entryPath, 'basic-auth', intakeUrl])}, inputs with env ${BASIC_AUTH_USERNAME_ENV} and ${BASIC_AUTH_PASSWORD_ENV}. `
    + 'Then open the page again. Never ask for the password in the chat.';
};

// `node service/main.js basic-auth <intake url>`: what secret.run runs. It
// reads the credentials from its environment and hands them to the service.
export const runBasicAuthCommand = async (args, env = process.env) => {
  const [intakeUrl] = args;
  let url;
  try {
    url = new URL(intakeUrl);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.pathname.startsWith(BASIC_AUTH_PATH_PREFIX)) {
    console.error('Usage: basic-auth <the http://127.0.0.1 address from the browser notice>');
    return 2;
  }
  const username = env[BASIC_AUTH_USERNAME_ENV];
  const password = env[BASIC_AUTH_PASSWORD_ENV] ?? '';
  if (!username) {
    console.error(`${BASIC_AUTH_USERNAME_ENV} is empty`);
    return 2;
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).catch((error) => ({ ok: false, status: 0, error }));
  if (response.ok) {
    console.log('The browser has the credentials. Open the page again.');
    return 0;
  }
  console.error(response.status === 404
    ? 'That address expired or was used. Open the page again for a new one.'
    : `The browser service did not answer (${response.status || response.error?.message}).`);
  return 1;
};
