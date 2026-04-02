# Marque Architecture

This document explains what each major part of the codebase is responsible for.

## 1) End-to-End Flow

For `marque build <site-dir>`:

1. `bin/cli.js` parses the command and arguments.
2. `src/builder.js` loads config, pages, summary, themes, and layouts.
3. `src/parser.js` converts `.mq` content into an AST.
4. `src/renderer.js` converts AST + markdown into HTML fragments.
5. `src/builder.js` injects content into the theme template and writes `dist/*.html`.
6. Static assets are copied to `dist/`.

For `marque serve <site-dir> [port]`:

1. `bin/cli.js` calls `src/server/index.js`.
2. `src/server/index.js` performs an initial build and starts:
   - HTTP server (`src/server/http.js`)
   - WebSocket reload server (`src/server/ws.js`)
   - file watcher (`src/server/watcher.js`)
3. On relevant file changes, the watcher triggers an incremental rebuild and broadcasts reload.

For `marque new <site-dir> ...`:

1. `bin/cli.js` parses scaffold options.
2. `src/scaffold/index.js` copies the starter template.
3. `src/scaffold/starter.js` applies defaults and ensures starter files exist.

## 2) Top-Level Responsibilities

### CLI entrypoint

- `bin/cli.js`
  - Thin command dispatcher only.
  - Routes to build/serve/scaffold modules.
  - Handles user-facing errors and exit codes.

### Build pipeline

- `src/builder.js`
  - Orchestrates full site generation.
  - Reads `marque.toml`, `summary.mq`, and all `.mq` pages.
  - Resolves per-page metadata/frontmatter.
  - Loads theme/layout assets and writes compiled CSS files to `dist/`.
  - Builds nav structures and page sequence.
  - Applies template placeholders and writes final HTML.
  - Copies `static/` assets.

### Parsing (`.mq` -> AST)

- `src/parser.js`
  - Tokenizes Marque directives (`@row`, `@card`, `@tabs`, etc.).
  - Builds AST from token stream.
  - Extracts YAML-like frontmatter.

### Rendering (AST -> HTML)

- `src/renderer.js`
  - Renders AST nodes to HTML components.
  - Runs markdown rendering with syntax highlighting.
  - Handles Marque markdown enhancements (buttons/badges/step behavior).

### MQS compilation (`.mqs` -> CSS)

- `src/mqs.js`
  - Compiles MQS sources to CSS.
  - Expands `@mqs-import` recursively.
  - Expands `@mqs-palette` and `@mqs-essentials` directives.
  - Produces final theme/layout CSS consumed by builder.

## 3) Server Architecture (`src/server`)

- `src/server/index.js`
  - Composition root for dev server.
  - Owns lifecycle (startup, cleanup, signals).

- `src/server/http.js`
  - Serves built files from `dist/`.
  - Injects live-reload snippet into HTML.
  - Handles 404 helper endpoint to create missing pages in dev mode.

- `src/server/watcher.js`
  - Watches relevant files and directories (`pages`, `themes`, `layouts`, config/summary).
  - Triggers rebuild + websocket reload broadcast.
  - Removes generated HTML when an `.mq` source page is deleted.

- `src/server/ws.js`
  - WebSocket server used only for reload notifications.

- `src/server/lock.js`
  - Lock file guard to prevent multiple `serve` processes on the same site.

- `src/server/page-creator.js`
  - Resolves safe target path for 404 page creation.
  - Generates starter content for created page.
  - Contains cleanup helper for deleted generated pages.

## 4) Scaffold Architecture (`src/scaffold`)

- `src/scaffold/index.js`
  - Main scaffold orchestration.
  - Resolves selected layout/theme and copies template.

- `src/scaffold/args.js`
  - Parses scaffold arguments.
  - Supports both styles:
    - `--layout sidebar --theme gouda`
    - `layout:sidebar theme:gouda`
  - Validates selected layout/theme against available files.

- `src/scaffold/starter.js`
  - Applies selected defaults to `marque.toml`.
  - Ensures required starter page(s) exist.

## 5) Shared Utilities (`src/utils`)

- `src/utils/errors.js`
  - Build error formatting/printing.

- `src/utils/fs.js`
  - Generic filesystem helpers (copy directories, list names, normalize relative paths).

- `src/utils/strings.js`
  - String helpers (`slugify`, `toTitle`, JS escaping, layout alias normalization).

## 6) Source vs Split Modules

The currently active build path uses:

- `src/parser.js`
- `src/renderer.js`
- `src/mqs.js`

There are also split directories (`src/parser/`, `src/renderer/`, `src/mqs/`) that mirror this logic in modular form. They are currently not wired as the primary runtime path. This is useful to know when editing internals: if behavior changes are expected at runtime today, update the active files above.

## 7) Content and Template Inputs

A generated site is assembled from these user/project inputs:

- `pages/**/*.mq` (page content)
- `summary.mq` (navigation/order)
- `marque.toml` (global defaults)
- `themes/<name>/theme.css` or `theme.mqs`
- `themes/<name>/index.html` (optional page shell)
- `layouts/<name>.css` or `<name>.mqs`
- `static/**` (copied as-is)

## 8) What Is Legacy vs Current

Current architecture:

- `bin/cli.js` thin orchestration
- `src/server/*` modular dev server
- `src/scaffold/*` modular scaffolding

Removed legacy:

- old monolithic `src/watcher.js`

Potential future cleanup/migration target:

- switch builder imports from monolithic parser/renderer/mqs files to split module folders once fully validated.
