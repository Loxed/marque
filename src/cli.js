#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { build } = require('./builder');
const { serve } = require('./server');
const { scaffold, parseNewArgs } = require('./scaffold');
const { writeThemeStarter, writeThemeTemplate } = require('./theme-generator');
const { migrateSite } = require('./migrate');
const { printBuildError } = require('./utils/errors');

const [, , cmd, ...args] = process.argv;

const help = `
marque, a .mq site compiler

  marque build [site-dir]                         build site to dist/
  marque serve [site-dir] [port]                  dev server with live reload
  marque new [site-dir] [--layout name] [--theme name]
  marque new [site-dir] [layout:name] [theme:name]
  marque migrate [source-dir] [target-dir] [--from mdbook|mkdocs]
  marque migrate [source-dir] [target-dir] [--layout name] [--theme name]
  marque theme new [site-dir] <theme-name> [--reference name] [--force]
  marque theme template [site-dir] [out-file] [--reference name]
  marque theme-template [site-dir] [out-file] [--reference name]
  marque help                                     show this message
`;

const themeHelp = `
marque theme

  marque theme new [site-dir] <theme-name> [--reference name] [--force]
      create a token-first theme file in themes/<theme-name>.css

  marque theme template [site-dir] [out-file] [--reference name]
      advanced scaffold based on directive selectors plus a reference theme
`;

switch (cmd) {
  case 'build':
    runBuild(args);
    break;
  case 'serve':
    runServe(args);
    break;
  case 'new':
    runNew(args);
    break;
  case 'migrate':
    runMigrate(args);
    break;
  case 'theme':
    runTheme(args);
    break;
  case 'theme-template':
    runThemeTemplate(args);
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    console.log(help);
}

function runBuild(rawArgs) {
  const siteDir = path.resolve(rawArgs[0] || '.');
  const outDir = path.join(siteDir, 'dist');
  console.log(`\nmarque building ${siteDir}/\n`);

  try {
    build(siteDir, outDir);
  } catch (err) {
    printBuildError(err);
    process.exit(1);
  }
}

function runServe(rawArgs) {
  const siteDir = path.resolve(rawArgs[0] || '.');
  const outDir = path.join(siteDir, 'dist');
  const port = parseInt(rawArgs[1] || '3000', 10);
  Promise.resolve(serve(siteDir, outDir, port)).catch((err) => {
    printBuildError(err);
    process.exit(1);
  });
}

function runNew(rawArgs) {
  const { positional, opts } = parseNewArgs(rawArgs);
  const siteDir = path.resolve(positional[0] || 'my-site');

  if (fs.existsSync(siteDir)) {
    console.error(`Directory already exists: ${siteDir}`);
    process.exit(1);
  }

  const packageRoot = path.resolve(__dirname, '..');

  try {
    const selected = scaffold({
      packageRoot,
      targetDir: siteDir,
      layoutArg: opts.layout,
      themeArg: opts.theme,
    });

    console.log(`\nmarque: scaffolded -> ${siteDir}/`);
    console.log(`layout: ${selected.layout} | theme: ${selected.theme}`);
    console.log(`\n  cd ${siteDir}`);
    console.log('  marque serve .\n');
  } catch (err) {
    console.error(String((err && err.message) || err || 'Scaffold failed'));
    process.exit(1);
  }
}

