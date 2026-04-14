// renderer.js — AST → HTML

const { marked } = require('marked');
const hljs = require('highlight.js');
const { renderNodeWithRegistry } = require('./renderer/node-renderers');
const { getDirective } = require('./directives/registry');

// configure marked
const mdRenderer = new marked.Renderer();
const defaultTableRenderer = mdRenderer.table;
const MQ_TOC_HIDDEN_COMMENT = '<!--mq-toc-hidden-->';
mdRenderer.code = (code, infostring) => {
  const isToken = code && typeof code === 'object' && !Array.isArray(code);
  const rawCode = isToken ? readTokenText(code.text ?? code.raw) : code;
  const rawLang = isToken ? readTokenText(code.lang) : infostring;
  const lang = String(rawLang || '').trim().split(/\s+/)[0] || '';
  const safeLang = escapeAttr(lang.toLowerCase());
  const highlighted = highlightCode(String(rawCode || ''), safeLang);
  const trimmed = highlighted.trimStart();
  return `<div class="mq-code-block" data-lang="${safeLang}"><div class="mq-code-head"><span class="mq-code-lang">${safeLang}</span><button class="mq-code-copy" type="button" aria-label="Copy ${safeLang} code">Copy</button></div><pre><code class="hljs language-${safeLang}">${highlighted}</code></pre></div>`;
};
mdRenderer.table = function (...args) {
  const tableHtml = defaultTableRenderer.apply(this, args);
  return `<div class="mq-table-wrap">${tableHtml}</div>`;
};
mdRenderer.heading = function (token) {
  const depth = Number(token && token.depth) || 1;
  const hiddenFromToc = headingStartsWithHiddenSummaryMarker(token);
  const tokens = hiddenFromToc ? stripHiddenSummaryMarkerTokens(token.tokens) : token.tokens;
  const attrs = hiddenFromToc ? ' data-mq-toc-hidden="true"' : '';
  return `<h${depth}${attrs}>${this.parser.parseInline(tokens || [])}</h${depth}>`;
};
// Marque treats a single newline inside a paragraph as an explicit line break,
// while blank lines still split content into separate paragraphs.
marked.setOptions({ breaks: true, gfm: true, renderer: mdRenderer });

function render(ast, opts = {}) {
  const nodes = ast && Array.isArray(ast.children) ? ast.children : [];
  return renderNodes(nodes, opts, { parentNode: ast || null });
}

function renderNodes(nodes, opts, meta = {}) {
  const list = Array.isArray(nodes) ? nodes : [];
  const scopedOpts = createRenderScopeOptions(opts);
  return list.map((n, index) => renderNode(n, scopedOpts, {
    parentNode: meta.parentNode || null,
    siblings: list,
    index,
  })).join('\n');
}

function renderNode(node, opts, meta = {}) {
  return renderNodeWithRegistry(node, opts, {
    renderNodes: (childNodes, childOpts) => renderNodes(childNodes, childOpts, { parentNode: node || null }),
    renderMarkdown,
    escapeAttr,
    escapeHtml,
    siblings: Array.isArray(meta.siblings) ? meta.siblings : [],
    index: Number.isFinite(meta.index) ? meta.index : -1,
    parentNode: meta.parentNode || null,
  });
}

