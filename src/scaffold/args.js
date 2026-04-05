'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeLayoutName } = require('../utils/strings');
const { listNames } = require('../utils/fs');

function parseNewArgs(argv) {
  const opts = { layout: 'sidebar', theme: 'default' };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
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
    if (/^layout:/i.test(token)) {
      opts.layout = token.replace(/^layout:/i, '');
      continue;
    }
    if (/^theme:/i.test(token)) {
      opts.theme = token.replace(/^theme:/i, '');
      continue;
    }
    positional.push(token);
  }

  return { positional, opts };
}

function resolveScaffoldLayout(layoutArg, templateLayoutsDir) {
  const requested = normalizeLayoutName(layoutArg);
  const available = listNames(templateLayoutsDir, ['.css']);
  const availableSet = new Set(available.map(normalizeLayoutName));

  if (availableSet.size && !availableSet.has(requested)) {
    const label = available.length ? available.join(', ') : '(none)';
    throw new Error(`Unknown layout "${layoutArg}". Available layouts: ${label}`);
  }

  return requested;
}

function resolveScaffoldTheme(themeArg, templateThemesDir) {
  const requested = String(themeArg || 'default').trim();
  const names = new Set();

  if (fs.existsSync(templateThemesDir)) {
    const entries = fs.readdirSync(templateThemesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile()) {
        const m = entry.name.match(/^(.+)\.css$/i);
        if (m) names.add(m[1]);
        continue;
      }

      // Backward compatibility for legacy themes/<name>/theme.css.
      if (entry.isDirectory()) {
        const legacyCss = fs.existsSync(path.join(templateThemesDir, entry.name, 'theme.css'));
        if (legacyCss) names.add(entry.name);
      }
    }
  }

  const available = Array.from(names).sort((a, b) => a.localeCompare(b));
  const availableSet = new Set(available);

  if (availableSet.size && !availableSet.has(requested)) {
    const label = available.length ? available.join(', ') : '(none)';
    throw new Error(`Unknown theme "${themeArg}". Available themes: ${label}`);
  }

  return requested;
}

module.exports = {
  parseNewArgs,
  resolveScaffoldLayout,
  resolveScaffoldTheme,
};
