'use strict';

const { defineDirective } = require('./registry');

/** 
 * Custom Directives
 * 
 * This is the single place to register project-specific directives.
 *
 * How to use:
 * 1) Add a defineDirective(...) call in this file.
 * 2) Restart `marque serve` if it is already running.
 *
 * No parser core edit or renderer switch-case is needed.
 */

defineDirective('product-card', {
  type: 'block',
  render: ({ mods, name, children, ctx }) => {
    const variant = ctx.escapeAttr(mods[0] || 'default');
    const title = ctx.escapeAttr(name || '');
    return `<product-card variant="${variant}" title="${title}">${children}</product-card>`;
  },
});

defineDirective('sparkle', {
  type: 'inline',
  render: () => '<span class="mq-sparkle" aria-hidden="true">*</span>',
});