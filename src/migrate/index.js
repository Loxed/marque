'use strict';

const fs = require('fs');
const path = require('path');
const { copyDir, normalizeRelPath } = require('../utils/fs');
const { resolveScaffoldLayout, resolveScaffoldTheme } = require('../scaffold/args');
const { toTitle } = require('../utils/strings');

const DOC_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn'];
const UNSUPPORTED_YAML = Symbol('unsupported-yaml');

function migrateSite({ packageRoot, sourceDir, targetDir, from, layout, theme }) {
  const packageDir = path.resolve(packageRoot);
  const templateDir = path.join(packageDir, 'template');
  const templateLayoutsDir = path.join(templateDir, 'layouts');
  const templateThemesDir = path.join(templateDir, 'themes');

  const absSourceDir = path.resolve(sourceDir || '.');
  const absTargetDir = path.resolve(targetDir || `${absSourceDir}-marque`);

  if (!fs.existsSync(absSourceDir) || !fs.statSync(absSourceDir).isDirectory()) {
    throw new Error(`Source directory not found: ${absSourceDir}`);
  }
  if (fs.existsSync(absTargetDir)) {
    throw new Error(`Target directory already exists: ${absTargetDir}`);
  }

  const selectedLayout = resolveScaffoldLayout(layout || 'sidebar', templateLayoutsDir);
  const selectedTheme = resolveScaffoldTheme(theme || 'comte', templateThemesDir);
  const sourceKind = detectMigrationSource(absSourceDir, from);
  const project = sourceKind === 'mdbook'
    ? importMdBookProject(absSourceDir)
    : importMkDocsProject(absSourceDir);

  writeMigratedSite({
    templateDir,
    targetDir: absTargetDir,
    project,
    layout: selectedLayout,
    theme: selectedTheme,
  });

  return {
    ...project,
    kind: sourceKind,
    sourceDir: absSourceDir,
    targetDir: absTargetDir,
    layout: selectedLayout,
    theme: selectedTheme,
  };
}

function detectMigrationSource(sourceDir, explicit) {
  const requested = String(explicit || 'auto').trim().toLowerCase();
  if (requested && requested !== 'auto') {
    if (requested === 'mdbook' || requested === 'mkdocs') return requested;
    throw new Error(`Unsupported migration source "${explicit}". Supported sources: mdbook, mkdocs`);
  }

  const hasMdBook = fs.existsSync(path.join(sourceDir, 'book.toml'))
    && fs.existsSync(path.join(sourceDir, 'src', 'SUMMARY.md'));
  const hasMkDocs = fs.existsSync(path.join(sourceDir, 'mkdocs.yml'))
    || fs.existsSync(path.join(sourceDir, 'mkdocs.yaml'));

  if (hasMdBook && hasMkDocs) {
    throw new Error('Could not auto-detect migration source because both mdBook and MkDocs config files were found. Re-run with --from mdbook or --from mkdocs.');
  }
  if (hasMdBook) return 'mdbook';
  if (hasMkDocs) return 'mkdocs';

  throw new Error('Could not auto-detect a supported source project. Supported first-pass sources are mdBook and MkDocs.');
}

function importMdBookProject(sourceDir) {
  const docsRoot = path.join(sourceDir, 'src');
  const configPath = path.join(sourceDir, 'book.toml');
  const summaryPath = path.join(docsRoot, 'SUMMARY.md');
  const config = parseMdBookConfig(configPath);
  const mdBookSummary = fs.existsSync(summaryPath)
    ? parseMdBookSummaryStructure(fs.readFileSync(summaryPath, 'utf8'))
    : null;
  const preferredTargets = mdBookSummary ? assignStructuredTargets(mdBookSummary.items) : new Map();
  const scan = scanDocsRoot(docsRoot, {
    excludeFiles: new Set(['SUMMARY.md']),
    preferredTargets,
  });
  const warnings = [...config.warnings, ...scan.warnings];

  if (!scan.pages.length) {
    throw new Error(`No markdown pages found in ${docsRoot}`);
  }

  const pages = scan.pages.map(page => convertPageSource(page, scan.sourceMap, warnings));
  const summaryLines = mdBookSummary
    ? buildStructuredSummaryFromItems(mdBookSummary.items, scan.sourceMap, warnings)
    : buildFallbackSummary(scan.pages, warnings);

  return {
    title: config.title || path.basename(sourceDir),
    description: config.description || '',
    pages,
    assets: scan.assets,
    summaryLines,
    warnings,
    notes: buildMigrationNotes({
      sourceKind: 'mdBook',
      docsRoot,
      warnings,
      extraNotes: config.notes,
      pageCount: pages.length,
      assetCount: scan.assets.length,
    }),
  };
}

