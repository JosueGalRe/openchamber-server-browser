const MAX_TEXT_CHARS = 6_000;
const MAX_ELEMENTS = 120;
const MAX_LABEL_CHARS = 80;
const MAX_OPTION_COUNT = 32;

const HELPERS = `
  var MAX_ELEMENTS = ${MAX_ELEMENTS};
  var MAX_LABEL_CHARS = ${MAX_LABEL_CHARS};
  var MAX_OPTION_COUNT = ${MAX_OPTION_COUNT};
  var visible = function (element) {
    var rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    var style = window.getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) !== 0;
  };
  var label = function (element) {
    var aria = element.getAttribute('aria-label');
    if (aria) return aria.trim();
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    if (text) return text.slice(0, MAX_LABEL_CHARS);
    var value = element.getAttribute('value');
    if (value) return String(value).slice(0, MAX_LABEL_CHARS);
    var placeholder = element.getAttribute('placeholder');
    return placeholder ? placeholder.trim().slice(0, MAX_LABEL_CHARS) : '';
  };
  var boundedText = function (value) {
    var text = String(value);
    if (text.length <= MAX_LABEL_CHARS) return { value: text, truncated: false };
    var end = MAX_LABEL_CHARS;
    var last = text.charCodeAt(end - 1);
    if (last >= 0xD800 && last <= 0xDBFF) end -= 1;
    return { value: text.slice(0, end), truncated: true };
  };
  // An explicit label attribute is used verbatim; option text is collapsed like the select shows it.
  var selectOptionLabel = function (option) {
    var explicit = option.getAttribute('label');
    if (explicit !== null) return explicit;
    return String(option.textContent || '').replace(/\\s+/g, ' ').trim();
  };
  var isOptionDisabled = function (element) {
    if (element.disabled === true) return true;
    if (typeof element.matches === 'function' && element.matches(':disabled')) return true;
    for (var parent = element.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'OPTGROUP' && parent.disabled === true) return true;
    }
    return false;
  };
  var unique = function (selector) {
    try { return document.querySelectorAll(selector).length === 1; } catch { return false; }
  };
  var cssPath = function (element) {
    var tag = element.tagName.toLowerCase();
    if (element.id) {
      var byId = '#' + CSS.escape(element.id);
      if (unique(byId)) return byId;
    }
    var attrs = ['data-testid', 'data-test-id', 'data-test', 'name', 'aria-label'];
    for (var a = 0; a < attrs.length; a += 1) {
      var raw = element.getAttribute(attrs[a]);
      if (!raw || String(raw).indexOf('"') !== -1) continue;
      var byAttr = tag + '[' + attrs[a] + '="' + String(raw) + '"]';
      if (unique(byAttr)) return byAttr;
    }
    var parts = [];
    var node = element;
    for (var depth = 0; node && node.nodeType === 1 && depth < 6; depth += 1) {
      var part = node.tagName.toLowerCase();
      var parent = node.parentElement;
      if (!parent) { parts.unshift(part); break; }
      var siblings = Array.prototype.filter.call(parent.children, function (child) {
        return child.tagName === node.tagName;
      });
      if (siblings.length > 1) part += ':nth-of-type(' + (siblings.indexOf(node) + 1) + ')';
      parts.unshift(part);
      node = parent;
    }
    return parts.join(' > ');
  };
  var accessibleName = function (element) {
    var aria = element.getAttribute('aria-label');
    if (aria && aria.trim()) return aria.trim();
    var labelled = element.getAttribute('aria-labelledby');
    if (labelled) {
      var source = document.getElementById(labelled.split(/\\s+/)[0]);
      if (source && (source.innerText || '').trim()) return source.innerText.trim();
    }
    var named = element.getAttribute('title') || element.getAttribute('alt');
    if (named && named.trim()) return named.trim();
    var text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
    return text || String(element.getAttribute('value') || '').trim();
  };
  var findByText = function (needle) {
    var wanted = String(needle).replace(/\\s+/g, ' ').trim().toLowerCase();
    var nodes = document.querySelectorAll('a, button, [role="button"], [role="link"], input[type="submit"], input[type="button"], summary, label');
    var partial = null;
    for (var i = 0; i < nodes.length; i += 1) {
      var element = nodes[i];
      if (!visible(element)) continue;
      var text = label(element).toLowerCase();
      if (text === wanted) return element;
      if (!partial && text.indexOf(wanted) !== -1) partial = element;
    }
    return partial;
  };
`;

export const wrapPageScript = (body) => `(() => {\n${HELPERS}\n${body}\n})()`;

