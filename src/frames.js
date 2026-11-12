// The frames inside a tab, for agent actions. A same-site iframe shares its
// page's renderer and shows in the page's frame tree. A cross-site iframe runs
// in a process of its own: Chrome lists it as an `iframe` target whose
// `parentId` is the target that embeds it, and it needs a session of its own.
// Scripts run in an isolated world of each frame, so the page's own scripts
// cannot see or change them.

const WORLD_NAME = 'openchamber-agent-frames';
const FRAME_KEY_LENGTH = 8;
// Frames beyond these are left out of a snapshot, and the result says so.
export const MAX_FRAMES = 12;
const MAX_FRAME_DEPTH = 6;

// `frame:<key> >> <css>` addresses an element inside a frame. The key is the
// start of Chrome's frame id, which stays the same while the frame lives.
const FRAME_SELECTOR = /^frame:([0-9A-F]{4,32})\s*>>\s*([\s\S]+)$/i;

export const frameKey = (frameId) => String(frameId).slice(0, FRAME_KEY_LENGTH).toUpperCase();

export const frameSelector = (key, selector) => `frame:${key} >> ${selector}`;

export const parseFrameSelector = (selector) => {
  const match = typeof selector === 'string' ? FRAME_SELECTOR.exec(selector.trim()) : null;
  return match ? { key: match[1].toUpperCase(), selector: match[2].trim() } : null;
};

// Sessions to cross-site frames, per CDP connection and frame target. Chrome
// ends a session when its frame goes away; a stale one is attached again.
const attachedSessions = new WeakMap();

const sessionsOf = (cdp) => {
  let sessions = attachedSessions.get(cdp);
  if (!sessions) {
    sessions = new Map();
    attachedSessions.set(cdp, sessions);
  }
  return sessions;
};

const attachFrameTarget = async (cdp, targetId) => {
  const sessions = sessionsOf(cdp);
  const known = sessions.get(targetId);
  if (known) {
    try {
      await cdp.sendSession(known, 'Runtime.evaluate', { expression: '0', returnByValue: true });
      return known;
    } catch {
      sessions.delete(targetId);
    }
  }
  const sessionId = await cdp.attach(targetId);
  sessions.set(targetId, sessionId);
  return sessionId;
};

const walkTree = (node, visit, depth = 0) => {
  if (!node?.frame || depth > MAX_FRAME_DEPTH) return;
  visit(node.frame, depth);
  for (const child of node.childFrames ?? []) walkTree(child, visit, depth + 1);
};

// Every frame below the tab's main frame, in document order per process, each
// with the session that can run scripts in it.
export const listFrames = async (page) => {
  const frames = [];
  const seen = new Set();
  const addTree = async (sessionId, ownerTargetId, includeRoot) => {
    const { frameTree } = await page.cdp.sendSession(sessionId, 'Page.getFrameTree');
    walkTree(frameTree, (frame, depth) => {
      if ((depth === 0 && !includeRoot) || seen.has(frame.id)) return;
      seen.add(frame.id);
      frames.push({ id: frame.id, key: frameKey(frame.id), url: String(frame.url ?? ''), sessionId, ownerTargetId });
    });
  };
  await addTree(page.sessionId, page.targetId, false);

  let targets = [];
  try {
    targets = (await page.cdp.send('Target.getTargets')).targetInfos ?? [];
  } catch {}
  const iframes = targets.filter((info) => info.type === 'iframe');
  const owners = [page.targetId];
  for (let index = 0; index < owners.length && frames.length < MAX_FRAMES * 2; index += 1) {
    for (const info of iframes.filter((candidate) => candidate.parentId === owners[index])) {
      if (owners.includes(info.targetId)) continue;
      try {
        const sessionId = await attachFrameTarget(page.cdp, info.targetId);
        await addTree(sessionId, info.targetId, true);
        owners.push(info.targetId);
      } catch {}
    }
  }
  return frames;
};

export const findFrame = async (page, key) => {
  const frames = await listFrames(page);
  const matches = frames.filter((frame) => frame.key.startsWith(key) || frame.id.toUpperCase().startsWith(key));
  if (matches.length === 0) throw new Error(`No frame ${key} on this page any more; take a new browser.snapshot`);
  if (matches.length > 1) throw new Error(`More than one frame starts with ${key}; use more of its id`);
  return matches[0];
};

export const evaluateInFrame = async (page, frame, expression) => {
  const world = await page.cdp.sendSession(frame.sessionId, 'Page.createIsolatedWorld', {
    frameId: frame.id,
    worldName: WORLD_NAME,
  });
  const response = await page.cdp.sendSession(frame.sessionId, 'Runtime.evaluate', {
    expression,
    contextId: world.executionContextId,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Frame script failed');
  }
  return response.result?.value ?? null;
};
