'use strict';

/**
 * Directives entry point
 * ======================
 * Loads all built-in directives and re-exports the public API.
 * Require this once at startup (builder.js or your app entry).
 *
 * To add a custom directive from userland:
 *
 *   const { defineDirective } = require('marque/src/directives');
 *
 *   defineDirective('my-banner', {
 *     type: 'block',
 *     render: ({ mods, name, children }) =>
 *       `<my-banner theme="${mods[0] || 'default'}">${children}</my-banner>`,
 *   });
 *
 *   defineDirective('timestamp', {
 *     type: 'inline',
 *     render: () => `<time datetime="${new Date().toISOString()}">${new Date().toLocaleDateString()}</time>`,
 *   });
 */

// Load built-ins (has side effects — registers all built-in directives)
require('./builtins');

// Re-export public API for convenience
const { defineDirective, getDirective, isInline, isBlock, listDirectives } = require('./registry');

module.exports = { defineDirective, getDirective, isInline, isBlock, listDirectives };
