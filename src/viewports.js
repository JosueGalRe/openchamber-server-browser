const PRESETS = Object.freeze({
  mobile: Object.freeze({ width: 390, height: 844, mobile: true }),
  tablet: Object.freeze({ width: 768, height: 1024, mobile: false }),
  desktop: Object.freeze({ width: 1440, height: 900, mobile: false }),
});

export const MAX_VIEWPORT_DIMENSION = 3840;

export const presetViewport = (mode) => PRESETS[mode] ?? null;

export const viewportSummary = ({ width, height }) => {
  for (const [mode, preset] of Object.entries(PRESETS)) {
    if (preset.width === width && preset.height === height) return { mode, width, height };
  }
  return { mode: 'custom', width, height };
};

const cssDimension = (value, devicePixelRatio) => Math.min(
  MAX_VIEWPORT_DIMENSION,
  Math.max(1, Math.round(value / devicePixelRatio)),
);

// The host measures the panel in device pixels; pages lay out in CSS pixels.
export const cssSize = ({ width, height }, devicePixelRatio) => ({
  width: cssDimension(width, devicePixelRatio),
  height: cssDimension(height, devicePixelRatio),
});

export const applyViewport = (cdp, sessionId, viewport) => cdp.sendSession(sessionId, 'Emulation.setDeviceMetricsOverride', {
  width: viewport.width,
  height: viewport.height,
  deviceScaleFactor: 1,
  mobile: viewport.mobile,
});
