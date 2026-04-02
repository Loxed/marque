// parser.js — .mq → AST
// Marque DSL — @tag .modifier name / @end tag name syntax

function parse(src) {
  const lines = src.split('\n');
  const tokens = tokenize(lines);
  return buildAST(tokens);
}

// ── Tokeniser ──────────────────────────────────────────────────────────────
//
// Line forms:
//   @tag [.mod ...] [name]   — open block
//   @end tag [name]          — close block
//   @divider                 — self-closing
//   ---                      — hr / frontmatter fence
//   anything else            — raw markdown text

function tokenize(lines) {
  const tokens = [];
  let inFence = false;

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

    // @divider  (self-closing)
    if (trimmed === '@divider') {
      tokens.push({ type: 'divider' });
      continue;
    }

    // @tag [.mod .mod ...] [name]
    // mods = .word tokens, name = trailing bare word (no dot)
    const openM = trimmed.match(/^@(\w+)((?:\s+\.\w+)*)(?:\s+([^.]\S*))?$/);
    if (openM) {
      const tag  = openM[1];
      const mods = (openM[2] || '').trim().split(/\s+/).filter(Boolean).map(m => m.slice(1));
      const name = openM[3] || null;
      tokens.push({ type: 'open', tag, mods, name });
      continue;
    }

    // frontmatter / hr
    if (trimmed === '---') {
      tokens.push({ type: 'hr_or_fm' });
      continue;
    }

    tokens.push({ type: 'text', line: raw });
  }

  return tokens;
}

// ── AST builder ────────────────────────────────────────────────────────────

function buildAST(tokens) {
  const { nodes } = consumeBlock(tokens, 0, tokens.length, null);
  return { type: 'root', children: nodes };
}

function consumeBlock(tokens, start, end, openTag) {
  const nodes = [];
  let i = start;
  let textBuf = [];

  const flushText = () => {
    if (textBuf.length) {
      nodes.push({ type: 'markdown', content: dedentLines(textBuf).join('\n') });
      textBuf = [];
    }
  };

  while (i < end) {
    const tok = tokens[i];

    if (tok.type === 'close') {
      flushText();
      return { nodes, next: i + 1 };
    }

    if (tok.type === 'divider') {
      flushText();
      nodes.push({ type: 'divider' });
      i++;
      continue;
    }

    if (tok.type === 'open') {
      flushText();
      const inner = consumeBlock(tokens, i + 1, end, tok.tag);
      i = inner.next;
      nodes.push(buildNode(tok.tag, tok.mods, tok.name, inner.nodes));
      continue;
    }

    if (tok.type === 'hr_or_fm') {
      flushText();
      nodes.push({ type: 'hr' });
      i++;
      continue;
    }

    textBuf.push(tok.line);
    i++;
  }

  flushText();
  return { nodes, next: i };
}

function dedentLines(lines) {
  let minIndent = Infinity;

  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^[ \t]*/);
    const indent = m ? m[0].length : 0;
    if (indent < minIndent) minIndent = indent;
  }

  if (!Number.isFinite(minIndent) || minIndent === 0) return lines;

  return lines.map(line => {
    const m = line.match(/^[ \t]*/);
    const indent = m ? m[0].length : 0;
    return indent >= minIndent ? line.slice(minIndent) : line;
  });
}

function buildNode(tag, mods, name, children) {
  const mod = mods.join(' ');
  switch (tag) {
    case 'row':     return { type: 'row',     name, children };
    case 'column':  return { type: 'column',  mod, name, children };
    case 'card':    return { type: 'card',    mod, name, children };
    case 'callout': return { type: 'callout', variant: mods[0] || 'info', name, children };
    case 'stat':    return { type: 'stat',    name, children };
    case 'tabs':    return { type: 'tabs',    name, children };
    case 'tab':     return { type: 'tab',     label: name || mods[0] || 'Tab', children };
    case 'steps':   return { type: 'steps',   name, children };
    case 'step':    return { type: 'step',    name, children };
    case 'hero':    return { type: 'hero',    mod, name, children };
    case 'section': return { type: 'section', mod, name, children };
    default:        return { type: 'generic', tag, mod, name, children };
  }
}

// ── Frontmatter ────────────────────────────────────────────────────────────

function extractFrontmatter(src) {
  const fm = {};
  if (!src.startsWith('---')) return { fm, body: src };

  const end = src.indexOf('\n---', 3);
  if (end === -1) return { fm, body: src };

  const block = src.slice(4, end).trim();
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) fm[m[1].trim()] = m[2].trim();
  }

  return { fm, body: src.slice(end + 4).trim() };
}

module.exports = { parse, extractFrontmatter };
