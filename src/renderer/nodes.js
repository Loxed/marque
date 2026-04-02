'use strict';

const { escapeAttr }    = require('./html');
const { renderMarkdown} = require('./markdown');

let _tabCounter = 0;

function renderNodes(nodes, opts) {
  return nodes.map(n => renderNode(n, opts)).join('\n');
}

function renderNode(node, opts) {
  switch (node.type) {
    case 'markdown': return renderMarkdown(node.content, opts);
    case 'hr':       return '<hr>';
    case 'divider':  return '<div class="mq-divider"></div>';

    case 'row': {
      const colCount = node.children.filter(c =>
        ['card', 'stat', 'step', 'column'].includes(c.type),
      ).length;
      const cols  = Math.max(1, colCount || node.children.length);
      const inner = renderNodes(node.children, opts);
      return `<div class="mq-row" style="grid-template-columns: repeat(${cols}, 1fr);">${inner}</div>`;
    }

    case 'column': {
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<div class="mq-column${cls}">${renderNodes(node.children, opts)}</div>`;
    }

    case 'card': {
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<div class="mq-card${cls}">${renderNodes(node.children, opts)}</div>`;
    }

    case 'callout':
      return `<div class="mq-callout ${node.variant}">${renderNodes(node.children, opts)}</div>`;

    case 'stat': {
      const inner = renderNodes(node.children, opts);
      const val   = (inner.match(/<h2[^>]*>(.*?)<\/h2>/)  || ['', ''])[1];
      const lbl   = (inner.match(/<p[^>]*>(.*?)<\/p>/)    || ['', ''])[1];
      return `<div class="mq-stat"><div class="mq-stat-value">${val}</div><div class="mq-stat-label">${lbl}</div></div>`;
    }

    case 'hero': {
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<section class="mq-hero${cls}">${renderNodes(node.children, opts)}</section>`;
    }

    case 'section': {
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<section class="mq-section${cls}">${renderNodes(node.children, opts)}</section>`;
    }

    case 'tabs': {
      const id   = `mq-tabs-${_tabCounter++}`;
      const tabs = node.children.filter(c => c.type === 'tab');
      const bar  = tabs.map((t, i) =>
        `<button class="mq-tab-btn${i === 0 ? ' active' : ''}" onclick="mqTab('${id}',${i})">${t.label || `Tab ${i + 1}`}</button>`,
      ).join('');
      const panes = tabs.map((t, i) =>
        `<div class="mq-tab-content${i === 0 ? ' active' : ''}">${renderNodes(t.children, opts)}</div>`,
      ).join('');
      return `<div class="mq-tabs" id="${id}"><div class="mq-tab-bar">${bar}</div>${panes}</div>`;
    }

    case 'steps':
      return `<div class="mq-steps">${renderSteps(node.children, opts)}</div>`;

    // Standalone @step outside @steps — treat same as inside
    case 'step': {
      const cfg   = parseStepConfig(node.name);
      const label = cfg.mode === 'skip' ? '*' : cfg.mode === 'set' ? String(cfg.value) : '1';
      const cls   = cfg.mode === 'skip' ? 'mq-step mq-step-skip' : 'mq-step';
      const body  = renderNodes(node.children, opts);
      return `<div class="${cls}"><div class="mq-step-num" data-step="${escapeAttr(label)}"></div><div class="mq-step-body">${body}</div></div>`;
    }

    case 'generic': {
      const cls = node.mod ? ` ${node.mod}` : '';
      return `<div class="mq-${node.tag}${cls}">${renderNodes(node.children, opts)}</div>`;
    }

    default: return '';
  }
}

/** Render children of a `@steps` node, managing auto-incrementing counter. */
function renderSteps(children, opts) {
  let next = 1;
  return children.map(child => {
    if (child.type !== 'step') return renderNode(child, opts);

    const cfg = parseStepConfig(child.name);
    let label, cls = 'mq-step';

    if (cfg.mode === 'skip') {
      label = '*'; cls += ' mq-step-skip';
    } else if (cfg.mode === 'set') {
      label = String(cfg.value); next = cfg.value + 1;
    } else {
      label = String(next++);
    }

    const body = renderNodes(child.children || [], opts);
    return `<div class="${cls}"><div class="mq-step-num" data-step="${escapeAttr(label)}"></div><div class="mq-step-body">${body}</div></div>`;
  }).join('\n');
}

/**
 * Parse an optional step name into a config object.
 * Returns `{ mode: 'auto' | 'skip' | 'set', value?: number }`.
 */
function parseStepConfig(name) {
  const raw = String(name || '').trim();
  if (!raw)                  return { mode: 'auto' };
  if (raw === '*')           return { mode: 'skip' };
  if (/^\d+$/.test(raw)) {
    const value = parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? { mode: 'set', value } : { mode: 'auto' };
  }
  const resetM = raw.match(/^reset(?:\s*[:=]\s*(\d+))?$/i);
  if (resetM) {
    const start = resetM[1] ? parseInt(resetM[1], 10) : 1;
    return Number.isFinite(start) && start > 0 ? { mode: 'set', value: start } : { mode: 'set', value: 1 };
  }
  return { mode: 'auto' };
}

module.exports = { renderNode, renderNodes, _resetTabCounter: () => { _tabCounter = 0; } };