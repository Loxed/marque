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
---

# Syntax Reference

A quick guide to the .mq layout directives.

@callout .info
  All standard markdown works as you'd expect. These are just the extensions.
@end callout

## Rows and Cards

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

## Card modifiers

- \`@card\` — plain white
- \`@card .accent\` — orange top border
- \`@card .accent2\` — blue top border
- \`@card .ghost\` — transparent
- \`@card .dark\` — dark background

Multiple modifiers stack: \`@card .accent .dark card-name\`

## Callouts

\`\`\`
@callout .warn
  Something to watch out for.
@end callout
\`\`\`

Variants: \`.info\` \`.warn\` \`.danger\` \`.ok\`

## Stats

\`\`\`
@row stats
  @stat users
    ## 12,400
    monthly users
  @end stat users
@end row stats
\`\`\`

## Steps

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
@end steps install-guide
\`\`\`

## Self-closing

\`\`\`
@divider
\`\`\`
`);

  console.log(`\nmarque: scaffolded → ${siteDir}/`);
  console.log(`\n  cd ${siteDir}`);
  console.log(`  marque serve .\n`);
}