function importMkDocsProject(sourceDir) {
  const configPath = fs.existsSync(path.join(sourceDir, 'mkdocs.yml'))
    ? path.join(sourceDir, 'mkdocs.yml')
    : path.join(sourceDir, 'mkdocs.yaml');
  const config = parseMkDocsConfig(configPath);
  const docsRoot = path.resolve(sourceDir, config.docsDir || 'docs');
  const preferredTargets = config.navItems.length ? assignStructuredTargets(flattenMkDocsNavItems(config.navItems)) : new Map();
  const scan = scanDocsRoot(docsRoot, { preferredTargets });
  const warnings = [...config.warnings, ...scan.warnings];

  if (!fs.existsSync(docsRoot) || !fs.statSync(docsRoot).isDirectory()) {
    throw new Error(`MkDocs docs directory not found: ${docsRoot}`);
  }
  if (!scan.pages.length) {
    throw new Error(`No markdown pages found in ${docsRoot}`);
  }

  const pages = scan.pages.map(page => convertPageSource(page, scan.sourceMap, warnings));
  const summaryLines = config.navItems.length
    ? buildMkDocsSummary(config.navItems, scan.sourceMap, warnings)
    : buildFallbackSummary(scan.pages, warnings);

  return {
    title: config.siteName || path.basename(sourceDir),
    description: config.siteDescription || '',
    pages,
    assets: scan.assets,
    summaryLines,
    warnings,
    notes: buildMigrationNotes({
      sourceKind: 'MkDocs',
      docsRoot,
      warnings,
      extraNotes: config.notes,
      pageCount: pages.length,
      assetCount: scan.assets.length,
    }),
  };
}

function writeMigratedSite({ templateDir, targetDir, project, layout, theme }) {
  fs.mkdirSync(targetDir, { recursive: true });

  copyDir(path.join(templateDir, 'layouts'), path.join(targetDir, 'layouts'));
  copyDir(path.join(templateDir, 'themes'), path.join(targetDir, 'themes'));

  const pagesDir = path.join(targetDir, 'pages');
  const staticDir = path.join(targetDir, 'static');
  fs.rmSync(pagesDir, { recursive: true, force: true });
  fs.rmSync(staticDir, { recursive: true, force: true });
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.mkdirSync(staticDir, { recursive: true });

  const faviconPath = path.join(templateDir, 'static', 'favicon.ico');
  if (fs.existsSync(faviconPath)) {
    fs.copyFileSync(faviconPath, path.join(staticDir, 'favicon.ico'));
  }

  for (const page of project.pages) {
    const outFile = path.join(pagesDir, page.targetRel);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, page.content, 'utf8');
  }

  for (const asset of project.assets) {
    const outFile = path.join(staticDir, asset.relPath);
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.copyFileSync(asset.sourcePath, outFile);
  }

  fs.writeFileSync(path.join(pagesDir, '404.mq'), buildDefault404Page(), 'utf8');
  fs.writeFileSync(path.join(pagesDir, 'migration-notes.mq'), project.notes, 'utf8');
  fs.writeFileSync(path.join(targetDir, 'navigation.mq'), buildSummaryFile(project.summaryLines), 'utf8');
  fs.writeFileSync(path.join(targetDir, 'marque.toml'), buildMarqueConfig(project, layout, theme), 'utf8');
}

function scanDocsRoot(docsRoot, options = {}) {
  const excludeFiles = options.excludeFiles || new Set();
  const preferredTargets = options.preferredTargets || new Map();
  const pages = [];
  const assets = [];
  const warnings = [];
  const seenTargetPages = new Map();
  const sourceMap = new Map();

  walkDir(docsRoot, (fullPath) => {
    const relPath = normalizeRelPath(path.relative(docsRoot, fullPath));
    if (!relPath) return;
    if (excludeFiles.has(path.basename(relPath))) return;

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return;

    const ext = path.extname(relPath).toLowerCase();
    if (DOC_EXTENSIONS.includes(ext)) {
      const normalizedSourceKey = normalizeSourceKey(relPath);
      const targetRel = preferredTargets.get(normalizedSourceKey) || mapDocPathToMq(relPath);

      if (seenTargetPages.has(targetRel)) {
        warnings.push(`Skipped "${relPath}" because it collides with "${seenTargetPages.get(targetRel)}" after conversion to "${targetRel}".`);
        return;
      }

      seenTargetPages.set(targetRel, relPath);
      sourceMap.set(normalizedSourceKey, targetRel);
      pages.push({
        sourcePath: fullPath,
        sourceRel: relPath,
        targetRel,
        titleHint: extractTitleHint(fs.readFileSync(fullPath, 'utf8'), relPath),
      });
      return;
    }

    assets.push({
      sourcePath: fullPath,
      relPath,
    });
  });

  pages.sort((a, b) => sortPageRel(a.targetRel, b.targetRel));
  assets.sort((a, b) => a.relPath.localeCompare(b.relPath));

  return { pages, assets, warnings, sourceMap };
}

function walkDir(root, visitor) {
  if (!fs.existsSync(root)) return;
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, visitor);
      continue;
    }
    visitor(fullPath);
  }
}

