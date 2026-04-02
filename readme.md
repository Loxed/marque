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

Open `http://localhost:3000`.

When ready to publish:

```sh
marque build .
```

Output goes to `dist/`.

## CLI

```text
marque new   <dir>    scaffold a new site
marque serve <dir>    dev server with live reload (default port 3000)
marque build <dir>    compile site to dist/
```

`<dir>` defaults to `.`.

## Project Structure

```text
my-site/
├── pages/         # .mq source pages
├── static/        # copied as-is to dist/
├── marque.toml    # site config
└── dist/          # generated output
```

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
order: 2
theme: rustique
layout: sidebar
width: 90
---
```

- `title`: page title.
- `nav`: nav label.
- `order`: nav sort order.
- `theme`: optional per-page theme override.
- `layout`: optional per-page layout override.
- `width`: optional per-page width override.

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

- `theme.css` (required)
- `index.html` (optional)

Layouts live in `layouts/<name>.css` and define structure only (nav placement, page framing, responsive layout).

Template resolution order:

1. `themes/<theme>/index.html`
2. `themes/index.html` (shared default template)

Layout resolution order:

1. `site/layouts/<layout>.css`
2. `marque-pkg/layouts/<layout>.css`

Built-in themes in this repo include:

- `default`
- `rustique`
- `Pycorino`

## Create a Custom Theme

```sh
mkdir -p themes/my-theme
cp /path/to/marque-pkg/themes/default/theme.css themes/my-theme/
```

Optional custom shell:

```sh
cp /path/to/marque-pkg/themes/index.html themes/my-theme/index.html
```

Then set:

```toml
theme = "my-theme"
```

## Development Notes

- `marque serve` watches `pages/`, `static/`, `themes/`, and `marque.toml`.
- Any change triggers rebuild + browser reload.
- `static/` is copied directly into `dist/`.

## License

ISC
