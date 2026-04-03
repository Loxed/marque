'use strict';

const { createDirectiveNode } = require('../directives/registry');

function buildAST(tokens) {
  const { nodes } = consumeBlock(tokens, 0, tokens.length, null);
  return { type: 'root', children: nodes };
}

function consumeBlock(tokens, start, end, openTag) {
  const nodes   = [];
  let i         = start;
  let textBuf   = [];

  const flushText = () => {
    if (textBuf.length) {
      nodes.push({ type: 'markdown', content: dedentLines(textBuf).join('\n') });
      textBuf = [];
    }
  };

  while (i < end) {
    const tok = tokens[i];

    if (tok.type === 'close') {
      if (openTag && tok.tag === openTag)          { flushText(); return { nodes, next: i + 1 }; }
      if (!openTag)                                { i++; continue; } // stray close at root
      flushText(); return { nodes, next: i };                          // belongs to outer block
    }

    if (tok.type === 'divider') {
      flushText();
      nodes.push({ type: 'divider' });
      i++; continue;
    }

    if (tok.type === 'open') {
      flushText();
      const inner = consumeBlock(tokens, i + 1, end, tok.tag);
      i = inner.next;
      nodes.push(createDirectiveNode(tok.tag, tok.mods, tok.name, inner.nodes));
      continue;
    }

    if (tok.type === 'hr_or_fm') {
      flushText();
      nodes.push({ type: 'hr' });
      i++; continue;
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
    const indent = (line.match(/^[ \t]*/) || [''])[0].length;
    if (indent < minIndent) minIndent = indent;
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) return lines;
  return lines.map(line => {
    const indent = (line.match(/^[ \t]*/) || [''])[0].length;
    return indent >= minIndent ? line.slice(minIndent) : line;
  });
}

module.exports = { buildAST, dedentLines };