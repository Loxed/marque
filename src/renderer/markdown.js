'use strict';

const { marked }                                      = require('marked');
const { escapeAttr, readTokenText, highlightCode }    = require('./html');
const { parseButtonAttrs, resolveHref, normalizeAnchorHrefs } = require('./links');

// ── marked configuration ───────────────────────────────────────────────────

const mdRenderer = new marked.Renderer();

mdRenderer.code = (code, infostring) => {
  const isToken  = code && typeof code === 'object' && !Array.isArray(code);
  const rawCode  = isToken ? readTokenText(code.text ?? code.raw) : code;
  const rawLang  = isToken ? readTokenText(code.lang) : infostring;
  const lang     = String(rawLang || '').trim().split(/\s+/)[0] || 'text';
  const safeLang = escapeAttr(lang.toLowerCase());
  const hl       = highlightCode(String(rawCode || ''), safeLang);

  return `<div class="mq-code-block" data-lang="${safeLang}">` +
    `<div class="mq-code-head">` +
      `<span class="mq-code-lang">${safeLang}</span>` +
      `<button class="mq-code-copy" type="button" aria-label="Copy ${safeLang} code">Copy</button>` +
    `</div>` +
    `<pre><code class="hljs language-${safeLang}">${hl}</code></pre>` +
  `</div>`;
};

marked.setOptions({ breaks: true, gfm: true, renderer: mdRenderer });

// ── public ─────────────────────────────────────────────────────────────────

/**
 * Render a markdown string to HTML.
 * Expands Marque inline directives: `:badge[text]{.cls}` and `@[text](url){attrs}`.
 */
function renderMarkdown(src, opts = {}) {
  let text = dedentMarkdown(String(src || ''));

  // :badge[label]{.cls}
  text = text.replace(/:badge\[([^\]]+)\](\{\.([a-z]+)\})?/g,
    (_, label, __, cls) => `<span class="mq-badge${cls ? ' ' + cls : ''}">${label}</span>`,
  );

  // @[text](url){!id .cls}
  text = text.replace(/@\[([^\]]+)\]\(([^)]*)\)(?:\{([^}]*)\})?/g,
    (_, label, url, attrsRaw) => {
      const { className, id } = parseButtonAttrs(attrsRaw);
      const idAttr  = id ? ` id="${escapeAttr(id)}"` : '';
      const safeUrl = resolveHref(url, opts);
      return `<a href="${safeUrl}" class="mq-btn${className}"${idAttr}>${label}</a>`;
    },
  );

  return normalizeAnchorHrefs(marked.parse(text), opts);
}

function dedentMarkdown(src) {
  const lines = src.split('\n');
  let minIndent = Infinity;
  for (const line of lines) {
    if (!line.trim()) continue;
    const indent = (line.match(/^[ \t]*/) || [''])[0].length;
    if (indent < minIndent) minIndent = indent;
  }
  if (!Number.isFinite(minIndent) || minIndent === 0) return src;
  return lines.map(line => {
    const indent = (line.match(/^[ \t]*/) || [''])[0].length;
    return indent >= minIndent ? line.slice(minIndent) : line;
  }).join('\n');
}

module.exports = { renderMarkdown };