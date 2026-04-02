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

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const line = idx + 1;
    const trimmed = raw.trim();
    const col = Math.max(1, raw.indexOf('@') + 1 || 1);
    const endCol = Math.max(col, raw.length || col);

    // fenced code blocks — never parse @ inside them
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      tokens.push({ type: 'text', line: raw, lineNo: line });
      continue;
    }
    if (inFence) {
      tokens.push({ type: 'text', line: raw, lineNo: line });
      continue;
    }

    // @end tag [name]
    const endM = trimmed.match(/^@end\s+(\w+)(?:\s+(\S+))?$/);
    if (endM) {
      tokens.push({ type: 'close', tag: endM[1], name: endM[2] || null, lineNo: line, col, endCol });
      continue;
    }

    // @divider  (self-closing)
    if (trimmed === '@divider') {
      tokens.push({ type: 'divider', lineNo: line, col, endCol });
      continue;
    }

    // @tag [.mod .mod ...] [name]
    // mods = .word tokens, name = trailing bare word (no dot)
    const openM = trimmed.match(/^@(\w+)((?:\s+\.\w+)*)(?:\s+([^.]\S*))?$/);
    if (openM) {
      const tag  = openM[1];
      const mods = (openM[2] || '').trim().split(/\s+/).filter(Boolean).map(m => m.slice(1));
      const name = openM[3] || null;
      tokens.push({ type: 'open', tag, mods, name, lineNo: line, col, endCol });
      continue;
    }

    // frontmatter / hr
    if (trimmed === '---') {
      tokens.push({ type: 'hr_or_fm', lineNo: line, col: 1, endCol: 3 });
      continue;
    }

    tokens.push({ type: 'text', line: raw, lineNo: line });
  }

  return tokens;
}

// ── AST builder ────────────────────────────────────────────────────────────

function buildAST(tokens) {
  const { nodes } = consumeBlock(tokens, 0, tokens.length, null, {});
  return { type: 'root', children: nodes };
}

function consumeBlock(tokens, start, end, openTag, options = {}) {
  const nodes = [];
  let i = start;
  let textBuf = [];

  const flushText = () => {
    if (textBuf.length) {
      const start = textBuf[0] && textBuf[0].lineNo ? textBuf[0].lineNo : 1;
      const end = textBuf[textBuf.length - 1] && textBuf[textBuf.length - 1].lineNo
        ? textBuf[textBuf.length - 1].lineNo
        : start;
      nodes.push({
        type: 'markdown',
        content: dedentLines(textBuf.map(t => t.line)).join('\n'),
        loc: { start_line: start, start_col: 1, end_line: end, end_col: 1 },
      });
      textBuf = [];
    }
  };

  while (i < end) {
    const tok = tokens[i];

    if (tok.type === 'close') {
      // Normal close: matching @end <openTag>
      if (openTag && tok.tag === openTag) {
        flushText();
        return { nodes, next: i + 1 };
      }

      // Optional close for standalone @step blocks.
      if (openTag === 'step' && options.implicitStepClose) {
        flushText();
        return { nodes, next: i };
      }

      // Ignore stray closes at root level.
      if (!openTag) {
        i++;
        continue;
      }

      // Unmatched close belongs to an outer block.
      flushText();
      return { nodes, next: i };
    }

    if (tok.type === 'divider') {
      flushText();
      nodes.push({ type: 'divider', loc: locFromToken(tok) });
      i++;
      continue;
    }

    if (tok.type === 'open') {
      if (openTag === 'step' && options.implicitStepClose && tok.tag === 'step') {
        // Allow sibling standalone steps without requiring @end step.
        flushText();
        return { nodes, next: i };
      }

      flushText();
      const innerOptions = {
        implicitStepClose: tok.tag === 'step' && openTag !== 'steps',
      };
      const inner = consumeBlock(tokens, i + 1, end, tok.tag, innerOptions);
      i = inner.next;
      nodes.push(buildNode(tok.tag, tok.mods, tok.name, inner.nodes, tok));
      continue;
    }

    if (tok.type === 'hr_or_fm') {
      flushText();
      nodes.push({ type: 'hr', loc: locFromToken(tok) });
      i++;
      continue;
    }

    textBuf.push(tok);
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

function buildNode(tag, mods, name, children, tok) {
  const mod = mods.join(' ');
  const loc = locFromToken(tok);
  switch (tag) {
    case 'row':     return { type: 'row',     name, children, loc };
    case 'column':  return { type: 'column',  mod, name, children, loc };
    case 'card':    return { type: 'card',    mod, name, children, loc };
    case 'callout': return { type: 'callout', variant: mods[0] || 'info', name, children, loc };
    case 'stat':    return { type: 'stat',    name, children, loc };
    case 'tabs':    return { type: 'tabs',    name, children, loc };
    case 'tab':     return { type: 'tab',     label: name || mods[0] || 'Tab', children, loc };
    case 'steps':   return { type: 'steps',   name, children, loc };
    case 'step':    return { type: 'step',    name, children, loc };
    case 'hero':    return { type: 'hero',    mod, name, children, loc };
    case 'section': return { type: 'section', mod, name, children, loc };
    default:        return { type: 'generic', tag, mod, name, children, loc };
  }
}

function locFromToken(tok) {
  return {
    start_line: (tok && tok.lineNo) || 1,
    start_col: (tok && tok.col) || 1,
    end_line: (tok && tok.lineNo) || 1,
    end_col: (tok && tok.endCol) || ((tok && tok.col) || 1),
  };
}

// ── Frontmatter ────────────────────────────────────────────────────────────

function extractFrontmatter(src) {
  const fm = {};
  if (!src.startsWith('---')) return { fm, body: src, bodyStartLine: 1 };

  const end = src.indexOf('\n---', 3);
  if (end === -1) return { fm, body: src, bodyStartLine: 1 };

  const block = src.slice(4, end).trim();
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) fm[m[1].trim()] = m[2].trim();
  }

  const bodyRaw = src.slice(end + 4);
  const body = bodyRaw.trim();
  const baseStart = src.slice(0, end + 4).split(/\r?\n/).length;
  const leadingWhitespace = (bodyRaw.match(/^\s*/) || [''])[0];
  const leadingBreaks = (leadingWhitespace.match(/\r?\n/g) || []).length;
  const bodyStartLine = baseStart + leadingBreaks;
  return { fm, body, bodyStartLine };
}

module.exports = { parse, extractFrontmatter };
