'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('badge', {
    type: 'inline',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const label = String(node.name || '').trim();
      if (!label) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ411',
          message: '@badge is missing a label.',
          suggestions: [{ message: 'add a label after @badge, e.g. @badge New or @badge "Stable" {.ok}' }],
        }));
      }

      const KNOWN = new Set(['info', 'ok', 'warn', 'danger', 'primary', 'secondary', 'tertiary']);
      const variant = (node.mods || [])[0];
      if (variant && !KNOWN.has(variant)) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ412',
          message: `Unknown @badge variant '${variant}'. Known: ${[...KNOWN].join(', ')}.`,
        }));
      }
    },
    render: ({ mods, name, ctx }) => {
      const label = String(name || '').trim();
      const classes = Array.isArray(mods) && mods.length ? ` ${mods.join(' ')}` : '';
      return `<span class="mq-badge${classes}">${ctx.escapeHtml ? ctx.escapeHtml(label) : escapeHtml(label)}</span>`;
    },
  });
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
