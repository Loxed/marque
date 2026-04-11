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
    style: `
.mq-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.18em 0.55em;
  border-radius: 999px;
  font-size: 0.72em;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  line-height: 1.5;
  vertical-align: middle;
  white-space: nowrap;
  border: 1px solid transparent;

  background: var(--mq-badge-bg, color-mix(in srgb, var(--mq-text, #222) 10%, transparent));
  color: var(--mq-badge-text, var(--mq-text, #222));
  border-color: var(--mq-badge-border, color-mix(in srgb, var(--mq-text, #222) 18%, transparent));
}

.mq-badge.primary {
  background: color-mix(in srgb, var(--mq-primary, #5b6af0) 15%, transparent);
  color: var(--mq-primary, #5b6af0);
  border-color: color-mix(in srgb, var(--mq-primary, #5b6af0) 35%, transparent);
}

.mq-badge.secondary {
  background: color-mix(in srgb, var(--mq-secondary, #888) 15%, transparent);
  color: var(--mq-secondary, #888);
  border-color: color-mix(in srgb, var(--mq-secondary, #888) 35%, transparent);
}

.mq-badge.tertiary {
  background: color-mix(in srgb, var(--mq-tertiary, #aaa) 15%, transparent);
  color: var(--mq-tertiary, #aaa);
  border-color: color-mix(in srgb, var(--mq-tertiary, #aaa) 35%, transparent);
}

.mq-badge.info {
  background: color-mix(in srgb, #3b82f6 14%, transparent);
  color: #3b82f6;
  border-color: color-mix(in srgb, #3b82f6 30%, transparent);
}

.mq-badge.ok {
  background: color-mix(in srgb, #22c55e 14%, transparent);
  color: #22c55e;
  border-color: color-mix(in srgb, #22c55e 30%, transparent);
}

.mq-badge.warn {
  background: color-mix(in srgb, #f59e0b 14%, transparent);
  color: #b45309;
  border-color: color-mix(in srgb, #f59e0b 35%, transparent);
}

.mq-badge.danger {
  background: color-mix(in srgb, #ef4444 14%, transparent);
  color: #ef4444;
  border-color: color-mix(in srgb, #ef4444 30%, transparent);
}
    `,
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
