'use strict';

const { getDirective } = require('../directives/registry');

// ── Core (non-directive) node renderers ─────────────────────────────────────

const CORE_RENDERERS = {
  markdown: (node, opts, ctx) => ctx.renderMarkdown(node.content, opts),
  hr: () => '<hr>',
};

// ── Directive node renderer ──────────────────────────────────────────────────
//
// All @directives produce { type: 'directive', tag, inline, mods, name, children }.
// We look up the registered definition and call its render() function.
//
// render() receives:
//   { tag, mods, name, children (HTML string), nodes (raw AST), node, opts, ctx }
//
// If the directive isn't registered we fall back gracefully:
//   - inline unknown  → HTML comment
//   - block unknown   → <div class="mq-tagname">…</div>

function renderDirective(node, opts, ctx) {
  const def = getDirective(node.tag);

  // Pre-render children for block directives (inline has none)
  const children = node.inline ? '' : ctx.renderNodes(node.children || [], opts);

  if (def) {
    return def.render({
      tag     : node.tag,
      mods    : node.mods  || [],
      name    : node.name  || null,
      children,                           // rendered HTML
      nodes   : node.children || [],      // raw AST nodes (if you need re-render)
      node,
      opts,
      ctx,
    });
  }

  // ── Unknown directive fallback ───────────────────────────────────────────
  if (node.inline) {
    return `<!-- @${node.tag} (unregistered inline directive) -->`;
  }
  const cls = (node.mods || []).join(' ');
  return `<div class="mq-${node.tag}${cls ? ' ' + cls : ''}">${children}</div>`;
}

// ── Entry point ─────────────────────────────────────────────────────────────

function renderNodeWithRegistry(node, opts, ctx) {
  if (CORE_RENDERERS[node.type]) {
    return CORE_RENDERERS[node.type](node, opts, ctx);
  }
  if (node.type === 'directive') {
    return renderDirective(node, opts, ctx);
  }
  return '';
}

module.exports = { renderNodeWithRegistry };