export const buildSnapshotScript = ({ selector } = {}) => wrapPageScript(`
  var scopeSelector = ${JSON.stringify(selector ?? '')};
  var root = document;
  if (scopeSelector) {
    try { root = document.querySelector(scopeSelector); }
    catch { return { ok: false, error: 'Invalid selector: ' + scopeSelector }; }
    if (!root) return { ok: false, error: 'No element matches ' + scopeSelector };
  }
  var interactive = root.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [contenteditable="true"]');
  var elements = [];
  var visibleTotal = 0;
  for (var i = 0; i < interactive.length; i += 1) {
    var element = interactive[i];
    if (!visible(element)) continue;
    visibleTotal += 1;
    if (elements.length >= MAX_ELEMENTS) continue;
    var rect = element.getBoundingClientRect();
    var entry = {
      selector: cssPath(element), tag: element.tagName.toLowerCase(),
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }
    };
    if (rect.bottom > 0 && rect.top < window.innerHeight) entry.inViewport = true;
    var type = element.getAttribute('type'); if (type) entry.type = type;
    var role = element.getAttribute('role'); if (role) entry.role = role;
    var text = label(element); if (text) entry.label = text;
    if (element.disabled === true) entry.disabled = true;
    if (element.tagName === 'SELECT') {
      entry.multiple = element.multiple === true;
      entry.options = [];
      for (var o = 0; o < element.options.length && o < MAX_OPTION_COUNT; o += 1) {
        var option = element.options[o];
        var optionLabel = boundedText(selectOptionLabel(option));
        var optionValue = boundedText(option.value);
        if (optionLabel.truncated || optionValue.truncated) entry.optionsTruncated = true;
        entry.options.push({
          label: optionLabel.value, value: optionValue.value,
          selected: option.selected === true, disabled: isOptionDisabled(option)
        });
      }
      if (element.options.length > MAX_OPTION_COUNT) entry.optionsTruncated = true;
    }
    if (!accessibleName(element)) entry.missingAccessibleName = true;
    elements.push(entry);
  }
  var textRoot = root === document ? document.body : root;
  var raw = textRoot ? (textRoot.innerText || textRoot.textContent || '') : '';
  var text = raw.replace(/\\n{3,}/g, '\\n\\n').trim();
  var result = {
    ok: true, url: String(location.href), title: String(document.title || ''),
    scope: scopeSelector || 'document', scrollY: Math.round(window.scrollY),
    maxScrollY: Math.max(0, Math.round(document.documentElement.scrollHeight - window.innerHeight)),
    text: text.slice(0, ${MAX_TEXT_CHARS}), elements: elements
  };
  if (text.length > ${MAX_TEXT_CHARS}) { result.textTruncated = true; result.textTotalChars = text.length; }
  if (visibleTotal > elements.length) { result.elementsTruncated = true; result.interactiveElementsOnPage = visibleTotal; }
  return result;
`);

export const buildClickScript = ({ selector, text }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector ?? '')};
  var labelText = ${JSON.stringify(text ?? '')};
  var target = null;
  if (selector) {
    try { target = document.querySelector(selector); }
    catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
    if (!target) return { ok: false, error: 'No element matches ' + selector };
  } else {
    target = findByText(labelText);
    if (!target) return { ok: false, error: 'No clickable element has the label ' + labelText };
  }
  if (target.disabled === true) return { ok: false, error: 'Element is disabled' };
  target.scrollIntoView({ block: 'center', inline: 'center' });
  target.click();
  return { ok: true, clicked: cssPath(target), label: label(target), url: String(location.href) };
`);

export const buildTypeScript = ({ selector, value, submit }) => wrapPageScript(`
  var selector = ${JSON.stringify(selector)};
  var value = ${JSON.stringify(value)};
  var target = null;
  try { target = document.querySelector(selector); }
  catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  var editable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  if (!editable) return { ok: false, error: selector + ' is not a text field' };
  if (target.disabled === true || target.readOnly === true) return { ok: false, error: 'Field is not editable' };
  target.scrollIntoView({ block: 'center' }); target.focus();
  if (target.isContentEditable) target.textContent = value;
  else {
    var prototype = target.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (setter && setter.set) setter.set.call(target, value); else target.value = value;
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  if (${submit ? 'true' : 'false'}) {
    var event = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true };
    target.dispatchEvent(new KeyboardEvent('keydown', event));
    target.dispatchEvent(new KeyboardEvent('keyup', event));
    if (target.form && typeof target.form.requestSubmit === 'function') target.form.requestSubmit();
  }
  return { ok: true, selector: cssPath(target), url: String(location.href) };
`);

// Every refusal happens before the selection changes, so a failed select leaves the page as it was.
export const buildSelectScript = ({ selector, label, value }) => {
  const byLabel = typeof label === 'string';
  const criterion = byLabel === (typeof value === 'string') ? '' : byLabel ? 'label' : 'value';
  return wrapPageScript(`
  var selector = ${JSON.stringify(selector ?? '')};
  var criterion = ${JSON.stringify(criterion)};
  var wanted = ${JSON.stringify(byLabel ? label : value ?? '')};
  if (!criterion) return { ok: false, error: 'browser.select requires exactly one of label or value' };
  var target = null;
  try { target = document.querySelector(selector); }
  catch { return { ok: false, error: 'Invalid selector: ' + selector }; }
  if (!target) return { ok: false, error: 'No element matches ' + selector };
  if (!(target instanceof HTMLSelectElement)) return { ok: false, error: selector + ' is not a native HTML select' };
  if (isOptionDisabled(target)) return { ok: false, error: 'The select ' + selector + ' is disabled' };
  if (target.multiple) return { ok: false, error: 'Multiple selects are not supported for browser.select' };
  var matches = [];
  for (var i = 0; i < target.options.length; i += 1) {
    var option = target.options[i];
    if ((criterion === 'label' ? selectOptionLabel(option) : String(option.value)) === wanted) matches.push(option);
  }
  if (matches.length === 0) return { ok: false, error: 'No option in ' + selector + ' has the exact ' + criterion + ' ' + wanted };
  if (matches.length > 1) return { ok: false, error: 'More than one option in ' + selector + ' has the exact ' + criterion + ' ' + wanted };
  var match = matches[0];
  if (isOptionDisabled(match)) return { ok: false, error: 'The matching option in ' + selector + ' is disabled' };
  target.scrollIntoView({ block: 'center' });
  for (var j = 0; j < target.options.length; j += 1) target.options[j].selected = target.options[j] === match;
  if (target.selectedOptions.length !== 1 || target.selectedOptions[0] !== match || target.value !== match.value) {
    return { ok: false, error: 'The option in ' + selector + ' could not be selected' };
  }
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return { ok: true, selector: cssPath(target), label: selectOptionLabel(match), value: String(target.value), url: String(location.href) };
`);
};