function convertPageSource(page, sourceMap, warnings) {
  const raw = fs.readFileSync(page.sourcePath, 'utf8');
  const extracted = extractLeadingYamlFrontmatter(raw);
  const bodySource = extracted ? extracted.body : raw;
  const frontmatterMeta = extracted
    ? parseSimpleYamlFrontmatter(extracted.raw, `${page.sourceRel} frontmatter`, warnings)
    : {};
  const safeFrontmatter = filterSimpleFrontmatter(frontmatterMeta, page.sourceRel, warnings);
  if (Object.keys(safeFrontmatter).length && !safeFrontmatter.nav) {
    safeFrontmatter.nav = path.posix.basename(page.targetRel, '.mq');
  }
  const rewrittenBody = rewriteDocumentLinks(bodySource, page.sourceRel, sourceMap);
  const toml = buildTomlFrontmatter(safeFrontmatter);
  const content = toml ? `${toml}\n${rewrittenBody.replace(/^\s+/, '')}` : rewrittenBody;

  return {
    ...page,
    content,
  };
}

function extractLeadingYamlFrontmatter(source) {
  const text = String(source || '');
  const lines = text.split(/\r?\n/);
  if (!lines.length || lines[0].trim() !== '---') return null;

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line === '---' || line === '...') {
      return {
        raw: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
      };
    }
  }

  return null;
}

function parseSimpleYamlFrontmatter(raw, contextLabel, warnings) {
  const out = {};
  const lines = String(raw || '').split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const originalLine = lines[i];
    const line = stripYamlComment(originalLine);
    if (!line.trim()) continue;

    const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      warnings.push(`Skipped unsupported YAML frontmatter syntax in ${contextLabel}: "${originalLine.trim()}".`);
      continue;
    }

    const key = match[1].trim();
    const rawValue = match[2].trim();

    if (!rawValue) {
      const collection = collectYamlIndentedBlock(lines, i + 1, indentationOf(originalLine));
      if (collection.lines.length) {
        const arrayValue = parseYamlScalarArray(collection.lines);
        if (arrayValue) {
          warnings.push(`Dropped YAML array "${key}" from ${contextLabel}; Marque frontmatter migration keeps only simple scalar values.`);
        } else {
          warnings.push(`Dropped nested YAML block "${key}" from ${contextLabel}; manual migration is needed for complex metadata.`);
        }
        i = collection.nextIndex - 1;
      } else {
        out[key] = '';
      }
      continue;
    }

    const parsed = parseYamlScalar(rawValue);
    if (parsed === UNSUPPORTED_YAML) {
      warnings.push(`Dropped unsupported YAML value for "${key}" in ${contextLabel}.`);
      continue;
    }
    out[key] = parsed;
  }

  return out;
}

function collectYamlIndentedBlock(lines, startIndex, parentIndent) {
  const collected = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      collected.push(line);
      i += 1;
      continue;
    }

    const indent = indentationOf(line);
    if (indent <= parentIndent) break;
    collected.push(line);
    i += 1;
  }

  return { lines: collected, nextIndex: i };
}

function parseYamlScalarArray(lines) {
  const values = [];

  for (const line of lines) {
    const trimmed = stripYamlComment(line).trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^-\s+(.*)$/);
    if (!match) return null;
    const parsed = parseYamlScalar(match[1].trim());
    if (parsed === UNSUPPORTED_YAML) return null;
    values.push(parsed);
  }

  return values;
}

function parseYamlScalar(raw) {
  const text = stripYamlComment(String(raw || '')).trim();
  if (!text) return '';
  if (text === '|' || text === '>') return UNSUPPORTED_YAML;
  if (/^\[.*\]$/.test(text) || /^\{.*\}$/.test(text)) return UNSUPPORTED_YAML;
  if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);
  if (/^(null|~)$/i.test(text)) return '';
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    const num = Number(text);
    return Number.isFinite(num) ? num : text;
  }
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('\'') && text.endsWith('\''))) {
    return text.slice(1, -1);
  }
  return text;
}

function stripYamlComment(line) {
  let quote = null;
  let escaped = false;
  let out = '';

  for (let i = 0; i < String(line || '').length; i += 1) {
    const ch = line[i];
    if (quote === '"') {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === '\'') {
      out += ch;
      if (ch === '\'') quote = null;
      continue;
    }
    if (ch === '#') break;
    if (ch === '"' || ch === '\'') quote = ch;
    out += ch;
  }

  return out;
}

function filterSimpleFrontmatter(meta, sourceRel, warnings) {
  const out = {};
  for (const [key, value] of Object.entries(meta || {})) {
    if (!/^[A-Za-z0-9_-]+$/.test(key)) {
      warnings.push(`Skipped unsupported frontmatter key "${key}" in ${sourceRel}.`);
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
      continue;
    }
    warnings.push(`Dropped non-scalar frontmatter key "${key}" in ${sourceRel}.`);
  }
  return out;
}

