// renderer.js — AST → HTML
const { marked } = require('marked');

// configure marked
marked.setOptions({ breaks: true, gfm: true });

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
      return renderMarkdown(node.content);

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

function renderMarkdown(src) {
  src = dedentMarkdown(src);

  // Handle inline badge syntax: :badge[text]{.cls}
  src = src.replace(/:badge\[([^\]]+)\](\{\.([a-z]+)\})?/g,
    (_, label, __, cls) => `<span class="mq-badge${cls ? ' ' + cls : ''}">${label}</span>`
  );

  // Button class shorthand: [text](url){.cls}
  src = src.replace(/\[([^\]]+)\]\(([^)]+)\)\{\.([a-z0-9-]+)\}/g,
    (_, text, url, cls) => `<a href="${url}" class="mq-btn ${cls}">${text}</a>`
  );

  let html = marked.parse(src);

  // Auto-detect links that look like buttons (contain → or start with action verbs)
  html = html.replace(/<a href="([^"]+)">([^<]+)<\/a>/g, (match, url, text) => {
    const isBtn = text.includes('→') || /^(read|view|start|browse|get|try|install|learn|download|open|go|see)\b/i.test(text.trim());
    return isBtn ? `<a href="${url}" class="mq-btn">${text}</a>` : match;
  });

  return html;
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

module.exports = { render };
