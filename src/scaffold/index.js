'use strict';

const path = require('path');
const { copyDir } = require('../utils/fs');
const { resolveScaffoldLayout, resolveScaffoldTheme, parseNewArgs } = require('./args');
const { applyScaffoldDefaults, ensureStarterScaffold } = require('./starter');

function scaffold({ packageRoot, targetDir, layoutArg, themeArg }) {
  const templateDir = path.join(packageRoot, 'template');
  const templateLayoutsDir = path.join(templateDir, 'layouts');
  const templateThemesDir = path.join(templateDir, 'themes');

  const layout = resolveScaffoldLayout(layoutArg, templateLayoutsDir);
  const theme = resolveScaffoldTheme(themeArg, templateThemesDir);

  copyDir(templateDir, targetDir);
  applyScaffoldDefaults({ targetDir, layout, theme });
  ensureStarterScaffold(targetDir);

  return { layout, theme };
}

module.exports = {
  scaffold,
  parseNewArgs,
};
