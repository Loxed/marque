'use strict';

const fs = require('fs');
const path = require('path');
const { loadProjectDirectives } = require('./directives/project-loader');
const { listDirectives, getDirective } = require('./directives/registry');
const { resolveThemePath } = require('./utils/themes');

const SAMPLE_MOD_SETS = [
  [],
  ['primary'],
  ['secondary'],
  ['tertiary'],
  ['accent'],
  ['accent2'],
  ['info'],
  ['warn'],
  ['danger'],
  ['ok'],
  ['ghost'],
  ['dark'],
  ['center'],
  ['featured'],
  ['open'],
];

const ROOT_GROUPS = [
  {
    title: 'Palette',
    matches: name => ['--mq-primary', '--mq-secondary', '--mq-tertiary'].includes(name),
  },
  {
    title: 'Surface And Text',
    matches: name => [
      '--mq-background',
      '--mq-surface',
      '--mq-surface-alt',
      '--mq-text',
      '--mq-muted',
      '--mq-border',
    ].includes(name),
  },
  {
    title: 'Navigation',
    matches: name => name.startsWith('--mq-nav-'),
  },
  {
    title: 'Code',
    matches: name => name.startsWith('--mq-code-'),
  },
  {
    title: 'Cards',
    matches: name => name.startsWith('--mq-card-'),
  },
  {
    title: 'Callouts',
    matches: name => name.startsWith('--mq-callout-'),
  },
  {
    title: 'Layout And Typography',
    matches: name => (
      name === '--mq-radius'
      || name === '--mq-max-width'
      || name.startsWith('--mq-font-')
    ),
  },
  {
    title: 'Additional Marque Tokens',
    matches: name => name.startsWith('--mq-'),
  },
  {
    title: 'Compatibility Aliases',
    matches: name => name.startsWith('--'),
  },
];

function writeThemeTemplate({ siteDir = '.', outputFile, referenceTheme = 'comte' } = {}) {
  const result = generateThemeTemplate({ siteDir, referenceTheme });
  const targetFile = resolveOutputFile(siteDir, outputFile);
  fs.mkdirSync(path.dirname(targetFile), { recursive: true });
  fs.writeFileSync(targetFile, result.css, 'utf8');

  return {
    ...result,
    outputFile: targetFile,
  };
}

function writeThemeStarter({ siteDir = '.', themeName, referenceTheme = 'comte', force = false } = {}) {
  const result = generateThemeStarter({ siteDir, themeName, referenceTheme });
  if (!force && fs.existsSync(result.outputFile)) {
    throw new Error(`Theme file already exists: ${result.outputFile}`);
  }

  fs.mkdirSync(path.dirname(result.outputFile), { recursive: true });
  fs.writeFileSync(result.outputFile, result.css, 'utf8');
  return result;
}

function generateThemeStarter({ siteDir = '.', themeName, referenceTheme = 'comte' } = {}) {
  const resolvedSiteDir = path.resolve(siteDir);
  const normalizedThemeName = normalizeThemeStarterName(themeName);
  const referenceThemePath = resolveReferenceThemePath(referenceTheme, resolvedSiteDir);
  const referenceSource = fs.readFileSync(referenceThemePath, 'utf8');
  const referenceBlocks = parseCssBlocks(referenceSource);
  const imports = referenceBlocks.filter(block => block.type === 'import');
  const rootBlock = referenceBlocks.find(block => block.type === 'block' && block.header.trim() === ':root');
  const rootEntries = rootBlock ? parseRootDeclarations(rootBlock.body) : [];
  const css = renderThemeStarter({
    themeName: normalizedThemeName,
    referenceTheme,
    referenceThemePath,
    imports,
    rootEntries,
  });

  return {
    css,
    themeName: normalizedThemeName,
    referenceThemePath,
    outputFile: path.join(resolvedSiteDir, 'themes', `${normalizedThemeName}.css`),
  };
}

