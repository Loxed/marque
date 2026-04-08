'use strict';

const path = require('path');

/**
 * Directive Registry
 * ==================
 * The single source of truth for all directives — built-in and custom.
 *
 * Usage:
 *
 *   const { defineDirective } = require('./directives/registry');
 *
 *   // Inline directive — self-closing, no @end needed
 *   defineDirective('divider', {
 *     type: 'inline',
 *     render: () => '<div class="mq-divider"></div>',
 *   });
 *
 *   // Block directive — has children, requires @end name
 *   defineDirective('callout', {
 *     type: 'block',
 *     render: ({ mods, children }) =>
 *       `<div class="mq-callout ${mods[0] || 'info'}">${children}</div>`,
 *   });
 *
 *   // Web component wrapper — drop in any custom element
 *   defineDirective('my-card', {
 *     type: 'block',
 *     render: ({ mods, name, children }) =>
 *       `<my-card variant="${mods[0] || ''}" label="${name || ''}">${children}</my-card>`,
 *   });
 *
 * render() receives:
 *   {
 *     tag      : string          - directive name as written in source
 *     mods     : string[]        - modifier tokens (.foo .bar => ['foo','bar'])
 *     name     : string|null     - trailing bare-word argument
 *     children : string          - already-rendered HTML of child nodes (block only)
 *     nodes    : ASTNode[]       - raw child AST nodes (if you need to re-render with custom opts)
 *     node     : ASTNode         - the full AST node
 *     opts     : object          - renderer options
 *     ctx      : object          - { renderNodes, renderMarkdown, escapeAttr }
 *   }
 */

const _registry = new Map();
let _bootstrapped = false;

function ensureBootstrapped() {
  if (_bootstrapped) return;
  _bootstrapped = true;

  // Load built-in directive definitions on demand.
  loadBuiltinsFresh();
}

function loadBuiltinsFresh() {
  const builtinsPath = path.resolve(__dirname, '..', '..', 'template', 'directives', 'builtins.js');
  const resolved = require.resolve(builtinsPath);
  delete require.cache[resolved];

  const mod = require(resolved);
  const api = { defineDirective };

  if (typeof mod === 'function') {
    mod(api);
    return;
  }

  if (mod && typeof mod.register === 'function') {
    mod.register(api);
  }
}

function resetDirectives() {
  _registry.clear();
  _bootstrapped = false;
}

function bootstrapBuiltins() {
  ensureBootstrapped();
}

/**
 * Register a directive.
 * @param {string} name
 * @param {{ type: 'block'|'inline', render: Function, validate?: Function, style?: string|Function }} def
 */
function defineDirective(name, def) {
  if (!name || typeof name !== 'string') {
    throw new Error('defineDirective: name must be a non-empty string');
  }
  if (def.type !== 'block' && def.type !== 'inline') {
    throw new Error(`defineDirective: type must be 'block' or 'inline', got '${def.type}'`);
  }
  if (typeof def.render !== 'function') {
    throw new Error('defineDirective: render must be a function');
  }
  if (def.style !== undefined && def.style !== null && typeof def.style !== 'string' && typeof def.style !== 'function') {
    throw new Error('defineDirective: style must be a string or function when provided');
  }
  _registry.set(name.toLowerCase(), { validate: null, style: null, ...def });
}

/** Look up a directive definition by name. Returns null if not found. */
function getDirective(name) {
  ensureBootstrapped();
  return _registry.get(String(name || '').toLowerCase()) || null;
}

/** Returns true if the named directive is registered as inline (self-closing, no @end). */
function isInline(name) {
  const d = getDirective(name);
  return !!(d && d.type === 'inline');
}

/** Returns true if the named directive is registered as block (has children, needs @end). */
function isBlock(name) {
  const d = getDirective(name);
  return !!(d && d.type === 'block');
}

/** Returns all registered directive names and types — useful for tooling/diagnostics. */
function listDirectives() {
  ensureBootstrapped();
  return [..._registry.entries()].map(([name, def]) => ({ name, type: def.type }));
}

/**
 * Resolve optional CSS/MQS snippets provided by directives.
 * The returned list contains only non-empty style chunks.
 */
function collectDirectiveStyles() {
  ensureBootstrapped();

  const styles = [];
  for (const [name, def] of _registry.entries()) {
    if (!def || def.style === null || def.style === undefined) continue;

    const rawStyle = typeof def.style === 'function'
      ? def.style({ name, type: def.type })
      : def.style;

    if (rawStyle === null || rawStyle === undefined) continue;
    if (typeof rawStyle !== 'string') {
      throw new Error(`defineDirective: style for '@${name}' must resolve to a string`);
    }

    const css = rawStyle.trim();
    if (!css) continue;
    styles.push({ name, css });
  }

  return styles;
}

module.exports = {
  defineDirective,
  getDirective,
  isInline,
  isBlock,
  listDirectives,
  collectDirectiveStyles,
  resetDirectives,
  bootstrapBuiltins,
};
