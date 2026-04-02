#!/usr/bin/env node
// marque CLI

const path = require('path');
const fs = require('fs');

const [,, cmd, ...args] = process.argv;

const help = `
marque, a .mq site compiler

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
    try {
      require('../src/builder').build(siteDir, outDir);
    } catch (e) {
      printBuildError(e);
      process.exit(1);
    }
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

function printBuildError(err) {
  const message = String((err && err.message) || err || 'Unknown build error');
  if (/^error\[MQ\d+\]:/m.test(message)) {
    console.error(`\nBuild error\n${message}\n`);
    return;
  }
  console.error(`\nBuild error: ${message}\n`);
}

// ── Scaffolder ─────────────────────────────────────────────────────────────

function scaffold(siteDir) {
  if (fs.existsSync(siteDir)) {
    console.error(`Directory already exists: ${siteDir}`);
    process.exit(1);
  }

  const packageRoot = path.resolve(__dirname, '..');
  const starterTemplateDir = path.join(packageRoot, 'template');
  const builtinLayoutsDir = path.join(packageRoot, 'layouts');
  const builtinThemesDir = path.join(packageRoot, 'themes');

  fs.mkdirSync(siteDir, { recursive: true });

  // Copy canonical starter content (excluding generated dist output).
  copyDir(starterTemplateDir, siteDir, new Set(['dist']));

  // Guarantee essential starter files even if template/ is incomplete.
  ensureStarterScaffold(siteDir);

  // Copy layouts and themes into project for direct customization.
  copyDir(builtinLayoutsDir, path.join(siteDir, 'layouts'));
  copyDir(builtinThemesDir, path.join(siteDir, 'themes'));

  console.log(`\nmarque: scaffolded → ${siteDir}/`);
  console.log(`\n  cd ${siteDir}`);
  console.log(`  marque serve .\n`);
}

function copyDir(src, dest, excludeNames = new Set()) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeNames.has(entry.name)) continue;

    const sourcePath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, destPath, excludeNames);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

function ensureStarterScaffold(siteDir) {
  const pagesDir = path.join(siteDir, 'pages');
  const staticDir = path.join(siteDir, 'static');
  const configFile = path.join(siteDir, 'marque.toml');
  const indexFile = path.join(pagesDir, 'index.mq');
  const docsFile = path.join(pagesDir, 'docs.mq');

  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(staticDir, { recursive: true });

  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, `title = Marque
description = Built with Marque
layout = topnav
theme = default
width = 82

# Marque config
#
# layout options:
#   topnav    -> top navigation layout
#   sidebar   -> mdbook-like left sidebar layout
#   aliases default/xmb/crossmediabar -> topnav
#
# theme options (built-in):
#   default, rustique, pycorino, gouda, javarti
`);
  }

  if (!fs.existsSync(indexFile)) {
    fs.writeFileSync(indexFile, `---
title: Home
nav: home
order: 1
---

# Welcome

Your Marque project is ready.

@row starter
  @card .accent
    ## Start writing
    Edit files in \`pages/\` and keep frontmatter at the top.
    [Open docs →](/docs.html)
  @end card

  @card
    ## Live preview
    Run \`marque serve .\` for rebuild + reload.
  @end card

  @card
    ## Publish
    Run \`marque build .\` and deploy \`dist/\`.
  @end card
@end row starter
`);
  }

  if (!fs.existsSync(docsFile)) {
    fs.writeFileSync(docsFile, `---
title: Docs
nav: docs
order: 2
layout: sidebar
---

# Marque Docs

Quick reference for writing pages.

@callout .info
  Use markdown normally, then add Marque directives when needed.
@end callout

## Core directives

- \`@row\` and \`@card\`
- \`@callout\`
- \`@stat\`
- \`@steps\` / \`@step\`
- \`@tabs\` / \`@tab\`
- \`@hero\` / \`@section\`
- \`@divider\`

## Frontmatter

\`title\` controls page title text.
\`nav\` controls URL slug/output name.
\`order\` controls nav ordering.
`);
  }
}
