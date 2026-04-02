'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Recursively copy a directory, optionally skipping top-level names.
 * @param {string}  src
 * @param {string}  dest
 * @param {Set<string>} [excludeNames]
 */
function copyDir(src, dest, excludeNames = new Set()) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludeNames.has(entry.name)) continue;
    const srcPath  = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    entry.isDirectory() ? copyDir(srcPath, destPath, excludeNames)
                        : fs.copyFileSync(srcPath, destPath);
  }
}

/**
 * Collect unique base-names (no extension) for files matching one of the
 * given extensions inside a directory.
 */
function listNames(dir, extensions) {
  if (!fs.existsSync(dir)) return [];
  const names = new Set();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (extensions.includes(ext)) names.add(path.basename(entry.name, ext));
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Cross-platform path → forward-slash relative string.
 */
function normalizeRelPath(value) {
  return String(value || '')
    .split(path.sep).join('/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

module.exports = { copyDir, listNames, normalizeRelPath };