'use strict';

const { DiagnosticLevel, createDiagnostic } = require('./diagnostics');
const { getDirective } = require('./directives/registry');

/**
 * Walk the AST and call any validate() hooks registered on directives.
 * Built-in directives define their own validation inline in builtins.js.
 * Custom directives can do the same.
 */
function collectDirectiveDiagnostics(ast, context) {
  const file       = (context && context.file)       ? context.file       : '<unknown>';
  const lineOffset = (context && Number.isFinite(context.lineOffset)) ? context.lineOffset : 0;
  const diagnostics = [];

  for (const node of (ast && Array.isArray(ast.children) ? ast.children : [])) {
    walk(node, { file, lineOffset, diagnostics });
  }

  return diagnostics;
}

function walk(node, state) {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'directive') {
    validateDirective(node, state);
  }

  for (const child of (Array.isArray(node.children) ? node.children : [])) {
    walk(child, { ...state, _parentTag: node.tag });
  }
}

function validateDirective(node, state) {
  const def = getDirective(node.tag);
  if (!def || typeof def.validate !== 'function') return;

  // Pass a createDiagnostic helper pre-bound to this node's location
  const span = spanFromNode(node, state.file, state.lineOffset);
  const boundCreate = (opts) => createDiagnostic({ spans: [span], ...opts });

  def.validate(node, { ...state }, {
    createDiagnostic: boundCreate,
    DiagnosticLevel,
  });
}

function spanFromNode(node, file, lineOffset) {
  const loc = node.loc || {};
  return {
    file,
    start_line: (loc.start_line || 1) + lineOffset,
    start_col : loc.start_col  || 1,
    end_line  : (loc.end_line  || loc.start_line || 1) + lineOffset,
    end_col   : loc.end_col    || 1,
  };
}

module.exports = { collectDirectiveDiagnostics };
