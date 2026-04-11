'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('product-card', {
    type: 'block',
    render: ({ mods, name, children, ctx }) => {
      const variant = ctx.escapeAttr(mods[0] || 'default');
      const title = ctx.escapeAttr(name || '');
      return `<product-card variant="${variant}" title="${title}">${children}</product-card>`;
    },
  });
};
