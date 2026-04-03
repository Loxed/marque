'use strict';

const { renderNodes } = require('./nodes');

/**
 * Render a parsed .mq AST to an HTML string.
 * @param {object} ast   - root node produced by parser/index.js
 * @param {object} [opts]
 * @param {function} [opts.resolveHref] - optional href transform hook
 */
function render(ast, opts = {}) {
  return renderNodes(ast.children, opts);
}

module.exports = { render };