function renderMarkdown(src, opts = {}) {
  src = dedentMarkdown(src);
  src = markSummaryHiddenHeadings(src);
  src = expandInlineDivider(src);

  // Preferred inline badge syntax: @badge "Text" {.class .other}
  src = replaceMarkdownOutsideCode(src, (text) => text.replace(/@badge\s+(?:"([^"]+)"|'([^']+)')(?:\s*(\{[^}]*\}))?/g,
    (_, dblLabel, sglLabel, attrsRaw) => {
      const label = dblLabel || sglLabel || '';
      return renderInlineBadge(label, parseBadgeModifiers(attrsRaw), opts);
    }
  ));

  // Directive-style inline badge syntax: @badge .ok Stable / @badge .ok "Stable"
  src = replaceMarkdownOutsideCode(src, (text) => text.replace(/@badge(?:\s+((?:\.[\w-]+\s*)+))?\s+(?:"([^"]+)"|'([^']+)'|([^\s{}]+))/g,
    (_, modsRaw, dblLabel, sglLabel, bareLabel) => {
      const label = dblLabel || sglLabel || bareLabel || '';
      return renderInlineBadge(label, parseBadgeModifiers(modsRaw), opts);
    }
  ));

  // Legacy inline badge syntax (@badge[...] and :badge[...])
  src = replaceMarkdownOutsideCode(src, (text) => text.replace(/(?:@badge|:badge)\[([^\]]+)\](\{\.([a-z]+)\})?/g,
    (_, label, __, cls) => renderInlineBadge(label, cls ? [cls] : [], opts)
  ));

  // Inline keyboard shortcut syntax:
  // @kbd "Ctrl+S" {.mac}
  src = replaceMarkdownOutsideCode(src, (text) => text.replace(/@kbd(?:\s+((?:\.[\w-]+\s*)+))?\s+(?:"([^"]+)"|'([^']+)')(?:\s*(\{[^}]*\}))?/g,
    (_, modsRaw, dblLabel, sglLabel, attrsRaw) => {
      const label = dblLabel || sglLabel || '';
      const mods = mergeDirectiveModifiers(parseDirectiveModifiers(modsRaw), parseDirectiveModifiers(attrsRaw));
      return renderInlineKbd(label, mods, opts);
    }
  ));

  // @kbd Ctrl+K
  // @kbd .mac Ctrl+Shift+P
  src = replaceMarkdownOutsideCode(src, (text) => text.replace(/@kbd(?:\s+((?:\.[\w-]+\s*)+))?\s+([^\s{}]+?)(?:\s*(\{[^}]*\}))?([.,;:!?)]?)(?=\s|$)/g,
    (_, modsRaw, bareLabel, attrsRaw, trailingPunctuation) => {
      const label = bareLabel || '';
      const mods = mergeDirectiveModifiers(parseDirectiveModifiers(modsRaw), parseDirectiveModifiers(attrsRaw));
      return `${renderInlineKbd(label, mods, opts)}${trailingPunctuation || ''}`;
    }
  ));

  // Explicit button syntax: @[text](url){!id .cls .other}
  src = replaceMarkdownOutsideCode(src, (text) => text.replace(/@\[([^\]]+)\]\(([^)]*)\)(?:\{([^}]*)\})?/g,
    (_, label, url, attrsRaw) => {
      const attrs = parseButtonAttrs(attrsRaw);
      const extraClasses = attrs.className;
      const idAttr = attrs.id ? ` id="${escapeAttr(attrs.id)}"` : '';
      const safeHref = resolveHref(url, opts);
      return `<a href="${safeHref}" class="mq-btn${extraClasses}"${idAttr}>${label}</a>`;
    }
  ));

  src = expandInlineCustomDirectives(src, opts);

  const html = marked.parse(src);
  return normalizeDocumentHrefs(html, opts);
}

function expandInlineCustomDirectives(src, opts = {}) {
  return replaceMarkdownOutsideCode(src, (text) => text.replace(/(^|[^\w-])@([a-z][\w-]*)\b/gi, (match, prefix, rawTag) => {
    const tag = String(rawTag || '').toLowerCase();
    if (tag === 'badge') return match;

    const html = renderInlineDirective(tag, { mods: [], name: null }, opts);
    if (!html) return match;

    return `${prefix}${html}`;
  }));
}

function renderInlineBadge(label, mods = [], opts = {}) {
  const html = renderInlineDirective('badge', { mods, name: label }, opts);
  if (html) return html;

  const classes = Array.isArray(mods) && mods.length ? ` ${mods.join(' ')}` : '';
  return `<span class="mq-badge${classes}">${escapeHtml(label)}</span>`;
}

