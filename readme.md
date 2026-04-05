# Marque

Marque is a static site generator powered by `.mq`: markdown plus layout directives.

You write content quickly, keep structure explicit, and ship plain static HTML/CSS.

Architecture and module roles are documented in `ARCHITECTURE.md`.
Directive extension workflow is documented in `DIRECTIVES_DEV.md`.

## Why Marque

- Markdown-first authoring with composable layout blocks.
- Zero runtime framework on the generated site.
- Built-in live reload for fast docs and content workflows.
- Theme system with shared default template and optional per-theme HTML shell.
- Per-page controls via frontmatter (`theme`, `width`, nav metadata, etc.).

## Install

Requirements: Node.js 18+

```sh
npm install
npm link
```

After linking, the `marque` command is available globally.

## Quickstart

```sh
marque new D:\Sites\my-site
cd D:\Sites\my-site
marque serve .
```

Choose a starter layout/theme at scaffold time:

```sh
marque new D:\Sites\docs-site layout:sidebar theme:gouda
```

Open `http://localhost:3000`.

When ready to publish:

```sh
marque build .
```

Output goes to `dist/`.

## CLI

```text
marque new   <dir> [layout:<name>] [theme:<name>]    scaffold a new site
marque serve <dir>    dev server with live reload (default port 3000)
marque build <dir>    compile site to dist/
```

`<dir>` defaults to `.`.

## Project Structure

```text
my-site/
├── pages/         # .mq source pages
├── layouts/       # local editable layouts copied at scaffold
├── themes/        # local editable themes copied at scaffold
├── static/        # copied as-is to dist/
├── marque.toml    # site config
└── dist/          # generated output
```

Built-in starter layouts/themes are sourced from `template/` in the package, then copied into each new project.

## Configuration

`marque.toml` controls global defaults:

```toml
title = "My Site"
description = "Built with Marque"
layout = "topnav"
theme = "default"
width = 82
```

- `title`: site title used in templates.
- `description`: fallback page meta description.
- `layout`: global layout name (`topnav` or `sidebar`).
  legacy values `default`, `xmb`, and `crossmediabar` resolve to `topnav`.
- `theme`: global theme name.
- `width`: global page width occupancy (percentage-based, see below).

## Frontmatter

Each page can override defaults with TOML frontmatter:

```toml
+++
title = "Syntax Reference"
nav = "syntax-reference"
theme = "rustique"
layout = "sidebar"
width = 90
+++
```

- `title`: page title.
- `nav`: output slug / route filename.
- `theme`: optional per-page theme override.
- `layout`: optional per-page layout override.
- `width`: optional per-page width override.

## Summary Navigation

Marque uses `summary.mq` (mdBook-style) to define navigation labels and ordering.

Example:

```md
# Summary

[Home](index.mq)
[Quickstart](quickstart.mq)
[Docs](docs.mq)
  [Cheat Sheet](cheat-sheet.mq)
```

Notes:

- Frontmatter `order` is no longer used.
- Link text in `summary.mq` becomes nav label.
- Link target controls nav order and page sequence.

Width supports:

- Named presets: `narrow`, `normal`, `wide`, `full`.
- Percent numeric: `86` -> `86%`.
- Explicit percent: `86%`.

Fallback order for width:

1. Page frontmatter `width`
2. `marque.toml` `width`
3. Theme default max width

## .mq Layout Directives

Marque parses custom directives in addition to markdown.

```text
@tag .modifier optional-name
  content
@end tag optional-name
```

Core directives:

- `@container`
- `@row` / `@card`
- `@callout`
- `@stat`
- `@hero` / `@section`
- `@divider` (self-closing)

Example:

```text
@row intro
  @card .accent one
    ## Fast
    Build rich docs with markdown and layout blocks.
  @end card one

  @card two
    ## Simple
    Output is plain static HTML and CSS.
  @end card two
@end row intro
```

Custom directive registration lives in `src/directives/customs.js`.
Add directives there with `defineDirective(name, def)`.

## Markdown Enhancements

- Button classes: `[Download](/file.zip){.primary}`
- Auto button detection for links like `Read ... →`
- Badges: `@badge "Stable" {.ok}`

## Themes

Themes live in `themes/` and use flat files:

- `<name>.css` (required)
- `index.html` (optional shared template)

Layouts live in `layouts/<name>.css` and define structure only (nav placement, page framing, responsive layout).

Themes are plain CSS files. Recommended pattern:

```css
:root {
  --mq-primary: #c85a2a;
  --mq-secondary: #2a5ac8;
  --mq-tertiary: #2ac852;
  --mq-background: #f7f5f0;
  --mq-surface: #ffffff;
  --mq-surface-alt: #eeece7;
  --mq-text: #1a1916;
  --mq-muted: #6b6860;
  --mq-border: rgba(0,0,0,0.09);
  --mq-radius: 8px;
  --mq-max-width: 860px;
}
```

## Theme Variable Reference

Editable variables used by built-in styles:

### Core keys

- `--mq-primary`
- `--mq-secondary`
- `--mq-tertiary`
- `--mq-background`
- `--mq-surface`
- `--mq-surface-alt`
- `--mq-text`
- `--mq-muted`
- `--mq-border`
- `--mq-radius`
- `--mq-max-width`
- `--mq-font-sans`
- `--mq-font-serif`
- `--mq-font-mono`

### Nav pack

- `--mq-nav-bg`
- `--mq-nav-text`
- `--mq-nav-border`
- `--mq-nav-active-bg`
- `--mq-nav-active-text`

### Code pack

- `--mq-code-bg`
- `--mq-code-text`
- `--mq-code-border`
- `--mq-code-head-bg`
- `--mq-code-head-text`

### Card pack

- `--mq-card-bg`
- `--mq-card-border`
- `--mq-card-radius`
- `--mq-card-shadow`

### Callout pack

- `--mq-callout-info-bg`
- `--mq-callout-info-border`
- `--mq-callout-info-text`
- `--mq-callout-warn-bg`
- `--mq-callout-warn-border`
- `--mq-callout-warn-text`
- `--mq-callout-danger-bg`
- `--mq-callout-danger-border`
- `--mq-callout-danger-text`
- `--mq-callout-ok-bg`
- `--mq-callout-ok-border`
- `--mq-callout-ok-text`

### Full editable example

```css
:root {
  --mq-primary: #c85a2a;
  --mq-secondary: #2a5ac8;
  --mq-tertiary: #2ac852;
  --mq-background: #f7f5f0;
  --mq-surface: #ffffff;
  --mq-text: #1a1916;
  --mq-border: rgba(0,0,0,0.09);
  --mq-nav-bg: #111827;
  --mq-code-bg: #0b1220;
  --mq-card-shadow: 0 10px 30px rgba(2, 6, 23, 0.08);
}
```

Template resolution order:

1. `themes/index.html` (shared default template)
2. `marque-pkg/template/themes/index.html`

Layout resolution order:

1. `site/layouts/<layout>.css`
2. `marque-pkg/layouts/<layout>.css`

Built-in themes in this repo include:

- `default`
- `rustique`
- `Pycorino`

## Create a Custom Theme

```sh
cp /path/to/marque-pkg/template/themes/default.css themes/my-theme.css
```

Optional custom shell:

```sh
cp /path/to/marque-pkg/template/themes/index.html themes/index.html
```

Then set:

```toml
theme = my-theme
```

## Development Notes

- `marque serve` watches `pages/`, `static/`, `themes/`, and `marque.toml`.
- Any change triggers rebuild + browser reload.
- `static/` is copied directly into `dist/`.

## License

ISC
