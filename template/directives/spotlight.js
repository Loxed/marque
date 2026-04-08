'use strict';

module.exports = ({ defineDirective }) => {

  defineDirective('spotlight', {
    type: 'inline',
    render: () => '<div class="mq-spotlight"></div>',
    });
};