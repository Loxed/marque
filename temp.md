# `src/` Architecture

This is the actual runtime structure of `src/` as the project stands now.

## High-level shape

Most of Marque's core pipeline lives in top-level files inside `src/`.
The subfolders mostly group supporting modules for directives, dev-server behavior, scaffolding, and utilities.

There are three main flows:

- `marque build`:
  `src/cli.js` -> `src/builder.js` -> `src/parser.js` -> `src/renderer.js`
- `marque serve`:
  `src/cli.js` -> `src/server/index.js` -> build + HTTP server + WebSocket reload + file watcher
- `marque new`:
  `src/cli.js` -> `src/scaffold/index.js`

## Top-level files

- `src/cli.js`
  The command-line entrypoint for the package.
  Parses `build`, `serve`, and `new`, resolves paths, and dispatches into the right module.

- `src/builder.js`
  The main site compiler.
  Loads `marque.toml`, discovers pages, loads summary/navigation, refreshes directives, resolves theme/layout assets, parses each page, renders HTML, applies the template, writes `dist/`, and copies static files.
  This is the orchestration layer for the whole static-site build.

- `src/parser.js`
  Turns `.mq` source into an AST.
  It also strips page frontmatter before parsing body content.
  It knows:
  - directive syntax like `@row`, `@card`, `@end card`
  - markdown/plain-text nodes
  - horizontal rules inside page content
  - frontmatter handling (`+++` TOML as the preferred format, with legacy `---` support)

- `src/renderer.js`
  Turns the AST into HTML.
  It handles:
  - markdown rendering through `marked`
  - syntax highlighting through `highlight.js`
  - inline badge/button syntax
  - inline directive expansion
  - `.mq` link rewriting to `.html`
  - delegation of directive nodes to the directive registry

- `src/diagnostics.js`
  Defines the project's structured diagnostic model.
  It provides diagnostic levels, constructors, formatting, and the error wrapper used when builds fail with source-aware messages.

- `src/directive-diagnostics.js`
  Walks the parsed AST and runs `validate()` hooks on directives.
  This is where directive-specific warnings and errors are collected before rendering.

## Folders

### `src/directives/`

This folder is the directive system.
It is responsible for registering directives, bootstrapping packaged defaults, and loading site-local directive files.

- `src/directives/registry.js`
  The source of truth for directive definitions.
  Exposes registration and lookup APIs like `defineDirective`, `getDirective`, `isInline`, and `listDirectives`.
  It also lazily loads the packaged built-ins from `template/directives/builtins.js`.

- `src/directives/project-loader.js`
  Reloads directives for a specific site during a build.
  It resets the registry, loads packaged built-ins, then loads every `directives/*.js` file from the active site.

- `src/directives/index.js`
  Small public API surface that re-exports the registry helpers.
  This is the convenient import point for directive-related code.

### `src/renderer/`

Right now this folder only contains one helper module.
The main renderer logic lives in `src/renderer.js`.

- `src/renderer/node-renderers.js`
  Contains the node-level rendering dispatch.
  It renders:
  - markdown nodes
  - `<hr>` nodes
  - directive nodes via the directive registry
  It is the bridge between the AST and per-directive `render()` functions.

### `src/server/`

This folder powers `marque serve`.
It handles the development server, live reload, file watching, and the optional 404 page-creation helper.

- `src/server/index.js`
  Main entrypoint for serve mode.
  Runs the initial build, starts the HTTP and WebSocket servers, starts the file watcher, and manages process cleanup.

- `src/server/http.js`
  The development HTTP server.
  Serves built files from `dist/`, injects the live-reload snippet into HTML, serves `404.html` when needed, and exposes the internal route used to create missing pages from the 404 screen.

- `src/server/ws.js`
  Tiny WebSocket wrapper used for live reload.
  Starts a WebSocket server and exposes `broadcast()` to tell connected browsers to reload.

- `src/server/watcher.js`
  Watches the site for relevant changes and triggers rebuilds.
  It reacts to changes in:
  - `pages/`
  - `themes/`
  - `layouts/`
  - `directives/`
  - `marque.toml`
  - `summary.mq`
  It also avoids watching `dist/` as a rebuild trigger.

- `src/server/lock.js`
  Prevents multiple `marque serve` processes from owning the same site at once.
  It creates and releases `.marque-serve.lock`.

- `src/server/page-creator.js`
  Helper logic for the "create this page from 404" workflow.
  Resolves a missing URL to a safe `.mq` target path, generates starter page content, and removes generated HTML when a source page is deleted.

### `src/scaffold/`

This folder powers `marque new`.
It copies the starter template and applies the selected defaults.

- `src/scaffold/index.js`
  Main scaffold entrypoint.
  Copies `template/` into the new site directory, applies the requested layout/theme, and ensures the starter page exists.

- `src/scaffold/args.js`
  Parses scaffold CLI arguments and validates the chosen layout/theme against the packaged template assets.

- `src/scaffold/starter.js`
  Applies default values into the scaffolded `marque.toml` and writes the starter page if it is missing.

### `src/utils/`

Shared helpers used across the project.

- `src/utils/errors.js`
  Pretty-printing for build errors and diagnostics.
  This is the main bridge from structured diagnostics to terminal output.

- `src/utils/fs.js`
  Small filesystem helpers.
  Includes recursive copy and directory name listing helpers used by scaffolding and asset resolution.

- `src/utils/strings.js`
  General string/path helpers.
  Includes slugification, title generation, JavaScript escaping, and layout-name normalization.

- `src/utils/toml.js`
  A small TOML parser for the subset Marque uses.
  It powers `marque.toml` parsing and `+++` frontmatter parsing.

### `src/parser/`

This directory currently exists but is empty.
It used to hold a split parser implementation.
The active parser now lives entirely in `src/parser.js`.

### `src/mqs/`

This directory currently exists but is empty.
It was the old MQS area and no longer has an active runtime role.

## Practical summary

If you want to understand the core site-generation path, start here:

1. `src/cli.js`
2. `src/builder.js`
3. `src/parser.js`
4. `src/renderer.js`
5. `src/directives/registry.js`

If you want to understand live dev behavior, read `src/server/`.

If you want to understand project creation, read `src/scaffold/`.
