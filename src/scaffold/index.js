'use strict';

const fs = require('fs');
const path = require('path');
const { copyDir } = require('../utils/fs');
const { resolveScaffoldLayout, resolveScaffoldTheme, parseNewArgs } = require('./args');
const { applyScaffoldDefaults, ensureStarterScaffold } = require('./starter');

function scaffold({ packageRoot, targetDir, layoutArg, themeArg }) {
  const templateDir = path.join(packageRoot, 'template');
  const templateLayoutsDir = path.join(templateDir, 'layouts');
  const builtinThemesDir = path.join(packageRoot, 'library', 'themes');
  const legacyTemplateThemesDir = path.join(templateDir, 'themes');
  const templateThemesDir = fs.existsSync(builtinThemesDir)
    ? builtinThemesDir
    : legacyTemplateThemesDir;
  const scaffoldExcludes = new Set(['dist', '.marque-serve.lock']);

  const layout = resolveScaffoldLayout(layoutArg, templateLayoutsDir);
  const theme = resolveScaffoldTheme(themeArg, templateThemesDir);

  copyDir(templateDir, targetDir, scaffoldExcludes);
  applyScaffoldDefaults({ targetDir, layout, theme });
  ensureStarterScaffold(targetDir);

  return { layout, theme };
}

module.exports = {
  scaffold,
  parseNewArgs,
};
