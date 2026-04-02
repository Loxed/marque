// renderer.js — AST → HTML
const { marked } = require('marked');
const hljs = require('highlight.js');

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

let _tabCounter = 0;

function render(ast, opts = {}) {
  _tabCounter = 0;
  return renderNodes(ast.children, opts);
}

function renderNodes(nodes, opts) {
  return nodes.map(n => renderNode(n, opts)).join('\n');
}

function renderNode(node, opts) {
  switch (node.type) {

    case 'markdown':
      return renderMarkdown(node.content, opts);

    case 'hr':
      return '<hr>';

    case 'divider':
      return '<div class="mq-divider"></div>';

    case 'row': {
      const columnCount = node.children.filter(c =>
        ['card', 'stat', 'step', 'column'].includes(c.type)
      ).length;
      const cols = Math.max(1, columnCount || node.children.length);
      const inner = renderNodes(node.children, opts);
      return `<div class="mq-row" style="grid-template-columns: repeat(${cols}, 1fr);">${inner}</div>`;
    }

    case 'column': {
      const inner = renderNodes(node.children, opts);
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<div class="mq-column${cls}">${inner}</div>`;
    }

    case 'card': {
      const inner = renderNodes(node.children, opts);
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<div class="mq-card${cls}">${inner}</div>`;
    }

    case 'callout': {
      const inner = renderNodes(node.children, opts);
      return `<div class="mq-callout ${node.variant}">${inner}</div>`;
    }

    case 'stat': {
      const inner = renderNodes(node.children, opts);
      // extract h2 as value, first p as label
      const valM = inner.match(/<h2[^>]*>(.*?)<\/h2>/);
      const lblM = inner.match(/<p[^>]*>(.*?)<\/p>/);
      const val = valM ? valM[1] : '';
      const lbl = lblM ? lblM[1] : '';
      return `<div class="mq-stat"><div class="mq-stat-value">${val}</div><div class="mq-stat-label">${lbl}</div></div>`;
    }

    case 'hero': {
      const inner = renderNodes(node.children, opts);
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<section class="mq-hero${cls}">${inner}</section>`;
    }

    case 'section': {
      const inner = renderNodes(node.children, opts);
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<section class="mq-section${cls}">${inner}</section>`;
    }

    case 'tabs': {
      const id = `mq-tabs-${_tabCounter++}`;
      const tabs = node.children.filter(c => c.type === 'tab');
      const btnBar = tabs.map((t, i) =>
        `<button class="mq-tab-btn${i === 0 ? ' active' : ''}" onclick="mqTab('${id}',${i})">${t.label || `Tab ${i+1}`}</button>`
      ).join('');
      const contents = tabs.map((t, i) =>
        `<div class="mq-tab-content${i === 0 ? ' active' : ''}">${renderNodes(t.children, opts)}</div>`
      ).join('');
      return `<div class="mq-tabs" id="${id}"><div class="mq-tab-bar">${btnBar}</div>${contents}</div>`;
    }

    case 'steps': {
      const inner = renderSteps(node.children, opts);
      return `<div class="mq-steps">${inner}</div>`;
    }

    case 'step': {
      const inner = renderNodes(node.children, opts);
      const cfg = parseStepConfig(node.name);
      let label = '1';
      let cls = 'mq-step';

      if (cfg.mode === 'skip') {
        label = '*';
        cls += ' mq-step-skip';
      } else if (cfg.mode === 'set') {
        label = String(cfg.value);
      }

      return `<div class="${cls}"><div class="mq-step-num" data-step="${escapeAttr(label)}"></div><div class="mq-step-body">${inner}</div></div>`;
    }

    case 'generic': {
      const inner = renderNodes(node.children, opts);
      return `<div class="mq-${node.tag}${node.mod ? ' ' + node.mod : ''}">${inner}</div>`;
    }

    default:
      return '';
  }
}

function renderMarkdown(src, opts = {}) {
  src = dedentMarkdown(src);

  // Handle inline badge syntax: :badge[text]{.cls}
  src = src.replace(/:badge\[([^\]]+)\](\{\.([a-z]+)\})?/g,
    (_, label, __, cls) => `<span class="mq-badge${cls ? ' ' + cls : ''}">${label}</span>`
  );

  // Explicit button syntax: @[text](url){.cls .other}
  // Examples:
  //   @[Read docs](/docs.html){}
  //   @[Download](/archive.zip){.primary}
  src = src.replace(/@\[([^\]]+)\]\(([^)]+)\)(?:\{([^}]*)\})?/g,
    (_, text, url, clsRaw) => {
      const extraClasses = normalizeButtonClasses(clsRaw);
      const safeHref = resolveHref(url, opts);
      return `<a href="${safeHref}" class="mq-btn${extraClasses}">${text}</a>`;
    }
  );

  const html = marked.parse(src);
  return normalizeAnchorHrefs(html, opts);
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

function renderSteps(children, opts) {
  let nextNumber = 1;
  const parts = [];

  for (const child of children) {
    if (child.type !== 'step') {
      parts.push(renderNode(child, opts));
      continue;
    }

    const cfg = parseStepConfig(child.name);
    let stepLabel = '';
    let stepClass = 'mq-step';

    if (cfg.mode === 'skip') {
      stepLabel = '*';
      stepClass += ' mq-step-skip';
    } else if (cfg.mode === 'set') {
      stepLabel = String(cfg.value);
      nextNumber = cfg.value + 1;
    } else {
      stepLabel = String(nextNumber);
      nextNumber += 1;
    }

    const body = renderNodes(child.children || [], opts);
    parts.push(`<div class="${stepClass}"><div class="mq-step-num" data-step="${escapeAttr(stepLabel)}"></div><div class="mq-step-body">${body}</div></div>`);
  }

  return parts.join('\n');
}

function parseStepConfig(name) {
  const raw = String(name || '').trim();
  if (!raw) return { mode: 'auto' };

  if (raw === '*') return { mode: 'skip' };

  if (/^\d+$/.test(raw)) {
    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? { mode: 'set', value } : { mode: 'auto' };
  }

  const resetMatch = raw.match(/^reset(?:\s*[:=]\s*(\d+))?$/i);
  if (resetMatch) {
    const start = resetMatch[1] ? parseInt(resetMatch[1], 10) : 1;
    return Number.isFinite(start) && start > 0 ? { mode: 'set', value: start } : { mode: 'set', value: 1 };
  }

  return { mode: 'auto' };
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

function normalizeButtonClasses(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const classes = text
    .split(/\s+/)
    .map(token => token.replace(/^\./, '').trim())
    .filter(token => /^[a-z0-9_-]+$/i.test(token));

  if (!classes.length) return '';
  return ` ${classes.join(' ')}`;
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
