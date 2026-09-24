const STYLE_TEXT = `
select:not([multiple]):not([size]),
select:not([multiple])[size="1"],
select:not([multiple]):not([size])::picker(select),
select:not([multiple])[size="1"]::picker(select) {
  appearance: base-select !important;
}
`;

const frameIds = (node) => [
  node.frame.id,
  ...(node.childFrames ?? []).flatMap(frameIds),
];

const messageFor = (error) => {
  const detail = error instanceof Error && error.message.trim() ? ` ${error.message}` : '';
  return `Native select compatibility is unavailable on this page.${detail}`;
};

export const createNativeSelectCompatibility = ({ ensurePage, reportError }) => {
  const styleSheets = new Map();
  let enabled = false;
  let error = '';
  let queue = Promise.resolve();

  const enqueue = (operation) => {
    const pending = queue.catch(() => {}).then(operation);
    queue = pending;
    return pending;
  };

  const clearOwnedStyles = async (page) => {
    let failure = null;
    for (const [frameId, styleSheetId] of styleSheets) {
      try {
        await page.cdp.sendSession(page.sessionId, 'CSS.setStyleSheetText', { styleSheetId, text: '' });
        styleSheets.delete(frameId);
      } catch (cause) {
        if (/style.?sheet.*not found/i.test(String(cause))) styleSheets.delete(frameId);
        else failure ??= cause;
      }
    }
    if (failure) throw failure;
  };

  const addFrameStyle = async (page, frameId) => {
    if (styleSheets.has(frameId)) return;
    const created = await page.cdp.sendSession(page.sessionId, 'CSS.createStyleSheet', { frameId });
    const styleSheetId = created.styleSheetId;
    styleSheets.set(frameId, styleSheetId);
    await page.cdp.sendSession(page.sessionId, 'CSS.setStyleSheetText', {
      styleSheetId,
      text: STYLE_TEXT,
    });
  };

  const fail = async (page, cause) => {
    enabled = false;
    error = messageFor(cause);
    await clearOwnedStyles(page).catch(() => {});
    reportError(error);
    throw new Error(error, { cause });
  };

  const installCurrentFrames = async (page) => {
    const support = await page.cdp.sendSession(page.sessionId, 'Runtime.evaluate', {
      expression: `CSS.supports('appearance', 'base-select')`,
      returnByValue: true,
    });
    if (support.result?.value !== true) throw new Error('This Chrome version does not support appearance: base-select');
    await page.cdp.sendSession(page.sessionId, 'DOM.enable');
    await page.cdp.sendSession(page.sessionId, 'CSS.enable');
    const tree = await page.cdp.sendSession(page.sessionId, 'Page.getFrameTree');
    if (!tree.frameTree?.frame?.id) throw new Error('Chrome returned no document frame');
    for (const frameId of frameIds(tree.frameTree)) await addFrameStyle(page, frameId);
  };

  return {
    get enabled() {
      return enabled;
    },
    get error() {
      return error;
    },
    setEnabled(nextEnabled) {
      return enqueue(async () => {
        const page = await ensurePage();
        if (!nextEnabled) {
          try {
            await clearOwnedStyles(page);
            enabled = false;
            error = '';
          } catch (cause) {
            await fail(page, cause);
          }
          return;
        }
        enabled = true;
        try {
          await installCurrentFrames(page);
          error = '';
        } catch (cause) {
          await fail(page, cause);
        }
      });
    },
    frameNavigated(frameId) {
      styleSheets.delete(frameId);
      if (!enabled) return;
      void enqueue(async () => {
        if (!enabled) return;
        const page = await ensurePage();
        try {
          await addFrameStyle(page, frameId);
          error = '';
        } catch (cause) {
          await fail(page, cause);
        }
      }).catch(() => {});
    },
    frameDetached(frameId) {
      styleSheets.delete(frameId);
    },
    whenIdle() {
      return queue;
    },
  };
};
