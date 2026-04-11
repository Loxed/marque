'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('actions', {
    type: 'block',
    style: `
.mq-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin: 1rem 0;
}

.mq-actions.center {
  justify-content: center;
}

.mq-actions.right {
  justify-content: flex-end;
}

.mq-actions.stack {
  flex-direction: column;
  align-items: stretch;
}

.mq-actions.stack > * {
  width: 100%;
}

.mq-actions > a.mq-btn {
  margin-top: 0;
}

.mq-actions > :first-child {
  margin-top: 0;
}

.mq-actions > :last-child {
  margin-bottom: 0;
}
`,
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
