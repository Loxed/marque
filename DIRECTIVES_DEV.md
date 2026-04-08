# Marque Directive Dev Guide

This is the practical guide for directives in the current architecture.

## 1) Mental model (simple)

One directive definition controls everything:

- what it is (`inline` or `block`)
- how it renders (`render`)
- how it validates (`validate`, optional)

You register it once with `defineDirective(...)`.
No parser switch-case, no renderer switch-case.

## 2) Files that matter

- `src/directives/registry.js`
  - Core API: `defineDirective`, `getDirective`, `isInline`, `isBlock`.
- `template/directives/builtins.js`
  - Packaged built-in directives live here so scaffolded sites and runtime defaults match.
- `src/directives/project-loader.js`
  - Loads `directives/*.js` from the active site on each build.
- `src/directives/index.js`
  - Re-exports the registry API.
- `src/parser.js`
  - Reads tags and asks registry if tag is inline.
- `src/renderer/node-renderers.js`
  - Looks up directive and calls `def.render(...)`.
- `src/directive-diagnostics.js`
  - Calls `def.validate(...)` hooks.

## 3) Directive API

```js
defineDirective('my-tag', {
  type: 'block' | 'inline',
  render: ({ tag, mods, name, children, nodes, node, opts, ctx }) => '...html...',
  validate: (node, state, helpers) => {
    // optional
  },
});
```

### `render` payload

- `tag`: directive name
- `mods`: modifiers from `.foo .bar`
- `name`: trailing argument
- `children`: rendered HTML children (block only)
- `nodes`: raw AST children
- `node`: full AST node
- `opts`: render options
- `ctx`: helper functions (`renderNodes`, `renderMarkdown`, `escapeAttr`)

## 4) Create a new block element

Example: add `@product-card` that wraps content in a web component.

Add this in `directives/product-card.js` in your site
(or `template/directives/builtins.js` if you're editing package defaults):

```js
module.exports = ({ defineDirective }) => {
  defineDirective('product-card', {
    type: 'block',
    render: ({ mods, name, children, ctx }) => {
      const variant = ctx.escapeAttr(mods[0] || 'default');
      const title = ctx.escapeAttr(name || '');
      return `<product-card variant="${variant}" title="${title}">${children}</product-card>`;
    },
  });
};
```

Use it in `.mq`:

```mq
@product-card .featured Starter
## Fast setup
Ready in 2 minutes.
@end product-card
```

Notes:

- Hyphenated names are supported (`product-card`).
- Block directives must be closed with `@end <same-name>`.

## 5) Create a new inline element

```js
module.exports = ({ defineDirective }) => {
  defineDirective('sparkle', {
    type: 'inline',
    render: () => '<span class="mq-sparkle" aria-hidden="true">*</span>',
  });
};
```

Use it in `.mq`:

```mq
Hello @sparkle
```

Inline directives are self-closing and do not use `@end`.

## 6) Add validation (optional)

If a directive needs lint-like checks, add `validate`:

```js
module.exports = ({ defineDirective }) => {
  defineDirective('callout', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const variant = (node.mods || [])[0];
      const ok = new Set(['info', 'warn', 'danger']);
      if (variant && !ok.has(variant)) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ301',
          message: `Unknown @callout variant '${variant}'.`,
        }));
      }
    },
    render: ({ children }) => `<div class="mq-callout">${children}</div>`,
  });
};
```

## 7) Zero-core-change workflow

For most new elements, only do this:

1. Register directive with `defineDirective(...)`.
   Put it in `directives/*.js` so Marque loads it with the rest of the template/site directives.
2. Add CSS classes/styles in theme/layout.
3. Use directive in `.mq` files.

No edits needed in parser core or renderer core.

## 8) Quick checklist

1. Directive registered (`type`, `render`).
2. Optional `validate` added for guardrails.
3. Styles added in CSS.
4. Example usage tested in a page.
