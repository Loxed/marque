'use strict';

function buildAST(tokens) {
  const { nodes } = consumeBlock(tokens, 0, tokens.length, null, {});
  return { type: 'root', children: nodes };
}

function consumeBlock(tokens, start, end, openTag, options = {}) {
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
      if (openTag === 'step' && options.implicitStepClose) { flushText(); return { nodes, next: i }; }
      if (!openTag)                                { i++; continue; } // stray close at root
      flushText(); return { nodes, next: i };                          // belongs to outer block
    }

    if (tok.type === 'divider') {
      flushText();
      nodes.push({ type: 'divider' });
      i++; continue;
    }

    if (tok.type === 'open') {
      // Sibling step without @end step — hand back to parent
      if (openTag === 'step' && options.implicitStepClose && tok.tag === 'step') {
        flushText(); return { nodes, next: i };
      }
      flushText();
      const innerOptions = { implicitStepClose: tok.tag === 'step' && openTag !== 'steps' };
      const inner = consumeBlock(tokens, i + 1, end, tok.tag, innerOptions);
      i = inner.next;
      nodes.push(buildNode(tok.tag, tok.mods, tok.name, inner.nodes));
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

module.exports = { buildAST, dedentLines };