'use strict';

/**
 * Lex .mq source lines into a flat token stream.
 *
 * Token shapes
 *   { type: 'open',     tag, mods: string[], name: string|null }
 *   { type: 'close',    tag, name: string|null }
 *   { type: 'divider' }
 *   { type: 'hr_or_fm' }
 *   { type: 'text',     line: string }
 */
function tokenize(lines) {
  const tokens  = [];
  let inFence   = false;

  for (const raw of lines) {
    const trimmed = raw.trim();

    // fenced code blocks — never parse @ inside them
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      tokens.push({ type: 'text', line: raw });
      continue;
    }
    if (inFence) {
      tokens.push({ type: 'text', line: raw });
      continue;
    }

    // @end tag [name]
    const endM = trimmed.match(/^@end\s+(\w+)(?:\s+(\S+))?$/);
    if (endM) {
      tokens.push({ type: 'close', tag: endM[1], name: endM[2] || null });
      continue;
    }

    // @divider (self-closing)
    if (trimmed === '@divider') {
      tokens.push({ type: 'divider' });
      continue;
    }

    // @tag [.mod .mod ...] [name]
    const openM = trimmed.match(/^@(\w+)((?:\s+\.\w+)*)(?:\s+([^.]\S*))?$/);
    if (openM) {
      const tag  = openM[1];
      const mods = (openM[2] || '').trim().split(/\s+/).filter(Boolean).map(m => m.slice(1));
      const name = openM[3] || null;
      tokens.push({ type: 'open', tag, mods, name });
      continue;
    }

    // frontmatter fence / hr
    if (trimmed === '---') {
      tokens.push({ type: 'hr_or_fm' });
      continue;
    }

    tokens.push({ type: 'text', line: raw });
  }

  return tokens;
}

module.exports = { tokenize };