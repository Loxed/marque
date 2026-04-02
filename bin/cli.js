#!/usr/bin/env node
// marque CLI

const path = require('path');
const fs = require('fs');

const [,, cmd, ...args] = process.argv;

const help = `
marque — a .mq site compiler

  marque build [site-dir]    build site to dist/
  marque serve [site-dir]    dev server with live reload
  marque new   [site-dir]    scaffold a new site
  marque help                show this message
`;

switch (cmd) {
  case 'build': {
    const siteDir = path.resolve(args[0] || '.');
    const outDir = path.join(siteDir, 'dist');
    console.log(`\nmarque building ${siteDir}/\n`);
    require('../src/builder').build(siteDir, outDir);
    break;
  }

  case 'serve': {
    const siteDir = path.resolve(args[0] || '.');
    const outDir = path.join(siteDir, 'dist');
    const port = parseInt(args[1] || '3000', 10);
    require('../src/watcher').serve(siteDir, outDir, port);
    break;
  }

  case 'new': {
    const siteDir = path.resolve(args[0] || 'my-site');
    scaffold(siteDir);
    break;
  }

  default:
    console.log(help);
}

// ── Scaffolder ─────────────────────────────────────────────────────────────

function scaffold(siteDir) {
  if (fs.existsSync(siteDir)) {
    console.error(`Directory already exists: ${siteDir}`);
    process.exit(1);
  }

  fs.mkdirSync(path.join(siteDir, 'pages'), { recursive: true });
  fs.mkdirSync(path.join(siteDir, 'static'), { recursive: true });

  fs.writeFileSync(path.join(siteDir, 'marque.toml'), `title = "My Marque Site"
description = "Built with Marque"
theme = "default"
width = "50"
`);

  fs.writeFileSync(path.join(siteDir, 'pages', 'index.mq'),
`---
title: Home
nav: Home
order: 1
---

# Welcome

This is your Marque site. Edit \`pages/index.mq\` to get started.

@row intro
  @card .accent write-card
    ## Write
    Use the .mq format — markdown with layout directives.
    [Syntax reference →](/docs.html)
  @end card write-card

  @card build-card
    ## Build
    Run \`marque build\` to compile your site to \`dist/\`.
  @end card build-card

  @card deploy-card
    ## Deploy
    Upload \`dist/\` to any static host — Netlify, GitHub Pages, a VPS.
  @end card deploy-card
@end row intro
`);

  fs.writeFileSync(path.join(siteDir, 'pages', 'docs.mq'),
`---
title: Syntax Reference
nav: Docs
order: 2
theme: rustique
---

# Syntax Reference

A complete guide to the .mq layout directives.

@callout .info
  All standard markdown works as expected. The directives below are Marque extensions.
@end callout

## Reading this page

Each section uses the same pattern:

- Left card: source code you can copy.
- Right card: what that source renders.

## Frontmatter

@row frontmatter-example
  @card .ghost frontmatter-code
    Code:
    \`\`\`
    ---
    title: Syntax Reference
    nav: Docs
    order: 2
    theme: rustique
    description: Full directive reference
    ---
    \`\`\`
  @end card frontmatter-code

  @card .ghost frontmatter-result
    Notes:

    - \`title\` is used for page title.
    - \`nav\` is used in navigation.
    - \`order\` controls nav sorting.
    - \`theme\` overrides the site theme for this page only.
    - \`description\` can be consumed by the theme template.
  @end card frontmatter-result
@end row frontmatter-example

## Theme override per page

@row theme-override-example
  @card .ghost theme-override-code
    Code:
    \`\`\`
    ---
    title: Press Kit
    nav: Press
    order: 5
    theme: rustique
    ---
    \`\`\`
  @end card theme-override-code

  @card .ghost theme-override-result
    Result:

    - This page uses the \`editorial\` theme.
    - Other pages still use the theme from \`marque.toml\`.
  @end card theme-override-result
@end row theme-override-example

## Rows and Cards

@row rows-cards-example
  @card .ghost rows-cards-code
    Code:
    \`\`\`
    @row section-name
      @card .accent card-name
        ## Title
        Content here
      @end card card-name

      @card other-card
        ## Other
        Content here
      @end card other-card
    @end row section-name
    \`\`\`
  @end card rows-cards-code

  @card .ghost rows-cards-result
    Result:

    @row section-name
      @card .accent card-name
        ## Title
        Content here
      @end card card-name

      @card other-card
        ## Other
        Content here
      @end card other-card
    @end row section-name
  @end card rows-cards-result
@end row rows-cards-example

## Card modifiers

- \`@card\` — plain white
- \`@card .accent\` — orange top border
- \`@card .accent2\` — blue top border
- \`@card .ghost\` — transparent
- \`@card .dark\` — dark background

Multiple modifiers stack: \`@card .accent .dark card-name\`

## Callouts

@row callout-example
  @card .ghost callout-code
    Code:
    \`\`\`
    @callout .warn
      Something to watch out for.
    @end callout
    \`\`\`
  @end card callout-code

  @card .ghost callout-result
    Result:

    @callout .warn
      Something to watch out for.
    @end callout
  @end card callout-result
@end row callout-example

Variants: \`.info\` \`.warn\` \`.danger\` \`.ok\`

## Stats

@row stat-example
  @card .ghost stat-code
    Code:
    \`\`\`
    @row stats
      @stat users
        ## 12,400
        monthly users
      @end stat users

      @stat uptime
        ## 99.9%
        90-day uptime
      @end stat uptime
    @end row stats
    \`\`\`
  @end card stat-code

  @card .ghost stat-result
    Result:

    @row stats
      @stat users
        ## 12,400
        monthly users
      @end stat users

      @stat uptime
        ## 99.9%
        90-day uptime
      @end stat uptime
    @end row stats
  @end card stat-result
@end row stat-example

## Steps

@row steps-example
  @card .ghost steps-code
    Code:
    \`\`\`
    @steps install-guide
      @step
        ## Install
        Run the install command.
      @end step

      @step
        ## Configure
        Edit the config file.
      @end step

      @step
        ## Run
        Start with marque serve .
      @end step
    @end steps install-guide
    \`\`\`
  @end card steps-code

  @card .ghost steps-result
    Result:

    @steps install-guide
      @step
        ## Install
        Run the install command.
      @end step

      @step
        ## Configure
        Edit the config file.
      @end step

      @step
        ## Run
        Start with marque serve .
      @end step
    @end steps install-guide
  @end card steps-result
@end row steps-example

## Tabs

@row tabs-example
  @card .ghost tabs-code
    Code:
    \`\`\`
    @tabs code-samples
      @tab .js
        \`\`\`js
        console.log("Hello from JS");
        \`\`\`
      @end tab

      @tab .python
        \`\`\`python
        print("Hello from Python")
        \`\`\`
      @end tab
    @end tabs code-samples
    \`\`\`
  @end card tabs-code

  @card .ghost tabs-result
    Result:

    @tabs code-samples
      @tab .js
        \`\`\`js
        console.log("Hello from JS");
        \`\`\`
      @end tab

      @tab .python
        \`\`\`python
        print("Hello from Python")
        \`\`\`
      @end tab
    @end tabs code-samples
  @end card tabs-result
@end row tabs-example

## Hero and Section

@row hero-section-example
  @card .ghost hero-section-code
    Code:
    \`\`\`
    @hero .accent landing-hero
      # Build docs fast
      Structured markdown with reusable layout blocks.
    @end hero landing-hero

    @section .ghost details
      ## Why use this
      Keep authoring simple and output consistent.
    @end section details
    \`\`\`
  @end card hero-section-code

  @card .ghost hero-section-result
    Result:

    @hero .accent landing-hero
      # Build docs fast
      Structured markdown with reusable layout blocks.
    @end hero landing-hero

    @section .ghost details
      ## Why use this
      Keep authoring simple and output consistent.
    @end section details
  @end card hero-section-result
@end row hero-section-example

## Self-closing

@row divider-example
  @card .ghost divider-code
    Code:
    \`\`\`
    @divider
    \`\`\`
  @end card divider-code

  @card .ghost divider-result
    Result:

    @divider
  @end card divider-result
@end row divider-example

## Buttons and badges in markdown

@row markdown-enhancements
  @card .ghost markdown-enhancements-code
    Code:
    \`\`\`
    [Read the docs →](/docs.html)
    [Download](/download.zip){.primary}

    :badge[Stable]{.ok}
    :badge[Beta]{.warn}
    \`\`\`
  @end card markdown-enhancements-code

  @card .ghost markdown-enhancements-result
    Result:

    [Read the docs →](/docs.html)
    [Download](/download.zip){.primary}

    :badge[Stable]{.ok}
    :badge[Beta]{.warn}
  @end card markdown-enhancements-result
@end row markdown-enhancements

## Tips

- Use names on blocks (\`@row pricing\`) to keep large pages readable.
- Start simple with markdown, then add layout directives where needed.
- Prefer reusable content patterns: row + card, then callout/steps for emphasis.
`);

  console.log(`\nmarque: scaffolded → ${siteDir}/`);
  console.log(`\n  cd ${siteDir}`);
  console.log(`  marque serve .\n`);
}