function renderInlineKbd(label, mods = [], opts = {}) {
  const html = renderInlineDirective('kbd', { mods, name: label }, opts);
  if (html) return html;

  return `<kbd>${escapeHtml(label)}</kbd>`;
}

function renderInlineDirective(tag, { mods = [], name = null } = {}, opts = {}) {
  const normalizedTag = String(tag || '').toLowerCase();
  const def = getDirective(normalizedTag);
  if (!def || def.type !== 'inline') return '';

  const normalizedMods = Array.isArray(mods) ? mods.filter(Boolean).map(mod => String(mod)) : [];
  const normalizedName = name === null || name === undefined ? null : String(name);

  return def.render({
    tag: normalizedTag,
    mods: normalizedMods,
    name: normalizedName,
    children: '',
    nodes: [],
    node: { type: 'directive', tag: normalizedTag, inline: true, mods: normalizedMods, name: normalizedName, children: [] },
    opts,
    ctx: { renderNodes, renderMarkdown, escapeAttr, escapeHtml, siblings: [], index: -1, parentNode: null },
  });
}

function expandInlineDivider(src) {
  return replaceMarkdownOutsideCode(src, (text) => text.replace(/(^|[^\w])@divider(?=$|[^\w])/g, (_, prefix) => {
    return `${prefix}<span class="mq-divider-inline" aria-hidden="true" style="display:inline-block;vertical-align:middle;width:1.8rem;height:2px;margin:0 .35rem;background:var(--mq-primary,currentColor);opacity:.75;border-radius:2px;"></span>`;
  }));
}

