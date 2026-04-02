#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { build } = require('../src/builder');
const { serve } = require('../src/server');
const { scaffold, parseNewArgs } = require('../src/scaffold');
const { printBuildError } = require('../src/utils/errors');

const [, , cmd, ...args] = process.argv;

const help = `
marque, a .mq site compiler

  marque build [site-dir]                         build site to dist/
  marque serve [site-dir] [port]                  dev server with live reload
  marque new [site-dir] [--layout name] [--theme name]
  marque new [site-dir] [layout:name] [theme:name]
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