function buildTomlFrontmatter(meta) {
  const entries = Object.entries(meta || {});
  if (!entries.length) return '';

  const lines = ['+++'];
  for (const [key, value] of entries) {
    lines.push(`${key} = ${formatTomlValue(value)}`);
  }
  lines.push('+++');
  lines.push('');
  return lines.join('\n');
}

function formatTomlValue(value) {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  const text = String(value || '');
  if (canUseBareTomlString(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function rewriteDocumentLinks(source, currentSourceRel, sourceMap) {
  const currentTargetRel = getMappedTarget(sourceMap, currentSourceRel) || mapDocPathToMq(currentSourceRel);
  const lines = String(source || '').split(/\r?\n/);
  let inFence = false;

  return lines.map(line => {
    if (/^\s*```/.test(line.trim())) {
      inFence = !inFence;
      return line;
    }
    if (inFence) return line;

    let next = line.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (_, head, rawTarget, tail) => {
      return `${head}${rewriteMarkdownTarget(rawTarget, currentSourceRel, currentTargetRel, sourceMap)}${tail}`;
    });

    next = next.replace(/(\b(?:href|src)=["'])([^"']+)(["'])/gi, (_, head, rawTarget, tail) => {
      return `${head}${rewriteHrefTarget(rawTarget, currentSourceRel, currentTargetRel, sourceMap)}${tail}`;
    });

    return next;
  }).join('\n');
}

function rewriteMarkdownTarget(rawTarget, currentSourceRel, currentTargetRel, sourceMap) {
  const text = String(rawTarget || '').trim();
  if (!text) return rawTarget;

  if (text.startsWith('<') && text.endsWith('>')) {
    const rewritten = rewriteHrefTarget(text.slice(1, -1), currentSourceRel, currentTargetRel, sourceMap);
    return `<${rewritten}>`;
  }

  const match = text.match(/^(\S+)(\s+.+)?$/);
  if (!match) return rawTarget;

  const href = match[1];
  const suffix = match[2] || '';
  return `${rewriteHrefTarget(href, currentSourceRel, currentTargetRel, sourceMap)}${suffix}`;
}

function rewriteHrefTarget(rawHref, currentSourceRel, currentTargetRel, sourceMap) {
  const href = String(rawHref || '').trim();
  if (!href) return rawHref;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|mailto:)/i.test(href)) {
    return rawHref;
  }

  const { pathPart, suffix } = splitLinkTarget(href);
  const mapped = mapLocalDocHref(pathPart, currentSourceRel, currentTargetRel, sourceMap);
  return mapped ? `${mapped}${suffix}` : rawHref;
}

function mapLocalDocHref(pathPart, currentSourceRel, currentTargetRel, sourceMap) {
  const absolute = String(pathPart || '').startsWith('/');
  const candidates = resolveDocHrefCandidates(pathPart, currentSourceRel);

  for (const candidate of candidates) {
    const targetRel = getMappedTarget(sourceMap, candidate);
    if (!targetRel) continue;

    if (absolute) return `/${targetRel}`;
    const currentDir = normalizeRelPath(path.posix.dirname(currentTargetRel)).replace(/^\.$/, '');
    const relative = normalizeRelPath(path.posix.relative(currentDir || '.', targetRel));
    return relative || path.posix.basename(targetRel);
  }

  return null;
}

function resolveDocHrefCandidates(rawPath, currentSourceRel) {
  const normalized = String(rawPath || '').trim();
  if (!normalized) return [];

  const absolute = normalized.startsWith('/');
  const cleanPath = normalizeRelPath(normalized.replace(/^\/+/, ''));
  const sourceDir = normalizeRelPath(path.posix.dirname(currentSourceRel)).replace(/^\.$/, '');
  const resolvedBase = absolute ? cleanPath : normalizeRelPath(path.posix.join(sourceDir || '', cleanPath));
  const ext = path.extname(resolvedBase).toLowerCase();

  if (DOC_EXTENSIONS.includes(ext)) {
    return [resolvedBase];
  }

  const baseNoSlash = resolvedBase.replace(/\/+$/, '');
  const candidates = [];
  for (const docExt of DOC_EXTENSIONS) {
    candidates.push(`${baseNoSlash}${docExt}`);
  }
  for (const docExt of DOC_EXTENSIONS) {
    candidates.push(normalizeRelPath(path.posix.join(baseNoSlash, `index${docExt}`)));
    candidates.push(normalizeRelPath(path.posix.join(baseNoSlash, `README${docExt}`)));
  }

  return dedupeStrings(candidates);
}

function splitLinkTarget(href) {
  const raw = String(href || '').trim();
  const hashIndex = raw.indexOf('#');
  const queryIndex = raw.indexOf('?');
  let splitIndex = -1;

  if (hashIndex >= 0 && queryIndex >= 0) splitIndex = Math.min(hashIndex, queryIndex);
  else splitIndex = Math.max(hashIndex, queryIndex);

  return {
    pathPart: splitIndex >= 0 ? raw.slice(0, splitIndex) : raw,
    suffix: splitIndex >= 0 ? raw.slice(splitIndex) : '',
  };
}

function parseMdBookSummaryStructure(raw) {
  const lines = String(raw || '').split(/\r?\n/);
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#\s+summary$/i.test(trimmed)) continue;
    if (/^---+$/.test(trimmed)) {
      items.push({ type: 'divider' });
      continue;
    }

    const headingMatch = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      items.push({ type: 'heading', label: headingMatch[1].trim(), level: 0 });
      continue;
    }

    const linkMatch = line.match(/^(\s*)(?:[-*+]\s+)?\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (!linkMatch) {
      items.push({ type: 'heading', label: trimmed, level: 0 });
      continue;
    }

    items.push({
      type: 'page',
      label: linkMatch[2].trim(),
      sourceRel: normalizeMdBookSourceTarget(linkMatch[3]),
      level: getIndentLevel(linkMatch[1] || ''),
    });
  }

  return { items };
}

function buildMkDocsSummary(navItems, sourceMap, warnings, level = 0) {
  const out = [];
  const indent = '  '.repeat(level);

  for (const item of navItems) {
    if (item.path) {
      const target = resolveSummaryTarget(item.path, sourceMap);
      if (!target) {
        warnings.push(`Skipped MkDocs nav item "${item.title || item.path}" because "${item.path}" could not be mapped to a migrated page.`);
        continue;
      }
      const label = item.title || inferLabelFromTarget(target);
      out.push(`${indent}[${label}](${target})`);
      continue;
    }

    if (item.children && item.children.length) {
      if (item.title) out.push(`${indent}${item.title}`);
      out.push(...buildMkDocsSummary(item.children, sourceMap, warnings, level + 1));
    }
  }

  if (level > 0) return out;
  return appendMigrationNotesLink(out);
}

function buildStructuredSummaryFromItems(items, sourceMap, warnings) {
  const out = [];

  for (const item of items) {
    if (item.type === 'divider') {
      out.push('@divider');
      continue;
    }
    if (item.type === 'heading') {
      out.push(String(item.label || '').trim());
      continue;
    }
    if (item.type !== 'page') continue;

    const target = resolveSummaryTarget(item.sourceRel, sourceMap);
    if (!target) {
      warnings.push(`Skipped summary entry "${item.label}" because "${item.sourceRel}" could not be mapped to a migrated page.`);
      continue;
    }

    const indent = '  '.repeat(Math.max(0, Number(item.level || 0)));
    out.push(`${indent}[${item.label}](${target})`);
  }

  return appendMigrationNotesLink(out);
}

function flattenMkDocsNavItems(navItems, level = 0, out = []) {
  for (const item of navItems || []) {
    if (item.path) {
      out.push({
        type: 'page',
        label: item.title || '',
        sourceRel: normalizeMkDocsNavTarget(item.path),
        level,
      });
      continue;
    }

    if (item.children && item.children.length) {
      if (item.title) {
        out.push({ type: 'heading', label: item.title, level });
      }
      flattenMkDocsNavItems(item.children, level + 1, out);
    }
  }

  return out;
}

function assignStructuredTargets(items) {
  const map = new Map();
  const folderStack = [];

  for (const item of items || []) {
    if (!item || item.type !== 'page' || !item.sourceRel) continue;

    const level = Math.max(0, Number(item.level || 0));
    const folderParts = folderStack.slice(0, level).filter(Boolean);
    const fileSegment = structuredTargetSegment(item.sourceRel, item.label, false);
    const targetRel = folderParts.length ? `${folderParts.join('/')}/${fileSegment}.mq` : `${fileSegment}.mq`;

    map.set(normalizeSourceKey(item.sourceRel), targetRel);

    folderStack[level] = structuredTargetSegment(item.sourceRel, item.label, true);
    folderStack.length = level + 1;
  }

  return map;
}

function structuredTargetSegment(sourceRel, label, forFolder) {
  const rel = normalizeRelPath(sourceRel);
  const dir = normalizeRelPath(path.posix.dirname(rel)).replace(/^\.$/, '');
  const base = path.posix.basename(rel, path.extname(rel));

  if (/^(readme|index)$/i.test(base)) {
    if (dir) return safePathSegment(path.posix.basename(dir));
    if (label) return safePathSegment(label);
    return forFolder ? 'home' : 'index';
  }

  return safePathSegment(base);
}

function safePathSegment(value) {
  return String(value || 'page')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

function normalizeMdBookSourceTarget(rawTarget) {
  const href = String(rawTarget || '').trim().replace(/^\.\/+/, '');
  const { pathPart } = splitLinkTarget(href);
  return normalizeRelPath(pathPart);
}

function normalizeMkDocsNavTarget(rawTarget) {
  const href = String(rawTarget || '').trim();
  const { pathPart } = splitLinkTarget(href);
  return normalizeRelPath(pathPart);
}

function getIndentLevel(indentText) {
  let spaces = 0;
  for (const ch of String(indentText || '')) {
    spaces += ch === '\t' ? 2 : 1;
  }
  return Math.floor(spaces / 2);
}

function buildFallbackSummary(pages, warnings) {
  const out = [];
  const rootIndex = pages.find(page => page.targetRel === 'index.mq');
  if (rootIndex) {
    out.push(`[${rootIndex.titleHint || 'Home'}](index.mq)`);
  }

  const grouped = new Map();
  for (const page of pages) {
    if (page.targetRel === 'index.mq') continue;
    const dir = normalizeRelPath(path.posix.dirname(page.targetRel)).replace(/^\.$/, '');
    const groupKey = dir.split('/')[0] || '';
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(page);
  }

  const keys = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));
  for (const key of keys) {
    const pagesInGroup = grouped.get(key) || [];
    if (!pagesInGroup.length) continue;
    if (key) out.push('', toTitle(key));
    for (const page of pagesInGroup.sort((a, b) => sortPageRel(a.targetRel, b.targetRel))) {
      out.push(`[${page.titleHint || inferLabelFromTarget(page.targetRel)}](${page.targetRel})`);
    }
  }

  if (!out.length) {
    warnings.push('No navigation file was found, so navigation.mq was generated from the file tree.');
  }

  return appendMigrationNotesLink(out.filter((line, index, arr) => !(line === '' && (!arr[index - 1] || !arr[index + 1]))));
}

function appendMigrationNotesLink(lines) {
  const out = [...lines];
  if (out.length && out[out.length - 1] !== '') out.push('');
  out.push('Migration');
  out.push('[Migration Notes](migration-notes.mq)');
  return out;
}

function resolveSummaryTarget(rawTarget, sourceMap) {
  const href = String(rawTarget || '').trim();
  if (!href) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) {
    return null;
  }

  const { pathPart } = splitLinkTarget(href);
  const candidates = resolveDocHrefCandidates(pathPart, 'index.md');
  for (const candidate of candidates) {
    const target = getMappedTarget(sourceMap, candidate);
    if (target) return target;
  }

  return null;
}

function parseMdBookConfig(configPath) {
  const warnings = [];
  const notes = [];
  if (!fs.existsSync(configPath)) {
    return { title: '', description: '', warnings, notes };
  }

  const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
  let section = '';
  let title = '';
  let description = '';

  for (const line of lines) {
    const trimmed = stripTomlStyleComment(line).trim();
    if (!trimmed) continue;

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toLowerCase();
      continue;
    }

    const entryMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!entryMatch) continue;

    const key = entryMatch[1].trim().toLowerCase();
    const rawValue = entryMatch[2].trim();
    const value = parseTomlLikeScalar(rawValue);

    if (section === 'book' && key === 'title' && typeof value === 'string') {
      title = value;
    } else if (section === 'book' && key === 'description' && typeof value === 'string') {
      description = value;
    } else if (section === 'output.html' && key === 'additional-css') {
      notes.push('mdBook `output.html.additional-css` was not mapped into a Marque theme automatically.');
    } else if (section === 'output.html' && key === 'additional-js') {
      notes.push('mdBook `output.html.additional-js` was not mapped into the Marque layout runtime automatically.');
    } else if (section.startsWith('preprocessor.')) {
      const name = section.slice('preprocessor.'.length);
      notes.push(`mdBook preprocessor "${name}" needs manual review; preprocessors are not migrated automatically.`);
    }
  }

  return { title, description, warnings, notes };
}

function stripTomlStyleComment(line) {
  let out = '';
  let quote = null;
  let escaped = false;

  for (let i = 0; i < String(line || '').length; i += 1) {
    const ch = line[i];
    if (quote === '"') {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === '\'') {
      out += ch;
      if (ch === '\'') quote = null;
      continue;
    }
    if (ch === '#') break;
    if (ch === '"' || ch === '\'') quote = ch;
    out += ch;
  }

  return out;
}

function parseTomlLikeScalar(rawValue) {
  const text = String(rawValue || '').trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('\'') && text.endsWith('\''))) {
    return text.slice(1, -1);
  }
  if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) {
    const num = Number(text);
    return Number.isFinite(num) ? num : text;
  }
  return text;
}

function parseMkDocsConfig(configPath) {
  const raw = fs.readFileSync(configPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const warnings = [];
  const notes = [];
  const out = {
    siteName: '',
    siteDescription: '',
    docsDir: 'docs',
    navItems: [],
    warnings,
    notes,
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = stripYamlComment(line).trim();
    if (!trimmed) continue;
    if (indentationOf(line) !== 0) continue;

    const match = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) continue;

    const key = match[1];
    const rawValue = match[2].trim();

    if (key === 'site_name') {
      out.siteName = String(parseYamlScalar(rawValue) || '');
      continue;
    }
    if (key === 'site_description') {
      out.siteDescription = String(parseYamlScalar(rawValue) || '');
      continue;
    }
    if (key === 'docs_dir') {
      out.docsDir = String(parseYamlScalar(rawValue) || 'docs');
      continue;
    }
    if (key === 'theme') {
      if (rawValue) {
        const themeValue = parseYamlScalar(rawValue);
        if (themeValue !== UNSUPPORTED_YAML && themeValue) {
          notes.push(`MkDocs theme "${themeValue}" was not mapped into a Marque theme automatically.`);
        }
      } else {
        const block = collectYamlIndentedBlock(lines, i + 1, indentationOf(line));
        const nestedTheme = parseMkDocsThemeBlock(block.lines);
        if (nestedTheme) {
          notes.push(`MkDocs theme "${nestedTheme}" was not mapped into a Marque theme automatically.`);
        }
        i = block.nextIndex - 1;
      }
      continue;
    }
    if (key === 'nav') {
      const block = collectYamlIndentedBlock(lines, i + 1, indentationOf(line));
      out.navItems = parseMkDocsNavBlock(block.lines, warnings);
      i = block.nextIndex - 1;
      continue;
    }
    if (key === 'plugins' || key === 'markdown_extensions' || key === 'extra_css' || key === 'extra_javascript' || key === 'hooks') {
      notes.push(`MkDocs "${key}" needs manual review; it is not migrated automatically.`);
    }
  }

  return out;
}

function parseMkDocsThemeBlock(lines) {
  for (const line of lines) {
    const trimmed = stripYamlComment(line).trim();
    const match = trimmed.match(/^name\s*:\s*(.+)$/);
    if (match) {
      const parsed = parseYamlScalar(match[1]);
      if (parsed !== UNSUPPORTED_YAML && parsed) return String(parsed);
    }
  }
  return '';
}

function parseMkDocsNavBlock(lines, warnings) {
  const filtered = lines.filter(line => stripYamlComment(line).trim());
  const parsed = parseYamlListItems(filtered, 0, warnings);
  return parsed.items;
}

function parseYamlListItems(lines, startIndex, warnings, baseIndent = null) {
  const items = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = stripYamlComment(line).trim();
    if (!trimmed) {
      i += 1;
      continue;
    }

    const indent = indentationOf(line);
    if (baseIndent === null) baseIndent = indent;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      i += 1;
      continue;
    }

    const itemMatch = trimmed.match(/^-\s+(.*)$/);
    if (!itemMatch) break;

    const rest = itemMatch[1].trim();
    if (!rest) {
      warnings.push('Skipped an empty MkDocs nav entry.');
      i += 1;
      continue;
    }

    const titleSplit = splitYamlTitlePair(rest);
    if (!titleSplit) {
      items.push({ title: '', path: rest });
      i += 1;
      continue;
    }

    if (titleSplit.value) {
      items.push({ title: titleSplit.title, path: titleSplit.value });
      i += 1;
      continue;
    }

    const childBlock = collectIndentedYamlList(lines, i + 1, indent);
    if (!childBlock.lines.length) {
      warnings.push(`Skipped MkDocs nav section "${titleSplit.title}" because it had no child entries.`);
      i = childBlock.nextIndex;
      continue;
    }
    const childItems = parseYamlListItems(childBlock.lines, 0, warnings, null).items;
    items.push({ title: titleSplit.title, children: childItems });
    i = childBlock.nextIndex;
  }

  return { items, nextIndex: i };
}

function collectIndentedYamlList(lines, startIndex, parentIndent) {
  const collected = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = stripYamlComment(line).trim();
    if (!trimmed) {
      collected.push(line);
      i += 1;
      continue;
    }

    const indent = indentationOf(line);
    if (indent <= parentIndent) break;
    collected.push(line);
    i += 1;
  }

  return { lines: collected, nextIndex: i };
}

function splitYamlTitlePair(text) {
  let quote = null;
  let escaped = false;

  for (let i = 0; i < String(text || '').length; i += 1) {
    const ch = text[i];
    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        quote = null;
      }
      continue;
    }
    if (quote === '\'') {
      if (ch === '\'') quote = null;
      continue;
    }
    if (ch === '"' || ch === '\'') {
      quote = ch;
      continue;
    }
    if (ch === ':') {
      return {
        title: String(parseYamlScalar(text.slice(0, i).trim()) || ''),
        value: String(parseYamlScalar(text.slice(i + 1).trim()) || ''),
      };
    }
  }

  return null;
}

function buildMigrationNotes({ sourceKind, docsRoot, warnings, extraNotes, pageCount, assetCount }) {
  const lines = [
    '+++',
    'title = Migration Notes',
    'nav = migration-notes',
    '+++',
    '',
    '# Migration Notes',
    '@divider',
    '',
    `This site was migrated into Marque from \`${sourceKind}\`.`,
    '',
    '@callout .info',
    'This page is meant to be temporary. Use it as a review checklist, then delete it once the migration is done.',
    '@end callout',
    '',
    '## What was imported',
    '@divider',
    '',
    `- Source docs root: \`${normalizeRelPath(docsRoot)}\``,
    `- Pages migrated: ${pageCount}`,
    `- Static assets copied: ${assetCount}`,
    '',
    '## Review next',
    '@divider',
    '',
    '- Open `marque.toml` and choose the final Marque layout and theme.',
    '- Check `navigation.mq` to confirm the imported navigation order and labels.',
    '- Review any custom CSS, JS, plugins, or preprocessors from the source project.',
    '- Open a few pages with images and internal links to confirm paths still feel right.',
    '',
  ];

  if (extraNotes && extraNotes.length) {
    lines.push('## Source-specific notes');
    lines.push('@divider');
    lines.push('');
    for (const note of extraNotes) {
      lines.push(`- ${note}`);
    }
    lines.push('');
  }

  lines.push('## Warnings');
  lines.push('@divider');
  lines.push('');

  if (warnings && warnings.length) {
    for (const warning of dedupeStrings(warnings)) {
      lines.push(`- ${warning}`);
    }
  } else {
    lines.push('- No migration warnings were recorded for this import.');
  }

  lines.push('');
  return lines.join('\n');
}

function buildSummaryFile(summaryLines) {
  const body = ['# Navigation', ''];
  body.push(...summaryLines);
  body.push('');
  return body.join('\n');
}

function buildMarqueConfig(project, layout, theme) {
  const lines = [
    `title = ${formatTomlValue(project.title || 'Migrated Site')}`,
    `description = ${formatTomlValue(project.description || 'Migrated into Marque')}`,
    `layout = ${formatTomlValue(layout || 'sidebar')}`,
    `theme = ${formatTomlValue(theme || 'comte')}`,
    'width = full',
    '',
    '# Generated by marque migrate',
  ];

  return lines.join('\n');
}

function buildDefault404Page() {
  return [
    '+++',
    'title = Not Found',
    'nav = 404',
    '+++',
    '',
    '# 404: Page not found',
    '@divider',
    '',
    'The route you opened does not exist in this migrated site yet.',
    '',
    '@callout .warn',
    'Check `navigation.mq` and the imported page paths if this route should exist.',
    '@end callout',
    '',
  ].join('\n');
}

function extractTitleHint(raw, relPath) {
  const extracted = extractLeadingYamlFrontmatter(raw);
  const source = extracted ? extracted.body : raw;
  const headingMatch = String(source || '').match(/^\s*#\s+(.+?)\s*$/m);
  if (headingMatch) return headingMatch[1].trim();
  return inferLabelFromTarget(mapDocPathToMq(relPath));
}

function canUseBareTomlString(value) {
  const text = String(value || '');
  if (!text) return false;
  if (text !== text.trim()) return false;
  if (/[\r\n\t]/.test(text)) return false;
  if (/[#"\\]/.test(text)) return false;
  if (/^(true|false)$/i.test(text)) return false;
  if (/^[+-]?\d+(?:\.\d+)?$/.test(text)) return false;
  return true;
}

function resolveDocBasename(baseName) {
  if (/^(readme|index)$/i.test(baseName)) return 'index';
  return baseName;
}

function mapDocPathToMq(relPath) {
  const normalized = normalizeRelPath(relPath);
  const dir = normalizeRelPath(path.posix.dirname(normalized)).replace(/^\.$/, '');
  const base = path.posix.basename(normalized, path.extname(normalized));
  const mqBase = `${resolveDocBasename(base)}.mq`;
  return dir ? `${dir}/${mqBase}` : mqBase;
}

function normalizeSourceKey(relPath) {
  return normalizeRelPath(relPath).toLowerCase();
}

function getMappedTarget(sourceMap, relPath) {
  return sourceMap.get(normalizeSourceKey(relPath));
}

function inferLabelFromTarget(targetRel) {
  const normalized = normalizeRelPath(targetRel);
  const base = path.posix.basename(normalized, '.mq');
  if (base === 'index') {
    const dir = normalizeRelPath(path.posix.dirname(normalized)).replace(/^\.$/, '');
    if (!dir) return 'Home';
    return toTitle(path.posix.basename(dir));
  }
  return toTitle(base);
}

function sortPageRel(a, b) {
  if (a === 'index.mq') return -1;
  if (b === 'index.mq') return 1;
  return a.localeCompare(b);
}

function indentationOf(line) {
  const match = String(line || '').match(/^[ \t]*/);
  const leading = match ? match[0] : '';
  let spaces = 0;
  for (const ch of leading) {
    spaces += ch === '\t' ? 2 : 1;
  }
  return spaces;
}

function dedupeStrings(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

module.exports = {
  migrateSite,
};
