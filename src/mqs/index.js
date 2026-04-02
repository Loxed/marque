'use strict';

const fs   = require('fs');
const path = require('path');

const { DEFAULT_PALETTE, parsePaletteBlock, buildEssentialsCSS } = require('./palette');
const { expandImports } = require('./imports');

function safeRealpath(filePath) {
  try { return fs.realpathSync(filePath); } catch (_) { return null; }
}

/**
 * Compile a MQS source string to CSS.
 * Handles `@mqs-import`, `@mqs-palette {}`, and `@mqs-essentials;`.
 */
function compileMqs(source, options = {}) {
  const sourceFile = options.sourceFile || '<inline>';
  const rootDir    = options.rootDir    || path.dirname(sourceFile);
  const seen       = options.seen       || new Set();

  const realSource = safeRealpath(sourceFile);
  if (realSource && seen.has(realSource))
    throw new Error(`MQS circular import detected: ${sourceFile}`);
  if (realSource) seen.add(realSource);

  let css = String(source || '').replace(/^\uFEFF/, '');

  // Pass compileMqs itself as a callback so imports.js stays dependency-free
  css = expandImports(css, { sourceFile, rootDir, seen, compileMqs });
  css = expandDirectives(css, sourceFile);

  if (realSource) seen.delete(realSource);
  return css;
}

function expandDirectives(source, sourceFile) {
  let palette = { ...DEFAULT_PALETTE };
  let css     = String(source || '');

  css = css.replace(/@mqs-palette\s*\{([\s\S]*?)\}\s*;?/gi, (_, block) => {
    palette = { ...palette, ...parsePaletteBlock(block, sourceFile) };
    return '';
  });

  css = css.replace(/@mqs-essentials\s*;/gi, () => buildEssentialsCSS(palette));
  return css;
}

/** Compile a MQS file on disk. */
function compileMqsFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  return compileMqs(source, {
    sourceFile: filePath,
    rootDir:    path.dirname(filePath),
    seen:       new Set(),
  });
}

module.exports = { compileMqs, compileMqsFile };