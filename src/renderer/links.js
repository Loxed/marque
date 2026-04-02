'use strict';

const { escapeAttr } = require('./html');

/**
 * Parse `{!id .cls1 .cls2}` button attribute syntax.
 * Returns `{ className: ' cls1 cls2', id: 'id' | null }`.
 */
function parseButtonAttrs(raw) {
  const text = String(raw || '').trim();
  if (!text) return { className: '', id: null };

  let id = null;
  const classes = [];

  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('!')) {
      const candidate = token.slice(1).trim();
      if (!id && /^[a-z0-9_-]+$/i.test(candidate)) id = candidate;
      continue;
    }
    const cls = token.replace(/^\./, '').trim();
    if (/^[a-z0-9_-]+$/i.test(cls)) classes.push(cls);
  }

  return { className: classes.length ? ` ${classes.join(' ')}` : '', id };
}

/** Convert a `.mq` link href to `.html`, leaving everything else untouched. */
function convertMqHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return raw;

  // External / special: leave untouched
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('#')) return raw;

  const hashIndex  = raw.indexOf('#');
  const queryIndex = raw.indexOf('?');
  let splitIndex   = -1;
  if (hashIndex >= 0 && queryIndex >= 0) splitIndex = Math.min(hashIndex, queryIndex);
  else splitIndex = Math.max(hashIndex, queryIndex);

  const pathPart = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const suffix   = splitIndex >= 0 ? raw.slice(splitIndex) : '';

  if (!/\.mq$/i.test(pathPart)) return raw;
  return `${pathPart.slice(0, -3)}.html${suffix}`;
}

function resolveHref(href, opts = {}) {
  if (opts && typeof opts.resolveHref === 'function') {
    try { return opts.resolveHref(href); } catch (_) { /* fallback */ }
  }
  return convertMqHref(href);
}

/** Rewrite all `href="..."` values in an HTML string through resolveHref. */
function normalizeAnchorHrefs(html, opts = {}) {
  return String(html || '').replace(
    /(<a\b[^>]*\shref=")([^"]+)(")/gi,
    (_, head, href, tail) => `${head}${resolveHref(href, opts)}${tail}`,
  );
}

module.exports = { parseButtonAttrs, convertMqHref, resolveHref, normalizeAnchorHrefs };