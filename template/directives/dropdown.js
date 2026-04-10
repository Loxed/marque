'use strict';

module.exports = ({ defineDirective }) => {
  // Placeholder/template file:
  // Keep simple examples here; split larger directives into dedicated files.

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
    render: ({ mods, name, children, node, ctx }) => {
      const title = ctx.escapeAttr(name || 'More details');
      // .open opens dropdown by default
      const isOpen = (mods || []).some(m => /^(open|expanded|default-open)$/i.test(String(m || '')));
      const startLine = Number(node && node.loc && node.loc.start_line) || 0;
      const startCol = Number(node && node.loc && node.loc.start_col) || 0;
      const dropdownId = `dropdown-${startLine}-${startCol}`;
      return `<details class="mq-dropdown" data-mq-dropdown-id="${ctx.escapeAttr(dropdownId)}"${isOpen ? ' open' : ''}><summary>${title}</summary><div class="mq-dropdown-content">${children}</div></details>`;
    },
  });
};
