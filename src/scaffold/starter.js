'use strict';

const fs = require('fs');
const path = require('path');

const STARTER_PAGE_PATH = path.join('pages', 'getting-started', 'first-page.mq');

function applyScaffoldDefaults({ targetDir, layout, theme }) {
  const configPath = path.resolve(targetDir, 'marque.toml');
  if (!fs.existsSync(configPath)) return;

  let content = fs.readFileSync(configPath, 'utf8');
  content = content.replace(/\r\n?/g, '\n');
  content = replaceOrAppend(content, /^\s*layout\s*=\s*.+$/m, `layout = ${layout}`, 'layout = sidebar');
  content = replaceOrAppend(content, /^\s*theme\s*=\s*.+$/m, `theme = ${theme}`, 'theme = default');
  content = removeMatchingLine(content, /^\s*repo\s*=\s*.+$/m);
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

function removeMatchingLine(content, regex) {
  if (!regex.test(content)) return content;
  const next = content.replace(new RegExp(`${regex.source}\\r?\\n?`, regex.flags), '');
  return next.replace(/\n{3,}/g, '\n\n');
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
    '- Update navigation.mq to control navigation order.',
    '',
  ].join('\n');
}

module.exports = {
  applyScaffoldDefaults,
  ensureStarterScaffold,
};
