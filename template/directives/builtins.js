'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('divider', {
    type: 'inline',
    render: () => '<div class="mq-divider"></div>',
  });

  defineDirective('container', {
    type: 'block',
    render: ({ nodes, opts, ctx }) => {
      // Container resets the step counter for its children.
      return ctx.renderNodes(nodes, { ...(opts || {}), _stepCounter: 1 });
    },
  });

  defineDirective('row', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const hasDirectiveChild = (node.children || []).some(c => c.type === 'directive' && !c.inline);
      if (!hasDirectiveChild) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ201',
          message: '@row has no block directive children.',
          suggestions: [{ message: 'add at least one block directive (e.g. @card, @column) inside this @row' }],
        }));
      }
    },
    render: ({ nodes, opts, ctx }) => {
      // Count direct block directive children to set the column grid.
      const cols = Math.max(1, (nodes || []).filter(c => c.type === 'directive' && !c.inline).length);
      const inner = ctx.renderNodes(nodes, opts);
      return `<div class="mq-row" style="grid-template-columns: repeat(${cols}, 1fr);">${inner}</div>`;
    },
  });

  defineDirective('column', {
    type: 'block',
    render: ({ mods, children }) => {
      const cls = mods.length ? ` ${mods.join(' ')}` : '';
      return `<div class="mq-column${cls}">${children}</div>`;
    },
  });

  defineDirective('section', {
    type: 'block',
    render: ({ mods, children }) => {
      const cls = mods.length ? ` ${mods.join(' ')}` : '';
      return `<section class="mq-section${cls}">${children}</section>`;
    },
  });

  defineDirective('hero', {
    type: 'block',
    render: ({ mods, children }) => {
      const cls = mods.length ? ` ${mods.join(' ')}` : '';
      return `<section class="mq-hero${cls}">${children}</section>`;
    },
  });

  defineDirective('card', {
    type: 'block',
    render: ({ mods, children }) => {
      const cls = mods.length ? ` ${mods.join(' ')}` : '';
      return `<div class="mq-card${cls}">${children}</div>`;
    },
  });

  defineDirective('callout', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const known = new Set(['info', 'warn', 'danger', 'ok', 'primary', 'secondary', 'tertiary']);
      const variant = (node.mods || [])[0];
      if (variant && !known.has(variant)) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ301',
          message: `Unknown @callout variant '${variant}'. Known: ${[...known].join(', ')}.`,
        }));
      }
    },
    render: ({ mods, children }) => {
      const variant = mods[0] || 'info';
      return `<div class="mq-callout ${variant}">${children}</div>`;
    },
  });

  defineDirective('stat', {
    type: 'block',
    render: ({ children }) => {
      const valMatch = children.match(/<h2[^>]*>(.*?)<\/h2>/);
      const lblMatch = children.match(/<p[^>]*>(.*?)<\/p>/);
      const value = valMatch ? valMatch[1] : '';
      const label = lblMatch ? lblMatch[1] : '';
      return `<div class="mq-stat"><div class="mq-stat-value">${value}</div><div class="mq-stat-label">${label}</div></div>`;
    },
  });

  defineDirective('step', {
    type: 'block',
    render: ({ name, children, opts, ctx }) => {
      const cfg = parseStepConfig(name);
      let label = Number.isFinite(opts && opts._stepCounter) ? opts._stepCounter : 1;

      if (cfg.mode === 'skip') {
        label = '*';
      } else if (cfg.mode === 'set') {
        label = cfg.value;
        if (Number.isFinite(opts && opts._stepCounter)) opts._stepCounter = cfg.value;
      }

      if (Number.isFinite(opts && opts._stepCounter)) opts._stepCounter += 1;

      const safeLabel = ctx.escapeAttr(String(label));
      return `<div class="mq-step"><div class="mq-step-num" data-step="${safeLabel}"></div><div class="mq-step-body">${children}</div></div>`;
    },
  });
};

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
