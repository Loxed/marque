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