function generateThemeTemplate({ siteDir = '.', referenceTheme = 'comte' } = {}) {
  const resolvedSiteDir = path.resolve(siteDir);
  const referenceThemePath = resolveReferenceThemePath(referenceTheme, resolvedSiteDir);
  const referenceSource = fs.readFileSync(referenceThemePath, 'utf8');
  const warnings = detectReferenceThemeWarnings(referenceSource);
  const referenceBlocks = parseCssBlocks(referenceSource);
  const referenceImports = referenceBlocks.filter(block => block.type === 'import');
  const rootBlock = referenceBlocks.find(block => block.type === 'block' && block.header.trim() === ':root');
  const rootEntries = rootBlock ? parseRootDeclarations(rootBlock.body) : [];
  const otherBlocks = referenceBlocks.filter(block => block !== rootBlock && block.type !== 'import');

  const directives = analyzeDirectives(resolvedSiteDir);
  const classifiedBlocks = classifyReferenceBlocks(otherBlocks, directives);
  const css = renderThemeTemplate({
    siteDir: resolvedSiteDir,
    referenceTheme,
    referenceThemePath,
    imports: referenceImports,
    rootEntries,
    directives,
    baseBlocks: classifiedBlocks.baseBlocks,
    sharedBlocks: classifiedBlocks.sharedBlocks,
    directiveBlocks: classifiedBlocks.directiveBlocks,
  });

  return {
    css,
    referenceThemePath,
    directives,
    warnings,
  };
}

function resolveOutputFile(siteDir, outputFile) {
  const resolvedSiteDir = path.resolve(siteDir || '.');
  if (!outputFile) {
    return path.join(resolvedSiteDir, 'themes', 'template.css');
  }

  if (path.isAbsolute(outputFile)) return outputFile;
  return path.resolve(resolvedSiteDir, outputFile);
}

function resolveReferenceThemePath(referenceTheme, siteDir) {
  const raw = String(referenceTheme || 'comte').trim();
  if (!raw) {
    throw new Error('Reference theme name cannot be empty');
  }
  return resolveThemePath(raw, [
    path.resolve(siteDir, 'themes'),
    path.resolve(__dirname, '..', 'template', 'themes'),
    path.resolve(__dirname, '..', 'themes'),
  ], { defaultName: 'comte' });
}

function normalizeThemeStarterName(themeName) {
  const raw = path.basename(String(themeName || '').trim()).replace(/\.css$/i, '');
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (!normalized) {
    throw new Error('Theme name cannot be empty. Use letters, numbers, dashes, or underscores.');
  }

  return normalized;
}

function analyzeDirectives(siteDir) {
  loadProjectDirectives(siteDir);

  return listDirectives().map(entry => {
    const def = getDirective(entry.name);
    const styleText = resolveDirectiveStyle(def, entry);
    const styleBlocks = styleText ? parseCssBlocks(styleText).filter(block => block.type === 'block') : [];
    const selectors = new Set();

    for (const html of sampleDirectiveRenderOutputs(entry.name, def)) {
      collectSelectorStemsFromHtml(html, selectors);
    }

    for (const block of styleBlocks) {
      collectSelectorStemsFromCssHeader(block.header, selectors);
    }

    return {
      name: entry.name,
      type: entry.type,
      def,
      selectors: Array.from(selectors).sort(),
      styleBlocks,
    };
  });
}

function resolveDirectiveStyle(def, entry) {
  if (!def || def.style === null || def.style === undefined) return '';
  if (typeof def.style === 'function') {
    const value = def.style({ name: entry.name, type: entry.type });
    return typeof value === 'string' ? value.trim() : '';
  }
  return typeof def.style === 'string' ? def.style.trim() : '';
}

function sampleDirectiveRenderOutputs(name, def) {
  if (!def || typeof def.render !== 'function') return [];

  const outputs = new Set();
  for (const mods of SAMPLE_MOD_SETS) {
    const sample = createDirectiveSample(name, def.type, mods);
    try {
      const html = def.render(sample);
      if (typeof html === 'string' && html.trim()) {
        outputs.add(html.trim());
      }
    } catch (_) {
      // Ignore sample failures. We only need enough successful renders to infer selectors.
    }
  }

  return Array.from(outputs);
}

function createDirectiveSample(name, type, mods) {
  const childrenHtml = '<h2>Sample Value</h2><p>Sample Label</p>';
  const nodes = [
    { type: 'directive', tag: 'card', inline: false, mods: [], name: null, children: [] },
    { type: 'directive', tag: 'card', inline: false, mods: [], name: null, children: [] },
  ];
  const opts = { _stepCounter: 1 };

  return {
    tag: name,
    mods: Array.isArray(mods) ? mods : [],
    name: type === 'inline' ? 'Sample' : 'Sample',
    children: childrenHtml,
    nodes,
    node: { type: 'directive', tag: name, inline: type === 'inline', mods: Array.isArray(mods) ? mods : [], name: 'Sample', children: nodes },
    opts,
    ctx: {
      renderNodes: () => childrenHtml,
      renderMarkdown: src => String(src || ''),
      escapeAttr,
    },
  };
}

