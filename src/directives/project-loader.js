'use strict';

const fs = require('fs');
const path = require('path');
const { defineDirective, resetDirectives, bootstrapBuiltins } = require('./registry');

function loadProjectDirectives(siteDir) {
  resetDirectives();
  bootstrapBuiltins();

  const files = collectProjectDirectiveFiles(siteDir);
  for (const file of files) {
    loadDirectiveFile(file);
  }

  return files;
}

function collectProjectDirectiveFiles(siteDir) {
  const directivesDir = path.resolve(siteDir, 'directives');
  if (!fs.existsSync(directivesDir)) return [];
  return dedupeAndSort(collectDirectiveJsFiles(directivesDir));
}

function loadDirectiveFile(filePath) {
  const resolved = require.resolve(filePath);
  delete require.cache[resolved];

  const mod = require(resolved);
  const api = { defineDirective };

  if (typeof mod === 'function') {
    mod(api);
    return;
  }

  if (mod && typeof mod.register === 'function') {
    mod.register(api);
  }
}

function collectDirectiveJsFiles(rootDir) {
  const out = [];
  walk(rootDir, out);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function dedupeAndSort(files) {
  return [...new Set(files.map(f => path.resolve(f)))].sort((a, b) => a.localeCompare(b));
}

function walk(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.js') {
      out.push(full);
    }
  }
}

module.exports = { loadProjectDirectives };
