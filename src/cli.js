#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { build } = require('./builder');
const { serve } = require('./server');
const { scaffold, parseNewArgs } = require('./scaffold');
const { writeThemeTemplate } = require('./theme-generator');
const { printBuildError } = require('./utils/errors');

const [, , cmd, ...args] = process.argv;

const help = `
marque, a .mq site compiler

  marque build [site-dir]                         build site to dist/
  marque serve [site-dir] [port]                  dev server with live reload
  marque new [site-dir] [--layout name] [--theme name]
  marque new [site-dir] [layout:name] [theme:name]
  marque theme-template [site-dir] [out-file] [--reference name]
  marque help                                     show this message
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
  serve(siteDir, outDir, port);
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
