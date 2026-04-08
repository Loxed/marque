'use strict';

const { tokenize }  = require('./tokenizer');
const { buildAST }  = require('./ast');
const { parseFlatToml } = require('../utils/toml');

/** Parse a .mq source string into an AST. */
function parse(src) {
  const tokens = tokenize(String(src || '').split('\n'));
  return buildAST(tokens);
}

/**
 * Strip frontmatter from source.
 * Preferred syntax is TOML between `+++` fences.
 * Legacy YAML-style `---` frontmatter is still accepted for compatibility.
 */
function extractFrontmatter(src) {
  const source = String(src || '');
  const toml = extractDelimitedFrontmatter(source, '+++', (raw) => parseFlatToml(raw, { allowBareStrings: true }));
  if (toml) return toml;

  const legacy = extractDelimitedFrontmatter(source, '---', parseLegacyFrontmatter);
  if (legacy) return legacy;

  return { fm: {}, body: source, bodyStartLine: 1 };
}

function extractDelimitedFrontmatter(src, fence, parseMeta) {
  const lines = String(src || '').split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== fence) return null;

  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === fence) {
      endIndex = i;
      break;
    }
  }

  if (endIndex === -1) return null;

  const fmRaw = lines.slice(1, endIndex).join('\n');
  const bodyLines = lines.slice(endIndex + 1);
  let skipped = 0;

  while (bodyLines.length && !bodyLines[0].trim()) {
    bodyLines.shift();
    skipped += 1;
  }

  return {
    fm: typeof parseMeta === 'function' ? parseMeta(fmRaw) : {},
    body: bodyLines.join('\n').trim(),
    bodyStartLine: endIndex + 2 + skipped,
  };
}

function parseLegacyFrontmatter(source) {
  const fm = {};

  for (const rawLine of String(source || '').split(/\r?\n/)) {
    const m = rawLine.trim().match(/^([\w-]+):\s*(.*)$/);
    if (m) fm[m[1].trim()] = m[2].trim();
  }

  return fm;
}

module.exports = { parse, extractFrontmatter };
