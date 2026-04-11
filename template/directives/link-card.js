'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('link-card', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      if (String(node.name || '').trim()) return;

      diagnostics.push(createDiagnostic({
        level: DiagnosticLevel.WARNING,
        code: 'MQ341',
        message: '@link-card is missing a target href.',
        suggestions: [{ message: 'add a page path or URL after the directive name', replacement: '@link-card /docs/cli.mq' }],
      }));
    },
    style: `
a.mq-link-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-height: 100%;
  color: inherit;
  text-decoration: none !important;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

a.mq-link-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--mq-primary, currentColor) 26%, var(--mq-border, transparent));
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.08);
}

.mq-link-card-body {
  display: block;
}

.mq-link-card-body > :first-child {
  margin-top: 0;
}

.mq-link-card-body > :last-child {
  margin-bottom: 0;
}

.mq-link-card-arrow {
  margin-top: auto;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--mq-tone, var(--mq-primary, currentColor));
}
`,
    render: ({ mods, name, children, opts, ctx }) => {
      const href = ctx.escapeAttr(resolveDirectiveHref(name, opts));
      const cls = mods.length ? ` ${mods.join(' ')}` : '';
      const arrow = 'Open ➽';
      return `<a href="${href}" class="mq-card mq-link-card${cls}"><div class="mq-link-card-body">${children}</div><div class="mq-link-card-arrow" aria-hidden="true">${arrow}</div></a>`;
    },
  });
};

function resolveDirectiveHref(rawHref, opts = {}) {
  const raw = String(rawHref || '').trim();
  if (!raw) return '#';

  let resolved = raw;
  if (opts && typeof opts.resolveHref === 'function') {
    try {
      resolved = opts.resolveHref(raw);
    } catch (_) {
      resolved = raw;
    }
  }

  return resolved.replace(/\.mq(?=([?#]|$))/i, '.html');
}
