# Marque Architecture

This document explains how Marque turns `.mq` files into a static site.

## 1) End-to-End Build Flow

For `marque build <site-dir>`:

1. `bin/cli.js` parses command-line arguments.
2. `src/builder.js` loads site config, pages, summary, theme, and layout.
3. `src/parser.js` converts each page body into a unified AST (Abstract Syntax Tree).
4. `src/renderer.js` renders AST nodes to HTML.
5. `src/builder.js` injects content into the page template and writes `dist/*.html`.
6. Static assets are copied to `dist/`.

For `marque serve <site-dir> [port]`:

1. `bin/cli.js` calls `src/server/index.js`.
2. The server does an initial build, then starts HTTP + WebSocket + file watcher.
3. On file changes, watcher triggers rebuild and reload.

For `marque new <site-dir>`:

1. `bin/cli.js` forwards scaffold options.
2. `src/scaffold/index.js` creates starter files.
3. `src/scaffold/starter.js` applies defaults.

## 2) Directive System (Current Model)

Marque now uses one unified directive pipeline.

### Registry API

- `src/directives/registry.js` exposes:
  - `defineDirective(name, { type, render, validate? })`
  - `getDirective(name)`
  - `isInline(name)` and `isBlock(name)`
  - `listDirectives()`

### Built-in directives

- `template/directives/builtins.js` defines the packaged built-ins.
- `src/directives/registry.js` lazily bootstraps those packaged defaults.
- `src/directives/project-loader.js` then loads site-local `directives/*.js` files on each build.
- `src/directives/index.js` re-exports the registry API.

### Parsing behavior

- `src/parser.js` tokenizes all `@tag` lines as directive opens.
- It does not hardcode specific tags.
- During AST build, parser calls `isInline(tag)`:
  - inline directive -> self-closing node
  - block directive -> consumes children until matching `@end tag`

### AST shape

All directives use the same node type:

```js
{
  type: 'directive',
  tag: 'callout',
  inline: false,
  mods: ['warn'],
  name: null,
  children: [...],
  loc: {...}
}
```

### Rendering behavior

- `src/renderer/node-renderers.js` delegates to the directive definition:
  - find definition with `getDirective(node.tag)`
  - call `def.render({ tag, mods, name, children, nodes, node, opts, ctx })`
- Unknown directives fall back safely.

### Directive diagnostics

- `src/directive-diagnostics.js` walks the AST.
- For each directive node, it calls `def.validate(node, state, helpers)` if provided.
- This keeps validation with the directive definition instead of a hardcoded switch.

## 3) Main Runtime Modules

- `src/builder.js`: orchestrates complete site generation.
- `src/parser.js`: `.mq` source to AST.
- `src/renderer.js`: AST to HTML + markdown transforms + syntax highlighting.
- `src/diagnostics.js`: structured diagnostics model.
- `src/utils/errors.js`: pretty diagnostic printing.

## 4) Server Modules (`src/server`)

- `src/server/index.js`: lifecycle + wiring.
- `src/server/http.js`: static file serving + reload snippet injection.
- `src/server/ws.js`: reload signal transport.
- `src/server/watcher.js`: rebuild on file changes.
- `src/server/lock.js`: single-serve process guard.
- `src/server/page-creator.js`: 404-assisted page creation helpers.

## 5) Scaffold Modules (`src/scaffold`)

- `src/scaffold/index.js`: scaffold orchestration.
- `src/scaffold/args.js`: scaffold arg parsing/validation.
- `src/scaffold/starter.js`: starter defaults and file guards.

## 6) Inputs Used To Build A Site

- `pages/**/*.mq`
- `summary.mq`
- `marque.toml`
- `themes/<name>.css`
- `themes/index.html` (optional shared template)
- `layouts/<name>.css`
- `static/**`
- `directives/**/*.js`

## 7) Active vs Split Modules

Active runtime path currently uses:

- `src/parser.js`
- `src/renderer.js`

Split directories (`src/parser/`, `src/renderer/`) exist as modular mirrors and are not the primary path yet.
