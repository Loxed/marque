'use strict';

module.exports = ({ defineDirective }) => {
  // Placeholder/template file:
  // Keep simple examples here; split larger directives into dedicated files.

  defineDirective('dropdown', {
    type: 'block',
    render: ({ mods, name, children, node, ctx }) => {
      const title = ctx.escapeAttr(name || 'More details');
      // .open opens dropdown by default
      const isOpen = (mods || []).some(m => /^(open|expanded|default-open)$/i.test(String(m || '')));
      const disableCache = (mods || []).some(m => /^disable-cache$/i.test(String(m || '')));
      const startLine = Number(node && node.loc && node.loc.start_line) || 0;
      const startCol = Number(node && node.loc && node.loc.start_col) || 0;
      const dropdownId = `dropdown-${startLine}-${startCol}`;
      const cacheAttr = disableCache ? ' data-mq-dropdown-cache="disabled"' : '';
      return `<details class="mq-dropdown" data-mq-dropdown-id="${ctx.escapeAttr(dropdownId)}"${cacheAttr}${isOpen ? ' open' : ''}><summary>${title}</summary><div class="mq-dropdown-content">${children}</div></details>`;
    },
  });
};