function markSummaryHiddenHeadings(src) {
  const lines = String(src || '').split('\n');
  let fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';

    const nextFence = updateMarkdownFenceState(trimmed, fence);
    const inFence = !!fence;
    const opensFence = !fence && !!nextFence;

    if (!inFence && !opensFence) {
      const atxMatch = line.match(/^([ \t]{0,3})(#{1,6})\*\s+(.*)$/);
      if (atxMatch) {
        lines[i] = `${atxMatch[1]}${atxMatch[2]} ${MQ_TOC_HIDDEN_COMMENT}${atxMatch[3]}`;
        continue;
      }

      const setextMatch = nextLine.match(/^([ \t]{0,3})(=+|-+)\*\s*$/);
      if (setextMatch && trimmed) {
        const lineMatch = line.match(/^([ \t]*)(.*)$/);
        const atxIndent = String(lineMatch[1] || '').slice(0, 3);
        const atxDepth = setextMatch[2][0] === '=' ? '#' : '##';
        lines[i] = `${atxIndent}${atxDepth} ${MQ_TOC_HIDDEN_COMMENT}${lineMatch[2]}`;
        lines[i + 1] = '';
        continue;
      }
    }

    fence = nextFence;
  }

  return lines.join('\n');
}

function updateMarkdownFenceState(trimmed, fence) {
  const match = String(trimmed || '').match(/^(`{3,}|~{3,})/);
  if (!match) return fence;

  const marker = match[1];
  if (!fence) return marker;
  if (marker[0] === fence[0] && marker.length >= fence.length) return null;
  return fence;
}

function createRenderScopeOptions(opts) {
  const base = opts && typeof opts === 'object' ? { ...opts } : {};
  const explicitStart = Number(base._mqStepScopeStart);
  const start = Number.isFinite(explicitStart) && explicitStart > 0 ? explicitStart : 1;

  delete base._stepCounter;
  delete base._mqStepScopeStart;
  base._stepCounter = start;
  return base;
}

function replaceMarkdownOutsideCode(src, transform) {
  const lines = String(src || '').split('\n');
  let fence = null;
  let codeSpanTicks = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const nextFence = updateMarkdownFenceState(trimmed, fence);
    const inFence = !!fence;
    const opensFence = !fence && !!nextFence;

    if (inFence || opensFence) {
      fence = nextFence;
      continue;
    }

    const result = replaceLineOutsideInlineCode(line, transform, codeSpanTicks);
    lines[i] = result.line;
    codeSpanTicks = result.codeSpanTicks;
    fence = nextFence;
  }

  return lines.join('\n');
}

function replaceLineOutsideInlineCode(line, transform, codeSpanTicks = 0) {
  const text = String(line || '');
  let output = '';
  let plain = '';
  let index = 0;
  let activeTicks = Number.isInteger(codeSpanTicks) && codeSpanTicks > 0 ? codeSpanTicks : 0;

  while (index < text.length) {
    if (activeTicks > 0) {
      const closeIndex = findMatchingBacktickFence(text, index, activeTicks);
      if (closeIndex === -1) {
        output += text.slice(index);
        index = text.length;
        break;
      }

      output += text.slice(index, closeIndex + activeTicks);
      index = closeIndex + activeTicks;
      activeTicks = 0;
      continue;
    }

    const opener = findNextCodeSpanFence(text, index);
    if (!opener) {
      plain += text.slice(index);
      index = text.length;
      break;
    }

    plain += text.slice(index, opener.index);
    if (plain) output += transform(plain);
    plain = '';

    const closeIndex = findMatchingBacktickFence(text, opener.index + opener.length, opener.length);
    if (closeIndex === -1) {
      output += text.slice(opener.index);
      activeTicks = opener.length;
      index = text.length;
      break;
    }

    output += text.slice(opener.index, closeIndex + opener.length);
    index = closeIndex + opener.length;
  }

  if (plain) output += transform(plain);
  return { line: output, codeSpanTicks: activeTicks };
}

function findNextCodeSpanFence(text, startIndex) {
  for (let i = startIndex; i < text.length; i += 1) {
    if (text[i] !== '`') continue;
    if (isEscapedBacktick(text, i)) continue;
    return { index: i, length: countConsecutiveBackticks(text, i) };
  }
  return null;
}

function findMatchingBacktickFence(text, startIndex, tickCount) {
  for (let i = startIndex; i < text.length; i += 1) {
    if (text[i] !== '`') continue;
    const runLength = countConsecutiveBackticks(text, i);
    if (runLength === tickCount) return i;
    i += runLength - 1;
  }
  return -1;
}

function countConsecutiveBackticks(text, startIndex) {
  let count = 0;
  for (let i = startIndex; i < text.length && text[i] === '`'; i += 1) count += 1;
  return count;
}

function isEscapedBacktick(text, index) {
  let slashCount = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function dedentMarkdown(src) {
  const lines = String(src || '').split('\n');
  let minIndent = Infinity;

  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^[ \t]*/);
    const indent = match ? match[0].length : 0;
    if (indent < minIndent) minIndent = indent;
  }

  if (!Number.isFinite(minIndent) || minIndent === 0) return src;

  return lines.map(line => {
    const match = line.match(/^[ \t]*/);
    const indent = match ? match[0].length : 0;
    return indent >= minIndent ? line.slice(minIndent) : line;
  }).join('\n');
}

function headingStartsWithHiddenSummaryMarker(token) {
  const tokens = token && Array.isArray(token.tokens) ? token.tokens : [];
  const first = tokens[0];
  return !!(first && first.type === 'html' && String(first.text || first.raw || '').trim() === MQ_TOC_HIDDEN_COMMENT);
}

function stripHiddenSummaryMarkerTokens(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];
  if (!list.length) return list;
  if (!headingStartsWithHiddenSummaryMarker({ tokens: list })) return list;
  return list.slice(1);
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function readTokenText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(readTokenText).join('');

  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (value.text !== undefined) return readTokenText(value.text);
    if (typeof value.raw === 'string') return value.raw;
    if (typeof value.lang === 'string') return value.lang;
  }

  return String(value);
}

