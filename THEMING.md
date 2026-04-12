# Theme Authoring

Marque themes are meant to be small, opinionated CSS files. The shared baseline already lives in `common.css`, so a good custom theme usually changes tokens first and adds only a few distinctive overrides second.

Custom themes belong at `themes/<name>.css`. Bundled legacy/showcase themes live under `themes/legacy/`.

## Quick Start

```sh
marque theme new my-theme
```

1. Open `themes/my-theme.css`.
2. Change the `@import` lines if you want different fonts.
3. Rewrite the `:root` tokens to set the palette, typography, radius, and code colors.
4. Add a few intentional overrides below the token block.
5. Activate the theme in `marque.toml` with `theme = my-theme`.
6. Run `marque serve .` and tune it against real pages.

If you want a heavier scaffold based on an existing theme, use:

```sh
marque theme template . themes/my-theme.css --reference comte
```

That advanced path is useful when you want selector placeholders. The normal recommendation is still `marque theme new`.

If you want to start from one of the older bundled themes, reference it by canonical path:

```sh
marque theme template . themes/my-theme.css --reference legacy/rustique
```

## Ownership Model

- `common.css` owns the shared baseline for markdown, built-in directives, search, code blocks, page navigation, and other shared chrome.
- `layouts/*.css` own placement and layout-specific structure.
- `themes/*.css` own theme tokens and a small number of intentional overrides.
- `themes/legacy/*.css` are bundled legacy/showcase themes, not the recommended starting point for new work.
- `directives/*.js` should focus on rendering and behavior, not re-defining the shared built-in visual baseline.

If a style is needed across multiple themes, it probably belongs in `common.css`, not in a theme.

## Recommended Theme Workflow

- Start from `marque theme new`, not from a large legacy theme file.
- Keep the token names from the starter. Built-in Marque styles depend on the `--mq-*` variables.
- Keep the compatibility aliases unless you are intentionally cleaning up older themes at the same time.
- Change tokens first, then add only a handful of selectors that give the theme its personality.
- Prefer broad, memorable moves over lots of one-off fixes.
- Test on content-heavy pages, code-heavy pages, and pages with cards/callouts so you can catch contrast issues early.

## Good Override Targets

These are the best places to make a theme feel distinct without rebuilding the whole UI:

- `body`
- `.mq-nav`
- `.mq-main :is(h1, h2)`
- `.mq-card`
- `.mq-code-block, .mq-main pre`
- `.mq-summary-panel, .mq-page-nav-link`

## Avoid

- Copying `common.css` into a theme file.
- Rebuilding every directive from scratch.
- Putting layout mechanics into a theme.
- Styling classes that exist only for JavaScript behavior unless you really need to.
- Starting from a huge legacy theme unless you actually want that older structure.

## LLM Prompt

Copy the prompt below into your LLM tool, then fill in the brief.

```text
You are designing a custom Marque theme.
Return only the contents of themes/<theme-name>.css as valid CSS.

Context:
- Marque already loads common.css. That file owns the shared baseline for markdown, built-in directives, search UI, page navigation, code block chrome, and other shared components.
- Layout CSS owns placement and shell behavior. Do not rebuild layout mechanics here.
- This theme should be token-first: define the palette and typography in :root first, then add only a small number of distinctive overrides.
- Keep the existing Marque token names and compatibility aliases.
- Avoid copying common.css or recreating every component from scratch.
- Do not change JavaScript hooks or state classes unless absolutely necessary.

Theme brief:
- Theme name: <theme-name>
- Visual direction: <editorial serif / warm paper / neon terminal / brutalist / etc.>
- Mood keywords: <keyword 1>, <keyword 2>, <keyword 3>
- Primary color: <hex>
- Secondary color: <hex>
- Accent / tertiary color: <hex>
- Background style: <flat / gradient / textured feel>
- Contrast target: <high / medium>
- Density: <compact / comfortable / spacious>
- Typography:
  Sans: <font choice>
  Serif: <font choice or none>
  Mono: <font choice>

Requirements:
- Start with @import lines for fonts only if needed.
- Include a complete :root block using the Marque token contract.
- Define these tokens:
  --mq-primary
  --mq-secondary
  --mq-tertiary
  --mq-background
  --mq-surface
  --mq-surface-alt
  --mq-text
  --mq-muted
  --mq-border
  --mq-nav-bg
  --mq-nav-active-bg
  --mq-nav-active-text
  --mq-code-bg
  --mq-code-text
  --mq-code-border
  --mq-callout-info-bg
  --mq-callout-info-border
  --mq-callout-info-text
  --mq-callout-warn-bg
  --mq-callout-warn-border
  --mq-callout-warn-text
  --mq-callout-danger-bg
  --mq-callout-danger-border
  --mq-callout-danger-text
  --mq-callout-ok-bg
  --mq-callout-ok-border
  --mq-callout-ok-text
  --mq-radius
  --mq-max-width
  --mq-font-sans
  --mq-font-serif
  --mq-font-mono

- Include the compatibility aliases too:
  --bg
  --surface
  --surface2
  --text
  --muted
  --accent
  --accent2
  --border
  --radius
  --max-w
  --font-sans
  --font-serif
  --font-mono

- After the token block, add only a handful of theme-specific overrides for:
  body
  .mq-nav
  .mq-main :is(h1, h2)
  .mq-card
  .mq-code-block, .mq-main pre
  .mq-summary-panel, .mq-page-nav-link

Nav dropdown rule (always apply this):
  Dropdown triggers (.mq-nav-group-trigger) must be visually identical to plain nav
  links at all times — same color, padding, hover, and active state. This follows the
  go.dev pattern where there is zero visual distinction between a link and a dropdown
  trigger. To achieve this:

  1. Reset button chrome on the trigger so the browser does not add its own border,
     background, or padding:
       appearance: none; -webkit-appearance: none; background: none; border: none;
       cursor: pointer; font-family: inherit; font-size: inherit; letter-spacing: inherit;

  2. Every nav rule must target both elements together. Never write a rule for one
     without the other:
       .mq-nav-links a,
       .mq-nav-links .mq-nav-group > .mq-nav-group-trigger { ... }

  3. common.css ships its own specificity on these selectors. Use !important on
     border-radius, border, color, and background overrides inside .mq-nav to win.

  4. The only allowed visual difference is a small inline arrow appended via ::after
     (e.g. content: "▾") that rotates when aria-expanded="true".

  5. Set --mq-nav-bg to the dropdown surface color (e.g. --mq-surface), not the nav
     bar color. Style the nav bar background directly on .mq-nav. This prevents the
     nav bar color from leaking into floating submenus via common.css.

  6. Submenu overrides (.mq-nav .mq-nav-submenu) must be written WITHOUT !important.
     The sidebar layout already forces background: transparent !important and
     border: none !important on submenus so its inline nested links are unaffected.
     Topnav floating dropdowns have no such overrides and will pick up the theme
     styles correctly.

- Make the theme specific and memorable rather than generic.
- Keep contrast readable and code blocks usable.
- Keep the CSS cohesive and reasonably small.

Output rules:
- Output CSS only.
- Do not explain your choices.
- Do not wrap the answer in Markdown fences.
```
