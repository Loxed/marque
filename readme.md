# Marque

A `.mq` site compiler. Write structured pages in an extended markdown format, get a clean static site out.

---

## Install

**Requirements:** Node.js 18+

```bash
# 1. unzip the package
unzip marque-v2.zip
cd marque-pkg

# 2. install dependencies
npm install

# 3. register the CLI globally
npm link
```

After `npm link`, the `marque` command is available anywhere on your machine.

---

## Quickstart

```bash
# scaffold a new site
marque new D:\Sites\my-site

# go into it
cd D:\Sites\my-site

# start the dev server
marque serve .
```

Open `http://localhost:3000` — edit files in `pages/`, the browser reloads automatically.

When you're ready to publish:

```bash
marque build .
```

Output lands in `dist/`. Upload that folder to any static host (Netlify, GitHub Pages, a VPS, anywhere).

---

## Commands

```
marque new   <dir>    scaffold a new site
marque serve <dir>    dev server with live reload on http://localhost:3000
marque build <dir>    compile site to dist/
```

`<dir>` defaults to `.` (current directory) if omitted.

---

## Site structure

```
my-site/
├── pages/            ← your .mq files go here
│   ├── index.mq      ← becomes dist/index.html
│   └── about.mq      ← becomes dist/about.html
├── static/           ← copied as-is to dist/ (images, fonts, etc.)
├── marque.toml     ← site config
└── dist/             ← generated output, do not edit
```

### marque.toml

```toml
title       = "My Site"
description = "A site built with Marque"
theme       = "default"
```

---

## .mq syntax

Every `.mq` file is standard markdown plus layout directives.

### Frontmatter

```
---
title: My Page
nav: Home
order: 1
theme: editorial
---
```

- `title` — page title and browser tab
- `nav` — label shown in the nav bar
- `order` — sort order in nav (lower = first)
- `theme` — optional per-page theme override

### Layout blocks

Blocks follow the pattern:

```
@tag .modifier optional-name
  content
@end tag optional-name
```

- `@tag` — opens a block
- `.modifier` — optional CSS class(es), stackable: `.accent .dark`
- `name` — optional label, echoed in `@end` for readability (like VHDL `end process;`)
- `@end tag` — closes the block

Indentation inside blocks is cosmetic (up to 4 spaces stripped).

---

### Row

Lays out N children side by side. Column count is automatic.

```
@row learn-section
  @card .accent book-card
    ## The Book
    The official guide to the language.
    [Read online →](https://example.com)
  @end card book-card

  @card exercises-card
    ## Exercises
    Hands-on practice to build fluency.
  @end card exercises-card

  @card examples-card
    ## By Example
    Annotated, runnable code snippets.
  @end card examples-card
@end row learn-section
```

### Card modifiers

| Modifier   | Effect                  |
|------------|-------------------------|
| *(none)*   | Plain white card        |
| `.accent`  | Orange top border       |
| `.accent2` | Blue top border         |
| `.ghost`   | Transparent background  |
| `.dark`    | Dark background         |

Modifiers stack: `@card .accent .dark my-card`

### Callout

```
@callout .info
  Something worth noting.
@end callout
```

| Modifier  | Colour |
|-----------|--------|
| `.info`   | Blue   |
| `.warn`   | Amber  |
| `.danger` | Red    |
| `.ok`     | Green  |

### Stat

Big number + label. Works best inside a `@row`.

```
@row metrics
  @stat uptime
    ## 99.9%
    uptime last 90 days
  @end stat uptime

  @stat users
    ## 12,400
    monthly active users
  @end stat users
@end row metrics
```

### Steps

Numbered step list, counter is automatic.

```
@steps setup-guide
  @step
    ## Install
    Run `npm install` in the project folder.
  @end step

  @step
    ## Configure
    Edit `marque.toml` with your site title.
  @end step

  @step
    ## Run
    Start the dev server with `marque serve .`
  @end step
@end steps setup-guide
```

### Tabs

```
@tabs code-examples
  @tab .rust
    ```rust
    fn main() {
        println!("Hello, world!");
    }
    ```
  @end tab

  @tab .python
    ```python
    print("Hello, world!")
    ```
  @end tab
@end tabs code-examples
```

Tab label = the modifier name (without the dot).

### Divider

Self-closing, no `@end` needed.

```
@divider
```

---

## Button syntax

Links are auto-detected as buttons when they start with an action verb or contain →.

```md
[Read the docs →](url)        ← auto button
[Click here](url)             ← plain link

[Download](url){.primary}     ← filled orange button
[View on GitHub](url){.blue}  ← filled blue button
```

---

## Themes

Built-in themes live in `themes/`:

- `default`
- `editorial`

Set your site-wide theme in `marque.toml`:

```toml
theme = "default"
```

Override theme for a single page in frontmatter:

```yaml
---
title: Fancy Landing
theme: editorial
---
```

To create a custom theme:

```bash
# inside your site folder
mkdir -p themes/my-theme
cp /path/to/marque-pkg/themes/default/base.html themes/my-theme/
cp /path/to/marque-pkg/themes/default/theme.css themes/my-theme/
```

Edit `theme.css` — the CSS variables at the top control everything:

```css
:root {
  --bg:      #f7f5f0;
  --surface: #ffffff;
  --text:    #1a1916;
  --accent:  #c85a2a;
  --accent2: #2a5ac8;
  --max-w:   860px;
}
```

Then point your site at it in `marque.toml`:

```toml
theme = "my-theme"
```

---

## Updating Marque

Replace the files in `marque-pkg/src/` and `marque-pkg/bin/` with newer versions, then run `npm link` again from the `marque-pkg` folder.