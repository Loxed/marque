'use strict';

/**
 * Directives public API
 * =====================
 * Packaged defaults are loaded lazily from template/directives/builtins.js
 * by the registry on first lookup.
 */

// Re-export public API for convenience
const { defineDirective, getDirective, isInline, isBlock, listDirectives } = require('./registry');

module.exports = { defineDirective, getDirective, isInline, isBlock, listDirectives };
