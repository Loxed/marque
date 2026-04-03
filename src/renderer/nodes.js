'use strict';

const { escapeAttr } = require('./html');
const { renderMarkdown} = require('./markdown');
const { renderNodeWithRegistry } = require('./node-renderers');

function renderNodes(nodes, opts) {
  return nodes.map(n => renderNode(n, opts)).join('\n');
}

function renderNode(node, opts) {
  return renderNodeWithRegistry(node, opts, { renderNodes, renderMarkdown, escapeAttr });
}

module.exports = { renderNode, renderNodes };