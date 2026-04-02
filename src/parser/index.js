'use strict';

const { tokenize }  = require('./tokenizer');
const { buildAST }  = require('./ast');

/** Parse a .mq source string into an AST. */
function parse(src) {
  const tokens = tokenize(String(src || '').split('\n'));
  return buildAST(tokens);
}

/**
 * Strip YAML-style frontmatter from source.
 * Returns `{ fm: Record<string,string>, body: string }`.
 */
function extractFrontmatter(src) {
  const fm = {};
  if (!src.startsWith('---')) return { fm, body: src };

  const end = src.indexOf('\n---', 3);
  if (end === -1) return { fm, body: src };

  for (const rawLine of src.slice(4, end).trim().split('\n')) {
    const m = rawLine.trim().match(/^([\w-]+):\s*(.*)$/);
    if (m) fm[m[1].trim()] = m[2].trim();
  }

  return { fm, body: src.slice(end + 4).trim() };
}

module.exports = { parse, extractFrontmatter };