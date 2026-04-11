'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('sparkle', {
    type: 'inline',
    render: () => '<span class="mq-sparkle" aria-hidden="true">✶</span>',
  });
};
