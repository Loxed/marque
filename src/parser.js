'use strict';

// parser.js — .mq source → AST
// Marque DSL — @tag .modifier name / @tag "name with spaces" / @end tag syntax

const { isInline } = require('./directives/registry');
const { parseFlatToml } = require('./utils/toml');

function parse(src) {
  const lines = src.split('\n');
  const tokens = tokenize(lines);
  return buildAST(tokens);
}

// ── Tokeniser ──────────────────────────────────────────────────────────────
//
// Line forms:
//   @tag [.mod ...] [name]              — open (block or inline, decided by registry)
//   @tag [.mod ...] ["name with spaces"]
//   @end tag [name|"name with spaces"] — close block
//   ---                      — horizontal rule
//   anything else            — raw markdown text
//
// The tokeniser is intentionally dumb — it emits 'open' tokens for every
// @tag line. The AST builder checks isInline() to decide whether to consume
// children or treat the tag as self-closing.

function tokenize(lines) {
  const tokens = [];
  let inFence = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx];
    const lineNo = idx + 1;
    const trimmed = raw.trim();
    const col = Math.max(1, raw.indexOf('@') + 1 || 1);
    const endCol = Math.max(col, raw.length || col);

    // Fenced code blocks — never parse @ inside them
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      tokens.push({ type: 'text', line: raw, lineNo });
      continue;
    }
    if (inFence) {
      tokens.push({ type: 'text', line: raw, lineNo });
      continue;
    }

    // @end tag [name]  (tag can include hyphens, e.g. @end product-card)
    // name may be bare-token or quoted (quoted can include spaces)
    const endM = trimmed.match(/^@end\s+([\w-]+)(?:\s+(?:"([^"]*)"|'([^']*)'|([^\s]+)))?$/);
    if (endM) {
      const closeName = endM[2] ?? endM[3] ?? endM[4] ?? null;
      tokens.push({ type: 'close', tag: endM[1], name: closeName, lineNo, col, endCol });
      continue;
    }

    // @tag [.mod .mod ...] [name]
    // mods = .word tokens
    // name = trailing bare token OR quoted text (quoted can include spaces)
    const openM = trimmed.match(/^@([\w-]+)((?:\s+\.\w+)*)(?:\s+(?:"([^"]*)"|'([^']*)'|([^.\s]\S*)))?$/);
    if (openM) {
      const tag  = openM[1];
      const mods = (openM[2] || '').trim().split(/\s+/).filter(Boolean).map(m => m.slice(1));
      const name = openM[3] ?? openM[4] ?? openM[5] ?? null;
      tokens.push({ type: 'open', tag, mods, name, lineNo, col, endCol });
      continue;
    }

    // Horizontal rule
    if (trimmed === '---') {
      tokens.push({ type: 'hr_or_fm', lineNo, col: 1, endCol: 3 });
      continue;
    }

    tokens.push({ type: 'text', line: raw, lineNo });
  }

  return tokens;
}

// ── AST builder ────────────────────────────────────────────────────────────
//
// All directive nodes have the shape:
//   {
//     type    : 'directive'
//     tag     : string          — directive name
//     inline  : boolean         — true = self-closing, false = has children
//     mods    : string[]        — modifier list
//     name    : string|null     — optional name argument
//     children: ASTNode[]       — child nodes (block only)
//     loc     : Loc
//   }
//
// Non-directive nodes:
//   { type: 'markdown', content: string, loc }
//   { type: 'hr', loc }
//   { type: 'root', children: ASTNode[] }

function buildAST(tokens) {
  const { nodes } = consumeBlock(tokens, 0, tokens.length, null);
  return { type: 'root', children: nodes };
}

function consumeBlock(tokens, start, end, openTag) {
  const nodes   = [];
  let i         = start;
  let textBuf   = [];

  const flushText = () => {
    if (!textBuf.length) return;
    const firstLineNo = textBuf[0].lineNo || 1;
    const lastLineNo  = textBuf[textBuf.length - 1].lineNo || firstLineNo;
    nodes.push({
      type: 'markdown',
      content: dedentLines(textBuf.map(t => t.line)).join('\n'),
      loc: { start_line: firstLineNo, start_col: 1, end_line: lastLineNo, end_col: 1 },
    });
    textBuf = [];
  };

  while (i < end) {
    const tok = tokens[i];

    // ── Close token ─────────────────────────────────────────────────────
    if (tok.type === 'close') {
      if (openTag && tok.tag === openTag) {
        flushText();
        return { nodes, next: i + 1 };
      }
      if (!openTag) { i++; continue; }     // stray close at root — skip
      flushText();
      return { nodes, next: i };           // belongs to an outer block
    }

    // ── Open token ──────────────────────────────────────────────────────
    if (tok.type === 'open') {
      flushText();

      if (isInline(tok.tag)) {
        // Inline directive — self-closing, no children
        nodes.push({
          type   : 'directive',
          tag    : tok.tag,
          inline : true,
          mods   : tok.mods,
          name   : tok.name,
          children: [],
          loc    : locFromToken(tok),
        });
        i++;
        continue;
      }

      // Block directive — consume children until matching @end
      const inner = consumeBlock(tokens, i + 1, end, tok.tag);
      i = inner.next;
      nodes.push({
        type    : 'directive',
        tag     : tok.tag,
        inline  : false,
        mods    : tok.mods,
        name    : tok.name,
        children: inner.nodes,
        loc     : locFromToken(tok),
      });
      continue;
    }

    // ── Horizontal rule ──────────────────────────────────────────────────
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

function locFromToken(tok) {
  return {
    start_line: (tok && tok.lineNo) || 1,
    start_col : (tok && tok.col)    || 1,
    end_line  : (tok && tok.lineNo) || 1,
    end_col   : (tok && tok.endCol) || ((tok && tok.col) || 1),
  };
}

// ── Frontmatter ────────────────────────────────────────────────────────────

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
