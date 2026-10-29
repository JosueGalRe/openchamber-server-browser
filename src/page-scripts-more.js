import { wrapPageScript } from './page-scripts.js';

const INSPECTED_STYLE_PROPERTIES = [
  'color', 'background-color', 'background-image', 'opacity', 'font-family', 'font-size',
  'font-weight', 'line-height', 'letter-spacing', 'text-align', 'border-radius', 'border-width',
  'border-style', 'border-color', 'box-shadow', 'display', 'position', 'width', 'height',
  'padding', 'margin', 'gap', 'flex-direction', 'justify-content', 'align-items', 'z-index',
  'overflow', 'visibility',
];

export const buildScrollScript = ({ selector, direction }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector ?? '')};
  var direction = ${JSON.stringify(direction ?? '')};
  var settle = function (extra) {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        var maximum = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        var current = Math.round(window.scrollY);
        resolve(Object.assign({
          ok: true, scrollY: current, maxScrollY: Math.round(maximum),
          atTop: current <= 1, atBottom: current >= maximum - 1
        }, extra));
      }); });
    });
  };
  if (selector) {
    var target = null;
    try { target = document.querySelector(selector); }
    catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
    if (!target) return { ok: false, error: 'No element matches ' + selector };
    target.scrollIntoView({ block: 'center', behavior: 'instant' });
    return settle({ scrolledTo: cssPath(target) });
  }
  var page = Math.round(window.innerHeight * 0.85);
  var bottom = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  if (direction === 'down') window.scrollTo({ top: window.scrollY + page, behavior: 'instant' });
  else if (direction === 'up') window.scrollTo({ top: window.scrollY - page, behavior: 'instant' });
  else if (direction === 'top') window.scrollTo({ top: 0, behavior: 'instant' });
  else if (direction === 'bottom') window.scrollTo({ top: bottom, behavior: 'instant' });
  else return { ok: false, error: 'Unknown scroll direction: ' + direction };
  return settle({ direction: direction });
`);

// Resolves once no resource arrived and the DOM tree and text did not change
// for quietMs, or after maxMs. The load event comes while an app still fetches
// its lazy chunks behind a splash. Attribute changes are ignored because hover
// styles change on finished pages; an animation that will end counts, one that
// loops forever or follows scrolling does not.
export const buildQuietScript = ({ quietMs, maxMs }) => wrapPageScript(`
  var quietMs = ${JSON.stringify(quietMs)};
  var maxMs = ${JSON.stringify(maxMs)};
  return new Promise(function (resolve) {
    var startedAt = performance.now();
    var lastChange = startedAt;
    var bump = function () { lastChange = performance.now(); };
    var mutations = new MutationObserver(bump);
    mutations.observe(document, { subtree: true, childList: true, characterData: true });
    var resources = null;
    try {
      resources = new PerformanceObserver(bump);
      resources.observe({ type: 'resource' });
    } catch { resources = null; }
    var animating = function () {
      try {
        if (typeof document.getAnimations !== 'function') return false;
        var list = document.getAnimations();
        for (var i = 0; i < list.length; i += 1) {
          var animation = list[i];
          if (animation.playState !== 'running' && !animation.pending) continue;
          if (animation.timeline && animation.timeline !== document.timeline) continue;
          var timing = animation.effect && animation.effect.getTiming ? animation.effect.getTiming() : null;
          if (timing && timing.iterations === Infinity) continue;
          return true;
        }
      } catch { return false; }
      return false;
    };
    var check = function () {
      var now = performance.now();
      if (animating()) lastChange = now;
      var quiet = now - lastChange >= quietMs;
      if (quiet || now - startedAt >= maxMs) {
        mutations.disconnect();
        if (resources) resources.disconnect();
        resolve({ ok: true, quiet: quiet });
        return;
      }
      setTimeout(check, Math.max(16, Math.min(quietMs - (now - lastChange), maxMs - (now - startedAt))));
    };
    setTimeout(check, quietMs);
  });
`);

export const buildInspectScript = ({ selector }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector)};
  var target = null;
  try { target = document.querySelector(selector); }
  catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  var computed = window.getComputedStyle(target);
  var styles = {};
  var properties = ${JSON.stringify(INSPECTED_STYLE_PROPERTIES)};
  for (var i = 0; i < properties.length; i += 1) {
    var value = computed.getPropertyValue(properties[i]);
    if (value) styles[properties[i]] = String(value).trim();
  }
  var rect = target.getBoundingClientRect();
  return {
    ok: true, selector: cssPath(target), tag: target.tagName.toLowerCase(), label: label(target),
    bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
    inViewport: rect.bottom > 0 && rect.top < window.innerHeight, styles: styles
  };
`);
