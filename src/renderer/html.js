'use strict';

const hljs = require('highlight.js');

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;') .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Recursively flatten a marked token value to a plain string.
 * Handles strings, numbers, arrays, and token objects.
 */
function readTokenText(value) {
  if (value == null)                       return '';
  if (typeof value === 'string')           return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value))               return value.map(readTokenText).join('');
  if (typeof value === 'object') {
    if (typeof value.text === 'string')   return value.text;
    if (value.text   != null)             return readTokenText(value.text);
    if (typeof value.raw === 'string')    return value.raw;
    if (typeof value.lang === 'string')   return value.lang;
  }
  return String(value);
}

/** Syntax-highlight `source` for the given language slug. */
function highlightCode(source, lang) {
  const code     = String(source || '');
  const language = String(lang || '').toLowerCase();
  if (!language || language === 'text' || !hljs.getLanguage(language)) return escapeHtml(code);
  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch (_) {
    return escapeHtml(code);
  }
}

/** Inject `snippet` just before the closing `</body>` tag (or append). */
function injectBeforeBodyEnd(html, snippet) {
  const doc = String(html || '');
  return /<\/body>/i.test(doc)
    ? doc.replace(/<\/body>/i, `${snippet}</body>`)
    : `${doc}${snippet}`;
}

module.exports = { escapeAttr, escapeHtml, readTokenText, highlightCode, injectBeforeBodyEnd };