function collectSelectorStemsFromHtml(html, out) {
  const text = String(html || '');
  const classMatches = text.match(/class\s*=\s*"([^"]+)"/gi) || [];
  for (const match of classMatches) {
    const classText = match.replace(/^class\s*=\s*"/i, '').replace(/"$/, '');
    for (const cls of classText.split(/\s+/).filter(Boolean)) {
      if (cls.startsWith('mq-')) out.add(`.${cls}`);
    }
  }

  const tagPattern = /<([a-z][a-z0-9-]*)\b/gi;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(text))) {
    const tag = String(tagMatch[1] || '').toLowerCase();
    if (tag.includes('-')) out.add(tag);
  }
}

function collectSelectorStemsFromCssHeader(header, out) {
  const source = String(header || '');

  const classPattern = /\.mq-[a-z0-9_-]+/gi;
  let classMatch;
  while ((classMatch = classPattern.exec(source))) {
    out.add(classMatch[0]);
  }

  const tagPattern = /(^|[\s>+~,([])([a-z][a-z0-9]*-[a-z0-9-]*)(?=[\s>+~#.:,[\]])/gi;
  let tagMatch;
  while ((tagMatch = tagPattern.exec(source))) {
    out.add(tagMatch[2].toLowerCase());
  }
}

function classifyReferenceBlocks(blocks, directives) {
  const directiveBlocks = new Map();
  const sharedBlocks = new Map();
  const baseBlocks = [];

  for (const directive of directives) {
    directiveBlocks.set(directive.name, []);
  }

  for (const block of blocks) {
    const matched = directives.filter(directive => blockMatchesDirective(block, directive));
    if (!matched.length) {
      baseBlocks.push(block);
      continue;
    }

    if (matched.length === 1) {
      directiveBlocks.get(matched[0].name).push(block);
      continue;
    }

    const key = matched.map(d => d.name).sort().join('|');
    if (!sharedBlocks.has(key)) sharedBlocks.set(key, { directives: matched.map(d => d.name), blocks: [] });
    sharedBlocks.get(key).blocks.push(block);
  }

  return {
    baseBlocks,
    sharedBlocks: Array.from(sharedBlocks.values()),
    directiveBlocks,
  };
}

function blockMatchesDirective(block, directive) {
  const haystack = `${block.header}\n${block.body}`.toLowerCase();
  return directive.selectors.some(selector => haystack.includes(selector.toLowerCase()));
}

function renderThemeTemplate({
  siteDir,
  referenceTheme,
  referenceThemePath,
  imports,
  rootEntries,
  directives,
  baseBlocks,
  sharedBlocks,
  directiveBlocks,
}) {
  const sections = [];
  const sharedDirectiveNames = new Set(sharedBlocks.flatMap(group => group.directives));

  sections.push([
    `/* theme scaffold generated by marque */`,
    `/* site: ${siteDir} */`,
    `/* reference theme: ${referenceTheme} */`,
    `/* reference file: ${referenceThemePath} */`,
    `/*`,
    `  This file is organized from two inputs:`,
    `  1. selectors discovered from directive render output and directive style blocks`,
    `  2. the current reference theme, used as the baseline for token values and shared UI styles`,
    `*/`,
  ].join('\n'));

  if (imports.length) {
    sections.push(renderImportsSection(imports));
  }

  if (rootEntries.length) {
    sections.push(renderRootSection(rootEntries));
  }

  if (baseBlocks.length) {
    sections.push(renderBlockSection('Base Theme Structure', [
      'Shared typography, layout, navigation, utilities, and non-directive component styles copied from the reference theme.',
    ], baseBlocks));
  }

  if (sharedBlocks.length) {
    const sharedParts = sharedBlocks.map(group => {
      const title = `/* Shared Directive Blocks: ${group.directives.map(name => `@${name}`).join(', ')} */`;
      const blocks = group.blocks.map(formatCssBlock).join('\n\n');
      return `${title}\n${blocks}`;
    });
    sections.push(sharedParts.join('\n\n'));
  }

  const directiveSections = directives.map(directive => renderDirectiveSection(
    directive,
    directiveBlocks.get(directive.name) || [],
    { hasSharedReferenceBlocks: sharedDirectiveNames.has(directive.name) },
  ));
  sections.push(directiveSections.join('\n\n'));

  return sections.filter(Boolean).join('\n\n') + '\n';
}

function renderThemeStarter({
  themeName,
  referenceTheme,
  referenceThemePath,
  imports,
  rootEntries,
}) {
  const sections = [[
    `/* marque theme starter */`,
    `/* theme: ${themeName} */`,
    `/* reference theme: ${referenceTheme} */`,
    `/* reference file: ${referenceThemePath} */`,
    `/* common.css owns the shared component baseline. */`,
    `/* Start by changing tokens, then add a few distinctive overrides below. */`,
  ].join('\n')];

  if (imports.length) {
    sections.push(renderImportsSection(imports));
  }

  if (rootEntries.length) {
    sections.push(renderRootSection(rootEntries));
  }

  sections.push([
    '/* Distinctive Overrides */',
    '/* Keep this file focused: tokens first, a handful of opinionated selectors second. */',
    '',
    'body {',
    '  /* Example: background-image: radial-gradient(circle at top, color-mix(in srgb, var(--mq-primary) 12%, transparent), transparent 55%); */',
    '}',
    '',
    '.mq-nav {',
    '  /* Example: add blur, tint, or stronger borders here. */',
    '}',
    '',
    '.mq-main :is(h1, h2) {',
    '  /* Example: swap typography, casing, or spacing. */',
    '}',
    '',
    '.mq-card {',
    '  /* Example: push surfaces, shadows, or radius in a clear direction. */',
    '}',
    '',
    '.mq-code-block,',
    '.mq-main pre {',
    '  /* Example: make code blocks feel like part of the theme, not a default panel. */',
    '}',
    '',
    '.mq-summary-panel,',
    '.mq-page-nav-link {',
    '  /* Example: tune supporting chrome so the theme feels consistent end to end. */',
    '}',
  ].join('\n'));

  return sections.join('\n\n') + '\n';
}

function renderImportsSection(imports) {
  const lines = ['/* Imports */'];
  for (const block of imports) {
    lines.push(block.text.trim());
  }
  return lines.join('\n');
}

function renderRootSection(rootEntries) {
  const grouped = groupRootDeclarations(rootEntries);
  const lines = ['/* Theme Tokens */', ':root {'];

  for (const group of grouped) {
    if (!group.items.length) continue;
    lines.push(`  /* ${group.title} */`);
    for (const item of group.items) {
      lines.push(`  ${item.name}: ${item.value};`);
    }
    lines.push('');
  }

  while (lines[lines.length - 1] === '') lines.pop();
  lines.push('}');
  return lines.join('\n');
}

function groupRootDeclarations(entries) {
  const remaining = entries.slice();
  const grouped = [];

  for (const group of ROOT_GROUPS) {
    const items = [];
    for (let i = 0; i < remaining.length; ) {
      if (group.matches(remaining[i].name)) {
        items.push(remaining[i]);
        remaining.splice(i, 1);
        continue;
      }
      i += 1;
    }
    if (items.length) grouped.push({ title: group.title, items });
  }

  if (remaining.length) {
    grouped.push({ title: 'Uncategorized Tokens', items: remaining });
  }

  return grouped;
}

function renderBlockSection(title, introLines, blocks) {
  const lines = [`/* ${title} */`];
  for (const line of introLines) {
    lines.push(`/* ${line} */`);
  }
  lines.push('');
  lines.push(blocks.map(formatCssBlock).join('\n\n'));
  return lines.join('\n');
}

function renderDirectiveSection(directive, matchedBlocks, { hasSharedReferenceBlocks = false } = {}) {
  const lines = [
    `/* @${directive.name} (${directive.type}) */`,
  ];

  if (directive.selectors.length) {
    lines.push(`/* selectors: ${directive.selectors.join(', ')} */`);
  } else {
    lines.push('/* selectors: none discovered from render output */');
  }

  const bodyBlocks = [];
  if (matchedBlocks.length) {
    bodyBlocks.push(...matchedBlocks.map(formatCssBlock));
  }

  if (directive.styleBlocks.length) {
    if (bodyBlocks.length) {
      bodyBlocks.push('/* Directive-provided style scaffold */');
    }
    bodyBlocks.push(...directive.styleBlocks.map(formatCssBlock));
  }

  if (!bodyBlocks.length) {
    if (hasSharedReferenceBlocks) {
      bodyBlocks.push('/* Shared baseline for this directive lives in the shared directive section above. Add directive-specific selectors here only if this theme needs extra treatment. */');
    } else {
      const placeholders = buildDirectivePlaceholders(directive);
      if (placeholders.length) {
        bodyBlocks.push(...placeholders);
      } else {
        bodyBlocks.push('/* No wrapper selectors. This directive changes rendering flow rather than emitting a themed element. */');
      }
    }
  }

  lines.push(bodyBlocks.join('\n\n'));
  return lines.join('\n');
}

function buildDirectivePlaceholders(directive) {
  const selectors = directive.selectors.filter(selector => selector.startsWith('.') || selector.includes('-'));
  return selectors.map(selector => `${selector} {\n  /* Add ${directive.name}-specific theming here. */\n}`);
}

function parseRootDeclarations(body) {
  const out = [];
  const cleaned = stripCssComments(body);
  const pattern = /(--[a-z0-9_-]+)\s*:\s*([^;]+);/gi;
  let match;
  while ((match = pattern.exec(cleaned))) {
    out.push({
      name: match[1].trim(),
      value: match[2].trim(),
    });
  }
  return out;
}

function parseCssBlocks(source) {
  const blocks = [];
  const text = String(source || '');
  let i = 0;

  while (i < text.length) {
    i = skipCssWhitespaceAndComments(text, i);
    if (i >= text.length) break;

    if (text.startsWith('@import', i)) {
      const end = findCssStatementEnd(text, i);
      const statement = text.slice(i, end).trim();
      if (statement) {
        blocks.push({ type: 'import', text: statement });
      }
      i = end;
      continue;
    }

    const braceIndex = findNextCssChar(text, i, '{');
    if (braceIndex === -1) break;

    const header = text.slice(i, braceIndex).trim();
    const closeIndex = findMatchingCssBrace(text, braceIndex);
    if (closeIndex === -1) break;

    const body = text.slice(braceIndex + 1, closeIndex);
    blocks.push({
      type: 'block',
      header,
      body,
      text: `${header} {${body}}`,
    });

    i = closeIndex + 1;
  }

  return blocks;
}

function formatCssBlock(block) {
  if (!block) return '';
  if (block.type === 'import') return block.text.trim();
  const body = formatCssBody(block.body);
  return body
    ? `${block.header.trim()} {\n${body}\n}`
    : `${block.header.trim()} {\n}`;
}

function formatCssBody(body) {
  const lines = trimEmptyBlockLines(String(body || '').split(/\r?\n/));
  const out = [];
  let depth = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }

    if (looksLikeDanglingCssPropertyName(line)) continue;

    const effectiveDepth = line.startsWith('}')
      ? Math.max(0, depth - 1)
      : depth;

    out.push(`${'  '.repeat(effectiveDepth + 1)}${line}`);
    depth = Math.max(0, depth + countCssChar(line, '{') - countCssChar(line, '}'));
  }

  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

function trimEmptyBlockLines(lines) {
  let start = 0;
  let end = lines.length;

  while (start < end && !String(lines[start] || '').trim()) start += 1;
  while (end > start && !String(lines[end - 1] || '').trim()) end -= 1;

  return lines.slice(start, end);
}

function looksLikeDanglingCssPropertyName(line) {
  return /^[a-z-]+\s*$/i.test(String(line || '').trim());
}

function countCssChar(text, char) {
  let total = 0;
  for (const ch of String(text || '')) {
    if (ch === char) total += 1;
  }
  return total;
}

function detectReferenceThemeWarnings(source) {
  const text = String(source || '');
  const warnings = [];

  if (/\/\*\s*theme scaffold generated by marque\s*\*\//i.test(text)) {
    warnings.push('Reference theme already looks like a generated scaffold. The output will reuse that scaffolded CSS as input.');
  }

  if (/\/\*\s*@[\w-]+\s+\((?:block|inline)\)\s*\*\//i.test(text)) {
    warnings.push('Reference theme already contains directive scaffold sections. Clean hand-authored theme files make better generator references.');
  }

  return warnings;
}

function skipCssWhitespaceAndComments(text, start) {
  let i = start;
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i += 1;
      continue;
    }
    if (text[i] === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return text.length;
      i = end + 2;
      continue;
    }
    break;
  }
  return i;
}

function findCssStatementEnd(text, start) {
  let quote = null;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (!quote && ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return text.length;
      i = end + 1;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }

    if (ch === ';') return i + 1;
  }

  return text.length;
}

function findNextCssChar(text, start, target) {
  let quote = null;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (!quote && ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }

    if (ch === target) return i;
  }

  return -1;
}

function findMatchingCssBrace(text, openIndex) {
  let depth = 0;
  let quote = null;

  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (!quote && ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 1;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function stripCssComments(value) {
  return String(value || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

module.exports = {
  generateThemeTemplate,
  generateThemeStarter,
  writeThemeTemplate,
  writeThemeStarter,
};
