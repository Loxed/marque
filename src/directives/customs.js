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

defineDirective('sparkle', {
  type: 'inline',
  style: `
.mq-sparkle {
    display: inline-block;
    animation: sparkle 1.5s infinite;
    color: var(--mq-primary);
}
@keyframes sparkle {
    0%, 100% { opacity: 0.5; transform: scale(0.5); transform: rotate(180deg); }
    50% { opacity: 1; transform: scale(1.5);}
}
`,
  render: () => '<span class="mq-sparkle" aria-hidden="true">✶</span>',
});

defineDirective('dropdown', {
  type: 'block',
  style: `
.mq-dropdown {
  border: 1px solid var(--mq-border);
  border-radius: var(--mq-radius);
  background: var(--mq-surface);
  margin: 1rem 0;
  overflow: clip;
}

.mq-dropdown > summary {
  cursor: pointer;
  padding: 0.8rem 1rem;
  font-weight: 600;
  list-style: none;
}

.mq-dropdown > summary::-webkit-details-marker {
  display: none;
}

.mq-dropdown > summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.5rem;
  transition: transform 0.2s ease;
}

.mq-dropdown[open] > summary::before {
  transform: rotate(90deg);
}

.mq-dropdown-content {
  border-top: 1px solid var(--mq-border);
  padding: 0.9rem 1rem 1rem;
}

.mq-dropdown-content > :first-child {
  margin-top: 0;
}

.mq-dropdown-content > :last-child {
  margin-bottom: 0;
}
`,
  render: ({ mods, name, children, ctx }) => {
    const title = ctx.escapeAttr(name || 'More details');
    const isOpen = (mods || []).some(m => /^(open|expanded|default-open)$/i.test(String(m || '')));
    return `<details class="mq-dropdown"${isOpen ? ' open' : ''}><summary>${title}</summary><div class="mq-dropdown-content">${children}</div></details>`;
  },
});
  