function highlightCode(source, lang) {
  const code = String(source || '');
  const language = resolveHighlightLanguage(lang);
  if (!language || language === 'text') return escapeHtml(code);

  if (!hljs.getLanguage(language)) return escapeHtml(code);

  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch (_) {
    return escapeHtml(code);
  }
}

function resolveHighlightLanguage(lang) {
  const raw = String(lang || '').trim().toLowerCase();
  if (!raw) return 'text';
  if (raw === 'mq' || raw.endsWith('.mq')) return 'markdown';
  return raw;
}

function parseButtonAttrs(raw) {
  const text = String(raw || '').trim();
  if (!text) return { className: '', id: null };

  let id = null;
  const classes = [];

  for (const token of text.split(/\s+/).filter(Boolean)) {
    if (token.startsWith('!')) {
      const candidate = token.slice(1).trim();
      if (!id && /^[a-z0-9_-]+$/i.test(candidate)) id = candidate;
      continue;
    }

    const classToken = token.replace(/^\./, '').trim();
    if (/^[a-z0-9_-]+$/i.test(classToken)) {
      classes.push(classToken);
    }
  }

  const className = classes.length ? ` ${classes.join(' ')}` : '';
  return { className, id };
}

function parseBadgeAttrs(raw) {
  const classes = parseDirectiveModifiers(raw);
  return classes.length ? ` ${classes.join(' ')}` : '';
}

function parseBadgeModifiers(raw) {
  return parseDirectiveModifiers(raw);
}

function parseDirectiveModifiers(raw) {
  const text = String(raw || '').trim();
  if (!text) return [];

  const tokens = text.replace(/^\{/, '').replace(/\}$/, '').trim().split(/\s+/).filter(Boolean);
  const classes = [];
  for (const token of tokens) {
    const classToken = token.replace(/^\./, '').trim();
    if (/^[a-z0-9_-]+$/i.test(classToken)) {
      classes.push(classToken);
    }
  }

  return classes;
}

function mergeDirectiveModifiers(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : []) {
      const mod = String(item || '').trim();
      if (!mod || seen.has(mod)) continue;
      seen.add(mod);
      merged.push(mod);
    }
  }

  return merged;
}

function normalizeDocumentHrefs(html, opts = {}) {
  return String(html || '').replace(/(\b(?:href|src)=["'])([^"']+)(["'])/gi, (_, head, href, tail) => {
    return `${head}${resolveHref(href, opts)}${tail}`;
  });
}

function resolveHref(href, opts = {}) {
  let resolved = href;
  if (opts && typeof opts.resolveHref === 'function') {
    try {
      resolved = opts.resolveHref(href);
    } catch (_) {
      resolved = href;
    }
  }
  return convertMqHref(resolved);
}

function convertMqHref(href) {
  const raw = String(href || '').trim();
  if (!raw) return raw;

  // Keep external/special protocols untouched.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('#')) {
    return raw;
  }

  const hashIndex = raw.indexOf('#');
  const queryIndex = raw.indexOf('?');
  let splitIndex = -1;
  if (hashIndex >= 0 && queryIndex >= 0) splitIndex = Math.min(hashIndex, queryIndex);
  else splitIndex = Math.max(hashIndex, queryIndex);

  const pathPart = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const suffix = splitIndex >= 0 ? raw.slice(splitIndex) : '';

  if (!/\.mq$/i.test(pathPart)) {
    const assetHref = normalizeStaticAssetHref(pathPart, suffix);
    return assetHref || raw;
  }
  return `${pathPart.slice(0, -3)}.html${suffix}`;
}

function normalizeStaticAssetHref(pathPart, suffix = '') {
  const rawPath = String(pathPart || '').trim();
  if (!rawPath) return '';

  const normalizedPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/');
  if (!normalizedPath) return '';

  if (/^static\//i.test(normalizedPath)) {
    return `/${normalizedPath.replace(/^static\/+/i, '')}${suffix}`;
  }

  return '';
}

module.exports = { render };
