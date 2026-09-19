const PRESETS = Object.freeze({
  mobile: Object.freeze({ width: 390, height: 844, mobile: true }),
  tablet: Object.freeze({ width: 768, height: 1024, mobile: false }),
  desktop: Object.freeze({ width: 1440, height: 900, mobile: false }),
});

export const viewportForMode = (mode) => mode === 'fill' ? null : PRESETS[mode];

export const viewportSummary = (viewport) => {
  if (viewport === null) return { mode: 'fill', width: null, height: null };
  for (const [mode, preset] of Object.entries(PRESETS)) {
    if (preset.width === viewport.width && preset.height === viewport.height) {
      return { mode, width: viewport.width, height: viewport.height };
    }
  }
  return { mode: 'custom', width: viewport.width, height: viewport.height };
};

export const applyViewport = async (cdp, sessionId, viewport) => {
  if (viewport === null) {
    await cdp.sendSession(sessionId, 'Emulation.clearDeviceMetricsOverride');
    return;
  }
  await cdp.sendSession(sessionId, 'Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
};
