'use strict';

const { DiagnosticLevel, createDiagnostic } = require('./diagnostics');

const KNOWN_CALLOUT_VARIANTS = new Set(['info', 'warn', 'danger', 'ok', 'primary', 'secondary', 'ternary']);

function collectDirectiveDiagnostics(ast, context) {
  const file = context && context.file ? context.file : '<unknown>';
  const lineOffset = context && Number.isFinite(context.lineOffset) ? context.lineOffset : 0;
  const diagnostics = [];
  const rootChildren = ast && Array.isArray(ast.children) ? ast.children : [];

  for (const node of rootChildren) {
    walk(node, { parentType: 'root', file, diagnostics, lineOffset });
  }

  return diagnostics;
}

function walk(node, state) {
  if (!node || typeof node !== 'object') return;

  validateNode(node, state);

  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    walk(child, { ...state, parentType: node.type || state.parentType });
  }
}

function validateNode(node, state) {
  const diagnostics = state.diagnostics;
  const parentType = state.parentType;
  const file = state.file;
  const lineOffset = state.lineOffset;

  const span = spanFromNode(node, file, lineOffset);

  switch (node.type) {
    case 'row': {
      const hasLayoutChild = hasAnyChildType(node, ['column', 'card', 'stat', 'step']);
      if (!hasLayoutChild) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ201',
          message: '@row has no layout children (card/column/stat/step).',
          spans: [span],
          suggestions: [{ message: 'add at least one child (@card, @column, @stat, @step) inside this @row' }],
        }));
      }
      break;
    }

    case 'column':
      break;

    case 'card':
      break;

    case 'callout': {
      const variant = String(node.variant || 'info').toLowerCase();
      if (!KNOWN_CALLOUT_VARIANTS.has(variant)) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ204',
          message: `unknown callout variant "${variant}".`,
          spans: [span],
          suggestions: [{ message: 'use one of: info, warn, danger, ok, primary, secondary, ternary' }],
        }));
      }
      break;
    }

    case 'stat':
      break;

    case 'tabs': {
      const tabCount = (node.children || []).filter(c => c.type === 'tab').length;
      if (tabCount === 0) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.ERROR,
          code: 'MQ101',
          message: '@tabs must contain at least one @tab block.',
          spans: [span],
          suggestions: [{ message: 'add @tab <label> ... @end tab inside this @tabs block' }],
        }));
      }
      break;
    }

    case 'tab': {
      if (parentType !== 'tabs') {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.ERROR,
          code: 'MQ100',
          message: '@tab must be nested inside @tabs.',
          spans: [span],
          suggestions: [{ message: 'wrap this block in @tabs ... @end tabs' }],
        }));
      }
      break;
    }

    case 'steps': {
      const stepCount = (node.children || []).filter(c => c.type === 'step').length;
      if (stepCount === 0) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.ERROR,
          code: 'MQ102',
          message: '@steps must contain at least one @step block.',
          spans: [span],
          suggestions: [{ message: 'add @step ... @end step inside this @steps block' }],
        }));
      }
      break;
    }

    case 'step': {
      // Standalone steps and custom names are currently supported behavior.
      break;
    }

    case 'hero': {
      if (!hasVisibleContent(node)) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ206',
          message: '@hero has no visible content.',
          spans: [span],
        }));
      }
      break;
    }

    case 'section': {
      if (!hasVisibleContent(node)) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ207',
          message: '@section has no visible content.',
          spans: [span],
        }));
      }
      break;
    }

    case 'divider':
      break;

    case 'generic': {
      diagnostics.push(createDiagnostic({
        level: DiagnosticLevel.WARNING,
        code: 'MQ200',
        message: `unknown directive @${node.tag}.`,
        spans: [span],
        suggestions: [{ message: 'check directive spelling or use plain markdown instead' }],
      }));
      break;
    }

    default:
      break;
  }
}

function spanFromNode(node, file, lineOffset) {
  const loc = node && node.loc ? node.loc : null;
  const offset = Number.isFinite(lineOffset) ? lineOffset : 0;
  return {
    file,
    start_line: (loc && loc.start_line ? loc.start_line : 1) + offset,
    start_col: loc && loc.start_col ? loc.start_col : 1,
    end_line: (loc && loc.end_line ? loc.end_line : (loc && loc.start_line ? loc.start_line : 1)) + offset,
    end_col: loc && loc.end_col ? loc.end_col : (loc && loc.start_col ? loc.start_col : 1),
  };
}

function hasAnyChildType(node, types) {
  const children = Array.isArray(node.children) ? node.children : [];
  return children.some(child => types.includes(child.type));
}

function hasVisibleContent(node) {
  const children = Array.isArray(node.children) ? node.children : [];
  for (const child of children) {
    if (child.type === 'markdown' && /\S/.test(String(child.content || ''))) return true;
    if (child.type !== 'markdown') return true;
  }
  return false;
}

module.exports = { collectDirectiveDiagnostics };
