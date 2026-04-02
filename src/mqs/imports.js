'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Expand all `@mqs-import 'file';` directives in source, recursively.
 * Returns the fully expanded CSS string.
 */
function expandImports(source, { sourceFile, rootDir, seen, compileMqs }) {
  const lines = String(source || '').split(/\r?\n/);
  const out   = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*@mqs-import\s+['"]([^'"]+)['"]\s*;\s*$/);
    if (!m) { out.push(line); continue; }

    const rel    = m[1].trim();
    const target = path.resolve(rootDir, rel);

    if (!fs.existsSync(target))
      throw new Error(`MQS import not found in ${sourceFile}:${i + 1} -> ${rel}`);

    const imported = compileMqs(fs.readFileSync(target, 'utf8'), {
      sourceFile: target,
      rootDir:    path.dirname(target),
      seen,
    });

    out.push(`/* mqs-import: ${rel} */`, imported, `/* end mqs-import: ${rel} */`);
  }

  return out.join('\n');
}

module.exports = { expandImports };