function runThemeTemplate(rawArgs) {
  const parsed = parseThemeTemplateArgs(rawArgs);
  const siteDir = path.resolve(parsed.siteDir || '.');

  try {
    const result = writeThemeTemplate({
      siteDir,
      outputFile: parsed.outputFile,
      referenceTheme: parsed.referenceTheme,
    });

    console.log(`\nmarque: theme scaffold written -> ${result.outputFile}`);
    console.log(`reference theme: ${result.referenceThemePath}`);
    console.log(`directives analyzed: ${result.directives.length}\n`);
    if (result.warnings && result.warnings.length) {
      for (const warning of result.warnings) {
        console.log(`warning: ${warning}`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`\nTheme template error: ${String((err && err.message) || err || 'Unknown error')}\n`);
    process.exit(1);
  }
}

function runTheme(rawArgs) {
  const subcmd = String(rawArgs[0] || '').trim().toLowerCase();
  const rest = rawArgs.slice(1);

  if (subcmd === 'new') {
    runThemeNew(rest);
    return;
  }

  if (subcmd === 'template') {
    runThemeTemplate(rest);
    return;
  }

  console.log(themeHelp);
}

function runThemeNew(rawArgs) {
  try {
    const parsed = parseThemeNewArgs(rawArgs);
    const siteDir = path.resolve(parsed.siteDir || '.');
    const result = writeThemeStarter({
      siteDir,
      themeName: parsed.themeName,
      referenceTheme: parsed.referenceTheme,
      force: parsed.force,
    });

    console.log(`\nmarque: theme starter written -> ${result.outputFile}`);
    console.log(`reference theme: ${result.referenceThemePath}`);
    console.log(`activate with: theme = ${result.themeName}\n`);
  } catch (err) {
    console.error(`\nTheme create error: ${String((err && err.message) || err || 'Unknown error')}\n`);
    process.exit(1);
  }
}

function runMigrate(rawArgs) {
  const parsed = parseMigrateArgs(rawArgs);
  const sourceDir = path.resolve(parsed.sourceDir || '.');
  const targetDir = path.resolve(parsed.targetDir || `${sourceDir}-marque`);
  const packageRoot = path.resolve(__dirname, '..');

  try {
    const result = migrateSite({
      packageRoot,
      sourceDir,
      targetDir,
      from: parsed.from,
      layout: parsed.layout,
      theme: parsed.theme,
    });

    console.log(`\nmarque: migrated ${result.kind} site -> ${result.targetDir}`);
    console.log(`layout: ${result.layout} | theme: ${result.theme}`);
    console.log(`pages: ${result.pages.length} | static assets: ${result.assets.length}`);
    console.log(`\n  cd ${result.targetDir}`);
    console.log('  marque serve .\n');

    if (result.warnings && result.warnings.length) {
      console.log('migration notes:');
      for (const warning of result.warnings.slice(0, 8)) {
        console.log(`- ${warning}`);
      }
      if (result.warnings.length > 8) {
        console.log(`- ...and ${result.warnings.length - 8} more in pages/migration-notes.mq`);
      }
      console.log('');
    }
  } catch (err) {
    console.error(`\nMigration error: ${String((err && err.message) || err || 'Unknown error')}\n`);
    process.exit(1);
  }
}

function parseThemeTemplateArgs(argv) {
  const opts = { referenceTheme: 'comte' };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--reference' && i + 1 < argv.length) {
      opts.referenceTheme = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--reference=')) {
      opts.referenceTheme = token.slice('--reference='.length);
      continue;
    }
    positional.push(token);
  }

  return {
    siteDir: positional[0] || '.',
    outputFile: positional[1] || null,
    referenceTheme: opts.referenceTheme,
  };
}

function parseThemeNewArgs(argv) {
  const opts = {
    referenceTheme: 'comte',
    force: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--reference' && i + 1 < argv.length) {
      opts.referenceTheme = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--reference=')) {
      opts.referenceTheme = token.slice('--reference='.length);
      continue;
    }
    if (token === '--force') {
      opts.force = true;
      continue;
    }
    positional.push(token);
  }

  if (!positional.length) {
    throw new Error('Theme name is required. Try: marque theme new my-theme');
  }

  const hasExplicitSiteDir = positional.length >= 2;
  return {
    siteDir: hasExplicitSiteDir ? positional[0] : '.',
    themeName: hasExplicitSiteDir ? positional[1] : positional[0],
    referenceTheme: opts.referenceTheme,
    force: opts.force,
  };
}

function parseMigrateArgs(argv) {
  const opts = {
    from: 'auto',
    layout: 'sidebar',
    theme: 'comte',
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--from' && i + 1 < argv.length) {
      opts.from = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--from=')) {
      opts.from = token.slice('--from='.length);
      continue;
    }
    if (token === '--layout' && i + 1 < argv.length) {
      opts.layout = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--layout=')) {
      opts.layout = token.slice('--layout='.length);
      continue;
    }
    if (token === '--theme' && i + 1 < argv.length) {
      opts.theme = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('--theme=')) {
      opts.theme = token.slice('--theme='.length);
      continue;
    }
    positional.push(token);
  }

  return {
    sourceDir: positional[0] || '.',
    targetDir: positional[1] || null,
    from: opts.from,
    layout: opts.layout,
    theme: opts.theme,
  };
}
