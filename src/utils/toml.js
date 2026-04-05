'use strict';

function parseFlatToml(source, options = {}) {
  const allowBareStrings = options.allowBareStrings === true;
  const out = {};
  const lines = String(source || '').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;

    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) continue;

    const key = match[1].trim();
    const rawValue = match[2].trim();
    const value = parseTomlValue(rawValue, { allowBareStrings });
    if (value !== undefined) out[key] = value;
  }

  return out;
}

function parseTomlValue(rawValue, options = {}) {
  const allowBareStrings = options.allowBareStrings === true;
  const text = String(rawValue || '').trim();
  if (!text) return '';

  if (/^"(?:[^"\\]|\\.)*"$/.test(text)) {
    return decodeDoubleQuotedString(text.slice(1, -1));
  }

  if (/^'(?:[^']*)'$/.test(text)) {
    return text.slice(1, -1);
  }

  if (/^(true|false)$/i.test(text)) {
    return /^true$/i.test(text);
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    const num = Number(text);
    return Number.isFinite(num) ? num : undefined;
  }

  if (allowBareStrings) {
    return text;
  }

  return undefined;
}

function stripTomlComment(line) {
  let out = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < String(line || '').length; i++) {
    const ch = line[i];

    if (quote === '"') {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }

    if (quote === '\'') {
      out += ch;
      if (ch === '\'') quote = null;
      continue;
    }

    if (ch === '#') break;
    if (ch === '"' || ch === '\'') quote = ch;
    out += ch;
  }

  return out;
}

function decodeDoubleQuotedString(value) {
  return String(value || '').replace(/\\(["\\bnfrt])/g, (_, ch) => {
    switch (ch) {
      case '"': return '"';
      case '\\': return '\\';
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      default: return ch;
    }
  });
}

module.exports = { parseFlatToml };
