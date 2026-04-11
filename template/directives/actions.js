'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('actions', {
    type: 'block',
    render: ({ mods, children }) => {
      const cls = mods.length ? ` ${mods.join(' ')}` : '';
      return `<div class="mq-actions${cls}">${normalizeActionsChildren(children)}</div>`;
    },
  });
};

function normalizeActionsChildren(html) {
  const trimmed = String(html || '').trim();
  if (!trimmed) return '';

  const match = trimmed.match(/^<p>([\s\S]*)<\/p>$/i);
  const content = match ? match[1] : trimmed;
  return content.replace(/<br\s*\/?>\s*/gi, '');
}
