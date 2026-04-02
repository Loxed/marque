'use strict';

const fs = require('fs');
const path = require('path');

const STARTER_PAGE_PATH = path.join('pages', 'getting-started', 'first-page.mq');

function applyScaffoldDefaults({ targetDir, layout, theme }) {
  const configPath = path.resolve(targetDir, 'marque.toml');
  if (!fs.existsSync(configPath)) return;

  let content = fs.readFileSync(configPath, 'utf8');
  content = replaceOrAppend(content, /^\s*layout\s*=\s*"[^"]*"\s*$/m, `layout = "${layout}"`, 'layout = "sidebar"');
  content = replaceOrAppend(content, /^\s*theme\s*=\s*"[^"]*"\s*$/m, `theme = "${theme}"`, 'theme = "default"');
  fs.writeFileSync(configPath, content, 'utf8');
}

function ensureStarterScaffold(targetDir) {
  const pagePath = path.resolve(targetDir, STARTER_PAGE_PATH);
  if (fs.existsSync(pagePath)) return;

  fs.mkdirSync(path.dirname(pagePath), { recursive: true });
  fs.writeFileSync(pagePath, buildStarterFirstPage(), 'utf8');
}

function replaceOrAppend(content, regex, replacement, fallbackLine) {
  if (regex.test(content)) {
    return content.replace(regex, replacement);
  }

  if (content.includes(fallbackLine)) {
    return content.replace(fallbackLine, replacement);
  }

  const trimmed = content.replace(/\s+$/, '');
  return `${trimmed}\n${replacement}\n`;
}

function buildStarterFirstPage() {
  return [
    '# Your first page',
    '',
    'Welcome to your Marque site.',
    '',
    '## Next steps',
    '',
    '- Edit this file to make it your own.',
    '- Add more pages under pages/.',
    '- Update summary.mq to control navigation order.',
    '',
  ].join('\n');
}

module.exports = {
  applyScaffoldDefaults,
  ensureStarterScaffold,
};
