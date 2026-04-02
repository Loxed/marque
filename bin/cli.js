#!/usr/bin/env node
// marque CLI

const path = require('path');
const fs = require('fs');

const [,, cmd, ...args] = process.argv;

const help = `
marque, a .mq site compiler

  marque build [site-dir]    build site to dist/
  marque serve [site-dir]    dev server with live reload
  marque new   [site-dir] [layout:<name>] [theme:<name>]    scaffold a new site
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
    const parsed = parseNewArgs(args);
    const siteDir = path.resolve(parsed.siteDir || 'my-site');
    scaffold(siteDir, { layout: parsed.layout, theme: parsed.theme });
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

function scaffold(siteDir, options = {}) {
  if (fs.existsSync(siteDir)) {
    console.error(`Directory already exists: ${siteDir}`);
    process.exit(1);
  }

  const packageRoot = path.resolve(__dirname, '..');
  const starterTemplateDir = path.join(packageRoot, 'template');
  const libraryLayoutsDir = path.join(packageRoot, 'library', 'layouts');
  const libraryThemesDir = path.join(packageRoot, 'library', 'themes');

  const selectedLayout = resolveScaffoldLayout(options.layout, libraryLayoutsDir);
  const selectedTheme = resolveScaffoldTheme(options.theme, libraryThemesDir);

  fs.mkdirSync(siteDir, { recursive: true });

  // Copy starter content, then source built-ins from common library.
  copyDir(starterTemplateDir, siteDir, new Set(['dist', 'themes', 'layouts']));
  copyDir(libraryLayoutsDir, path.join(siteDir, 'layouts'));
  copyDir(libraryThemesDir, path.join(siteDir, 'themes'));

  // Guarantee essential starter files even if template/ is incomplete.
  ensureStarterScaffold(siteDir, { layout: selectedLayout, theme: selectedTheme });
  applyScaffoldDefaults(siteDir, { layout: selectedLayout, theme: selectedTheme });

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

function ensureStarterScaffold(siteDir, defaults = {}) {
  const pagesDir = path.join(siteDir, 'pages');
  const staticDir = path.join(siteDir, 'static');
  const configFile = path.join(siteDir, 'marque.toml');
  const indexFile = path.join(pagesDir, 'index.mq');
  const docsFile = path.join(pagesDir, 'docs.mq');
  const defaultLayout = defaults.layout || 'topnav';
  const defaultTheme = defaults.theme || 'default';

  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(staticDir, { recursive: true });

  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, `title = Marque
description = Built with Marque
layout = ${defaultLayout}
theme = ${defaultTheme}
width = 82

# Marque config
#
# layout options:
#   topnav    -> top navigation layout
#   sidebar   -> mdbook-like left sidebar layout
#   aliases default/xmb/crossmediabar -> topnav
#
# theme options (built-in):
#   default, rustique, pycorino, gouda, javarti, test
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

function parseNewArgs(rawArgs) {
  const parsed = { siteDir: null, layout: null, theme: null };
  for (const raw of rawArgs || []) {
    const token = String(raw || '').trim();
    if (!token) continue;

    const layoutMatch = token.match(/^layout:(.+)$/i);
    if (layoutMatch) {
      parsed.layout = layoutMatch[1].trim().toLowerCase();
      continue;
    }

    const themeMatch = token.match(/^theme:(.+)$/i);
    if (themeMatch) {
      parsed.theme = themeMatch[1].trim();
      continue;
    }

    if (!parsed.siteDir) {
      parsed.siteDir = token;
      continue;
    }

    console.error(`Unknown new argument: ${token}`);
    process.exit(1);
  }

  if (!parsed.siteDir) parsed.siteDir = 'my-site';
  return parsed;
}

function resolveScaffoldLayout(layoutName, libraryLayoutsDir) {
  const requested = normalizeLayoutName(layoutName || 'topnav');
  const cssPath = path.join(libraryLayoutsDir, `${requested}.css`);
  const mqsPath = path.join(libraryLayoutsDir, `${requested}.mqs`);
  if (fs.existsSync(cssPath) || fs.existsSync(mqsPath)) return requested;

  const available = listNames(libraryLayoutsDir, ['.css', '.mqs']);
  console.error(`Unknown layout: ${requested}`);
  console.error(`Available layouts: ${available.join(', ') || '(none found)'}`);
  process.exit(1);
}

function resolveScaffoldTheme(themeName, libraryThemesDir) {
  const requested = String(themeName || 'default').trim();
  const dirPath = path.join(libraryThemesDir, requested);
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    const available = fs.existsSync(libraryThemesDir)
      ? fs.readdirSync(libraryThemesDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
          .sort((a, b) => a.localeCompare(b))
      : [];
    console.error(`Unknown theme: ${requested}`);
    console.error(`Available themes: ${available.join(', ') || '(none found)'}`);
    process.exit(1);
  }
  return requested;
}

function applyScaffoldDefaults(siteDir, defaults = {}) {
  const configFile = path.join(siteDir, 'marque.toml');
  if (!fs.existsSync(configFile)) return;

  const layout = normalizeLayoutName(defaults.layout || 'topnav');
  const theme = String(defaults.theme || 'default').trim();

  let content = fs.readFileSync(configFile, 'utf8');
  content = replaceOrAppendTomlKey(content, 'layout', layout);
  content = replaceOrAppendTomlKey(content, 'theme', theme);
  fs.writeFileSync(configFile, content);
}

function replaceOrAppendTomlKey(content, key, value) {
  const line = `${key} = ${value}`;
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'mi');
  if (re.test(content)) return content.replace(re, line);
  return `${content.trimEnd()}\n${line}\n`;
}

function normalizeLayoutName(layout) {
  const name = String(layout || 'topnav').trim().toLowerCase();
  if (name === 'default' || name === 'crossmediabar' || name === 'xmb') return 'topnav';
  return name || 'topnav';
}

function listNames(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  const names = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!extensions.includes(ext)) continue;
    names.add(path.basename(entry.name, ext));
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}
