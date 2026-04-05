'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('sparkle', {
    type: 'inline',
    style: `
.mq-sparkle {
  display: inline-block;
  animation: sparkle 1.5s infinite;
  color: var(--mq-primary);
}

@keyframes sparkle {
  0%, 100% { opacity: 0.5; transform: scale(0.5) rotate(30deg); }
  50% { opacity: 1; transform: scale(1); }
}
`,
    render: () => '<span class="mq-sparkle" aria-hidden="true">✶</span>',
  });
};
