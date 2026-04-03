'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('product-card', {
    type: 'block',
    style: `
product-card {
  display: block;
  border: 1px solid var(--mq-border);
  background: var(--mq-surface);
  border-radius: var(--mq-radius);
  padding: 1rem;
}

product-card[variant="featured"] {
  border-color: var(--mq-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--mq-primary) 25%, transparent);
}

product-card > :first-child {
  margin-top: 0;
}

product-card > :last-child {
  margin-bottom: 0;
}
`,
    render: ({ mods, name, children, ctx }) => {
      const variant = ctx.escapeAttr(mods[0] || 'default');
      const title = ctx.escapeAttr(name || '');
      return `<product-card variant="${variant}" title="${title}">${children}</product-card>`;
    },
  });
};
