# Marque

Marque is a static site generator powered by `.mq`: markdown plus layout directives.

You write content quickly, keep structure explicit, and ship plain static HTML/CSS.

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

Built-in starter layouts/themes are sourced from `library/` in the package, then copied into each new project.

## Configuration

`marque.toml` controls global defaults:

```toml
title = "My Site"
description = "Built with Marque"
layout = "topnav"
theme = "default"
width = "82"
```

- `title`: site title used in templates.
- `description`: fallback page meta description.
- `layout`: global layout name (`topnav` or `sidebar`).
  legacy values `default`, `xmb`, and `crossmediabar` resolve to `topnav`.
- `theme`: global theme name.
- `width`: global page width occupancy (percentage-based, see below).

## Frontmatter

Each page can override defaults:

```yaml
---
title: Syntax Reference
nav: Docs
theme: rustique
layout: sidebar
width: 90
---
```

- `title`: page title.
- `nav`: nav label.
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

- `@row` / `@card`
- `@callout`
- `@stat`
- `@steps` / `@step`
- `@tabs` / `@tab`
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

## Markdown Enhancements

- Button classes: `[Download](/file.zip){.primary}`
- Auto button detection for links like `Read ... →`
- Badges: `:badge[Stable]{.ok}`

## Themes

Themes live in `themes/<name>/` and require:

- `theme.css` or `theme.mqs` (required)
- `index.html` (optional)

Layouts live in `layouts/<name>.css` or `layouts/<name>.mqs` and define structure only (nav placement, page framing, responsive layout).

MQS is a CSS-compatible stylesheet format. Supported features:

- `@mqs-import "./relative-file.css";` to inline local stylesheet files at build time.
- `@mqs-palette { ... }` to define normalized design tokens.
- `@mqs-essentials;` to auto-generate the core Marque theme CSS.

Recommended MQS pattern (normalized colors):

```css
@mqs-palette {
  primary: #c85a2a;
  secondary: #2a5ac8;
  ternary: #2ac852;
  background: #f7f5f0;
  surface: #ffffff;
  surface-alt: #eeece7;
  text: #1a1916;
  muted: #6b6860;
  border: rgba(0,0,0,0.09);

  callout-info-bg: #eef3fb;
  callout-info-border: #2a5ac8;
  callout-info-text: #1a3060;
  callout-warn-bg: #fdf5e8;
  callout-warn-border: #c87a2a;
  callout-warn-text: #5a3510;
  callout-danger-bg: #fbeaea;
  callout-danger-border: #c82a2a;
  callout-danger-text: #5a1010;
  callout-ok-bg: #eaf4ee;
  callout-ok-border: #2ac852;
  callout-ok-text: #0e4020;

  radius: 8px;
  max-width: 860px;
}

@mqs-essentials;
```

The generated essentials include normalized style hooks (`.primary`, `.secondary`, `.ternary`) and compatibility aliases for existing classes (`.accent`, `.accent2`, `.blue`).

## Complete `@mqs-palette` Reference

Every editable palette key currently supported by MQS:

### Core keys

- `primary`
- `secondary`
- `ternary`
- `background`
- `surface`
- `surface-alt`
- `text`
- `muted`
- `border`
- `radius`
- `max-width`
- `font-sans`
- `font-serif`
- `font-mono`

### Nav pack

- `nav-bg`
- `nav-text`
- `nav-border`
- `nav-active-bg`
- `nav-active-text`

### Code pack

- `code-bg`
- `code-text`
- `code-border`
- `code-head-bg`
- `code-head-text`

### Card pack

- `card-bg`
- `card-border`
- `card-radius`
- `card-shadow`

### Callout pack

- `callout-info-bg`
- `callout-info-border`
- `callout-info-text`
- `callout-warn-bg`
- `callout-warn-border`
- `callout-warn-text`
- `callout-danger-bg`
- `callout-danger-border`
- `callout-danger-text`
- `callout-ok-bg`
- `callout-ok-border`
- `callout-ok-text`

### Alias keys

These aliases are accepted in `@mqs-palette` and mapped internally:

- `bg` -> `background`
- `accent` -> `primary`
- `accent2` -> `secondary`

### Full editable example

```css
@mqs-palette {
  /* core */
  primary: #c85a2a;
  secondary: #2a5ac8;
  ternary: #2ac852;
  background: #f7f5f0;
  surface: #ffffff;
  surface-alt: #eeece7;
  text: #1a1916;
  muted: #6b6860;
  border: rgba(0,0,0,0.09);

  /* optional nav pack */
  nav-bg: #111827;
  nav-text: #f8fafc;
  nav-border: #1f2937;
  nav-active-bg: #1f2937;
  nav-active-text: #ffffff;

  /* optional code pack */
  code-bg: #0b1220;
  code-text: #dbeafe;
  code-border: #1e293b;
  code-head-bg: #111827;
  code-head-text: #e2e8f0;

  /* optional card pack */
  card-bg: #ffffff;
  card-border: #dbe2ea;
  card-radius: 14px;
  card-shadow: 0 10px 30px rgba(2, 6, 23, 0.08);

  /* optional callout pack */
  callout-info-bg: #eef3fb;
  callout-info-border: #2a5ac8;
  callout-info-text: #1a3060;
  callout-warn-bg: #fdf5e8;
  callout-warn-border: #c87a2a;
  callout-warn-text: #5a3510;
  callout-danger-bg: #fbeaea;
  callout-danger-border: #c82a2a;
  callout-danger-text: #5a1010;
  callout-ok-bg: #eaf4ee;
  callout-ok-border: #2ac852;
  callout-ok-text: #0e4020;
}

@mqs-essentials;
```

Template resolution order:

1. `themes/<theme>/index.html`
2. `themes/index.html` (shared default template)

Layout resolution order:

1. `site/layouts/<layout>.mqs`
2. `site/layouts/<layout>.css`
3. `marque-pkg/layouts/<layout>.mqs`
4. `marque-pkg/layouts/<layout>.css`

Built-in themes in this repo include:

- `default`
- `rustique`
- `Pycorino`

## Create a Custom Theme

```sh
mkdir -p themes/my-theme
cp /path/to/marque-pkg/themes/default/theme.mqs themes/my-theme/
```

Optional custom shell:

```sh
cp /path/to/marque-pkg/themes/index.html themes/my-theme/index.html
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
