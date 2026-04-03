// renderer.js — AST → HTML

// Bootstrap built-in directives (idempotent — safe to require multiple times)
require('./directives/index');

const { marked } = require('marked');
const hljs = require('highlight.js');
const { renderNodeWithRegistry } = require('./renderer/node-renderers');
const { getDirective } = require('./directives/registry');

// configure marked
const mdRenderer = new marked.Renderer();
mdRenderer.code = (code, infostring) => {
  const isToken = code && typeof code === 'object' && !Array.isArray(code);
  const rawCode = isToken ? readTokenText(code.text ?? code.raw) : code;
  const rawLang = isToken ? readTokenText(code.lang) : infostring;
  const lang = String(rawLang || '').trim().split(/\s+/)[0] || 'text';
  const safeLang = escapeAttr(lang.toLowerCase());
  const highlighted = highlightCode(String(rawCode || ''), safeLang);
  return `<div class="mq-code-block" data-lang="${safeLang}"><div class="mq-code-head"><span class="mq-code-lang">${safeLang}</span><button class="mq-code-copy" type="button" aria-label="Copy ${safeLang} code">Copy</button></div><pre><code class="hljs language-${safeLang}">${highlighted}</code></pre></div>`;
};
marked.setOptions({ breaks: true, gfm: true, renderer: mdRenderer });

function render(ast, opts = {}) {
  return renderNodes(ast.children, opts);
}

function renderNodes(nodes, opts) {
  return nodes.map(n => renderNode(n, opts)).join('\n');
}

function renderNode(node, opts) {
  return renderNodeWithRegistry(node, opts, { renderNodes, renderMarkdown, escapeAttr });
}

function renderMarkdown(src, opts = {}) {
  src = dedentMarkdown(src);
  src = expandInlineDivider(src);

  // Preferred inline badge syntax: @badge "Text" {.class .other}
  src = src.replace(/@badge\s+(?:"([^"]+)"|'([^']+)')\s*(\{[^}]*\})?/g,
    (_, dblLabel, sglLabel, attrsRaw) => {
      const label = dblLabel || sglLabel || '';
      const className = parseBadgeAttrs(attrsRaw);
      return `<span class="mq-badge${className}">${label}</span>`;
    }
  );

  // Legacy inline badge syntax (@badge[...] and :badge[...])
  src = src.replace(/(?:@badge|:badge)\[([^\]]+)\](\{\.([a-z]+)\})?/g,
    (_, label, __, cls) => `<span class="mq-badge${cls ? ' ' + cls : ''}">${label}</span>`
  );

  // Explicit button syntax: @[text](url){!id .cls .other}
  src = src.replace(/@\[([^\]]+)\]\(([^)]*)\)(?:\{([^}]*)\})?/g,
    (_, text, url, attrsRaw) => {
      const attrs = parseButtonAttrs(attrsRaw);
      const extraClasses = attrs.className;
      const idAttr = attrs.id ? ` id="${escapeAttr(attrs.id)}"` : '';
      const safeHref = resolveHref(url, opts);
      return `<a href="${safeHref}" class="mq-btn${extraClasses}"${idAttr}>${text}</a>`;
    }
  );

  src = expandInlineCustomDirectives(src, opts);

  const html = marked.parse(src);
  return normalizeAnchorHrefs(html, opts);
}

function expandInlineCustomDirectives(src, opts = {}) {
  const lines = String(src || '').split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    lines[i] = line.replace(/(^|[^\w-])@([a-z][\w-]*)\b/gi, (match, prefix, rawTag) => {
      const tag = String(rawTag || '').toLowerCase();
      const def = getDirective(tag);
      if (!def || def.type !== 'inline') return match;

      const html = def.render({
        tag,
        mods: [],
        name: null,
        children: '',
        nodes: [],
        node: { type: 'directive', tag, inline: true, mods: [], name: null, children: [] },
        opts,
        ctx: { renderNodes, renderMarkdown, escapeAttr },
      });

      return `${prefix}${html}`;
    });
  }

  return lines.join('\n');
}

function expandInlineDivider(src) {
  const lines = String(src || '').split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    lines[i] = line.replace(/(^|[^\w])@divider(?=$|[^\w])/g, (_, prefix) => {
      return `${prefix}<span class="mq-divider-inline" aria-hidden="true" style="display:inline-block;vertical-align:middle;width:1.8rem;height:2px;margin:0 .35rem;background:var(--mq-primary,currentColor);opacity:.75;border-radius:2px;"></span>`;
    });
  }

  return lines.join('\n');
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
  const language = String(lang || '').toLowerCase();
  if (!language || language === 'text') return escapeHtml(code);

  if (!hljs.getLanguage(language)) return escapeHtml(code);

  try {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch (_) {
    return escapeHtml(code);
  }
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
  const text = String(raw || '').trim();
  if (!text) return '';

  const tokens = text.replace(/^\{/, '').replace(/\}$/, '').trim().split(/\s+/).filter(Boolean);
  const classes = [];
  for (const token of tokens) {
    const classToken = token.replace(/^\./, '').trim();
    if (/^[a-z0-9_-]+$/i.test(classToken)) {
      classes.push(classToken);
    }
  }

  return classes.length ? ` ${classes.join(' ')}` : '';
}

function normalizeAnchorHrefs(html, opts = {}) {
  return String(html || '').replace(/(<a\b[^>]*\shref=")([^"]+)(")/gi, (_, head, href, tail) => {
    return `${head}${resolveHref(href, opts)}${tail}`;
  });
}

function resolveHref(href, opts = {}) {
  if (opts && typeof opts.resolveHref === 'function') {
    try {
      return opts.resolveHref(href);
    } catch (_) {
      // fall back to default normalization
    }
  }
  return convertMqHref(href);
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

  if (!/\.mq$/i.test(pathPart)) return raw;
  return `${pathPart.slice(0, -3)}.html${suffix}`;
}

module.exports = { render };
