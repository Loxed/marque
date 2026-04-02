// builder.js — reads .mq files, applies template, writes dist/
const fs = require('fs');
const path = require('path');
const { parse, extractFrontmatter } = require('./parser');
const { render } = require('./renderer');

function build(siteDir, outDir, options = {}) {
  const cleanDist = options.cleanDist !== false;
  const softFsErrors = options.softFsErrors === true;
  const configPath = path.join(siteDir, 'marque.toml');
  const config = loadConfig(configPath);
  const defaultThemeName = config.theme || 'default';
  const configuredLayoutName = config.layout || 'topnav';
  const defaultLayoutName = normalizeLayoutName(configuredLayoutName);
  const defaultPageWidth = normalizeWidth(config.width);

  // clean + create dist
  if (cleanDist) {
    ensureEmptyDir(outDir);
  } else {
    mkdirWithRetry(outDir, { recursive: true });
  }

  // cache theme assets so each theme is loaded and written once per build
  const themeCache = new Map();
  const layoutCache = new Map();

  // keep a legacy alias for templates that still link /theme.css directly
  const defaultAssets = getThemeAssets(defaultThemeName, siteDir, outDir, themeCache, softFsErrors);
  writeFileWithRetry(path.join(outDir, 'theme.css'), defaultAssets.css, softFsErrors);

  let defaultLayout;
  try {
    defaultLayout = getLayoutAssets(defaultLayoutName, siteDir, outDir, layoutCache, softFsErrors);
  } catch (err) {
    if (/^Layout ".+" not found$/.test(err.message)) {
      const line = findConfigKeyLine(configPath, 'layout');
      throw new Error(buildMissingLayoutDiagnostic({
        layoutName: defaultLayoutName,
        sourceFile: configPath,
        line: line || 1,
        value: configuredLayoutName,
        siteDir,
      }));
    }
    throw err;
  }
  writeFileWithRetry(path.join(outDir, 'layout.css'), defaultLayout.css, softFsErrors);

  // find all .mq files
  const pagesDir = path.join(siteDir, 'pages');
  const pages = findMQ(pagesDir);

  const pageEntries = buildPageEntries(pages, pagesDir, config);
  const nav = buildNav(pageEntries);
  const pageSequence = buildPageSequence(pageEntries);

  let built = 0;
  for (const page of pageEntries) {
    const { file, fm, body, href: outName, layoutLine } = page;
    const pageThemeName = fm.theme || defaultThemeName;
    const rawPageLayoutName = fm.layout || defaultLayoutName;
    const pageLayoutName = normalizeLayoutName(rawPageLayoutName);
    const pageTheme = getThemeAssets(pageThemeName, siteDir, outDir, themeCache, softFsErrors);
    let pageLayout;
    try {
      pageLayout = getLayoutAssets(pageLayoutName, siteDir, outDir, layoutCache, softFsErrors);
    } catch (err) {
      if (/^Layout ".+" not found$/.test(err.message)) {
        throw new Error(buildMissingLayoutDiagnostic({
          layoutName: pageLayoutName,
          sourceFile: file,
          line: layoutLine || 1,
          value: rawPageLayoutName,
          siteDir,
        }));
      }
      throw err;
    }

    const ast = parse(body);
    const resolveHref = createPageHrefResolver(pageEntries, page.rel);
    const content = render(ast, { resolveHref });

    const outFile = path.join(outDir, outName);

    mkdirWithRetry(path.dirname(outFile), { recursive: true });

    const siteTitle = config.title || 'Marque';
    const title = fm.title || config.title || 'Marque Site';
    const documentTitle = title ? `${siteTitle} — ${title}` : siteTitle;
    const pageMainStyle = resolveMainStyle(fm, defaultPageWidth);
    let html = applyTemplate(pageTheme.baseTemplate, {
      document_title: documentTitle,
      title,
      content,
      nav: renderNav(nav, outName),
      page_nav: renderPageNav(pageSequence, outName),
      site_title: siteTitle,
      description: fm.description || config.description || '',
      layout_css: pageLayout.href,
      theme_css: pageTheme.href,
      page_main_style: pageMainStyle,
    });

    // Backward compatibility for templates that don't have layout_css token.
    if (!/\{\{\s*layout_css\s*\}\}/.test(pageTheme.baseTemplate)) {
      html = html.replace(/<link rel="stylesheet" href="([^"]*theme[^"]*)">/, `<link rel="stylesheet" href="${pageLayout.href}">\n<link rel="stylesheet" href="$1">`);
    }

    // Backward compatibility for templates that hardcode /theme.css.
    if (!/\{\{\s*theme_css\s*\}\}/.test(pageTheme.baseTemplate)) {
      html = html.replace(/href="\/theme\.css"/g, `href="${pageTheme.href}"`);
    }

    writeFileWithRetry(outFile, html, softFsErrors);
    built++;
    console.log(`  built → ${outName}`);
  }

  // Keep /index.html (and nested /index.html) as redirect shims when an index.mq
  // page is renamed via frontmatter nav/title slug.
  for (const page of pageEntries) {
    if (!page.redirectFrom || page.redirectFrom === page.href) continue;
    const redirectFile = path.join(outDir, page.redirectFrom);
    mkdirWithRetry(path.dirname(redirectFile), { recursive: true });
    writeFileWithRetry(redirectFile, buildRedirectPage(`/${page.href}`), softFsErrors);
    console.log(`  redirect → ${page.redirectFrom} -> ${page.href}`);
  }

  // copy static assets if they exist
  const staticDir = path.join(siteDir, 'static');
  if (fs.existsSync(staticDir)) {
    copyDir(staticDir, outDir);
    console.log(`  copied static/`);
  }

  console.log(`\nmarque: ${built} page${built !== 1 ? 's' : ''} built → ${path.relative(process.cwd(), outDir)}/`);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+)\s*=\s*"?([^"]+)"?$/);
    if (m) config[m[1].trim()] = m[2].trim();
  }
  return config;
}

function resolveTheme(theme, siteDir) {
  if (!theme) {
    // default theme bundled with marque
    return path.join(__dirname, '..', 'themes', 'default');
  }
  // custom theme path relative to site
  const custom = path.join(siteDir, 'themes', theme);
  if (fs.existsSync(custom)) return custom;
  // fallback to built-in
  const builtin = path.join(__dirname, '..', 'themes', theme);
  if (fs.existsSync(builtin)) return builtin;
  throw new Error(`Theme "${theme}" not found`);
}

function getThemeAssets(themeName, siteDir, outDir, cache, softFsErrors = false) {
  const key = themeName || 'default';
  if (cache.has(key)) return cache.get(key);

  const themeDir = resolveTheme(key, siteDir);
  const baseTemplate = loadPageTemplate(themeDir, siteDir);
  const css = fs.readFileSync(path.join(themeDir, 'theme.css'), 'utf8');

  const cssFile = `theme-${safeName(key)}.css`;
  writeFileWithRetry(path.join(outDir, cssFile), css, softFsErrors);

  const assets = {
    baseTemplate,
    css,
    href: `/${cssFile}`,
  };
  cache.set(key, assets);
  return assets;
}

function getLayoutAssets(layoutName, siteDir, outDir, cache, softFsErrors = false) {
  const key = normalizeLayoutName(layoutName || 'topnav');
  if (cache.has(key)) return cache.get(key);

  const css = fs.readFileSync(resolveLayoutCSSPath(key, siteDir), 'utf8');
  const cssFile = `layout-${safeName(key)}.css`;
  writeFileWithRetry(path.join(outDir, cssFile), css, softFsErrors);

  const assets = {
    css,
    href: `/${cssFile}`,
  };
  cache.set(key, assets);
  return assets;
}

function resolveLayoutCSSPath(layout, siteDir) {
  const name = normalizeLayoutName(layout || 'topnav');

  const custom = path.join(siteDir, 'layouts', `${name}.css`);
  if (fs.existsSync(custom)) return custom;

  const builtin = path.join(__dirname, '..', 'layouts', `${name}.css`);
  if (fs.existsSync(builtin)) return builtin;

  throw new Error(`Layout "${name}" not found`);
}

function normalizeLayoutName(layout) {
  const name = String(layout || 'topnav').trim().toLowerCase();
  if (name === 'default' || name === 'crossmediabar' || name === 'xmb') return 'topnav';
  return name || 'topnav';
}

function loadPageTemplate(themeDir, siteDir) {
  const themeIndexTemplate = path.join(themeDir, 'index.html');
  if (fs.existsSync(themeIndexTemplate)) {
    return fs.readFileSync(themeIndexTemplate, 'utf8');
  }

  // Backward compatibility for older themes.
  const legacyBaseTemplate = path.join(themeDir, 'base.html');
  if (fs.existsSync(legacyBaseTemplate)) {
    return fs.readFileSync(legacyBaseTemplate, 'utf8');
  }

  // Project-level shared template override.
  const projectSharedTemplate = path.join(siteDir, 'themes', 'index.html');
  if (fs.existsSync(projectSharedTemplate)) {
    return fs.readFileSync(projectSharedTemplate, 'utf8');
  }

  // Shared default template used when themes only provide CSS.
  const sharedTemplate = path.join(__dirname, '..', 'themes', 'index.html');
  if (fs.existsSync(sharedTemplate)) {
    return fs.readFileSync(sharedTemplate, 'utf8');
  }

  throw new Error('No template found. Add themes/index.html or a theme-level index.html/base.html.');
}

function safeName(name) {
  return String(name || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'default';
}

function findMQ(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findMQ(full));
    else if (entry.name.endsWith('.mq')) results.push(full);
  }
  return results;
}

function buildPageEntries(pages, pagesDir, config) {
  return pages.map(file => {
    const rel = path.relative(pagesDir, file);
    const src = fs.readFileSync(file, 'utf8');
    const { fm, body } = extractFrontmatter(src);
    const layoutLine = findFrontmatterKeyLine(src, 'layout');

    const dir = path.dirname(rel);
    const webDir = (dir && dir !== '.') ? dir.split(path.sep).join('/') : '';
    const sourceBase = path.basename(rel, '.mq');
    const isIndexSource = sourceBase.toLowerCase() === 'index';
    const slugSource = fm.nav || fm.title || sourceBase;
    const fileBase = safeName(slugSource) || safeName(sourceBase);

    let href = webDir ? `${webDir}/${fileBase}.html` : `${fileBase}.html`;
    let redirectFrom = null;

    if (isIndexSource) {
      const indexHref = webDir ? `${webDir}/index.html` : 'index.html';
      if (fileBase !== 'index') {
        redirectFrom = indexHref;
      } else {
        href = indexHref;
      }
    }

    const label = fm.title || fm.nav || sourceBase;
    const order = parseInt(fm.order || '99', 10);
    return { file, rel, fm, body, href, redirectFrom, label, order, layoutLine };
  }).sort((a, b) => a.order - b.order);
}

function createPageHrefResolver(pageEntries, currentRel) {
  const routeMap = new Map();
  for (const page of pageEntries) {
    const rel = normalizeRelPath(page.rel);
    routeMap.set(rel.toLowerCase(), `/${page.href}`);
  }

  const current = normalizeRelPath(currentRel || '');
  const currentDir = path.posix.dirname(current);

  return (rawHref) => {
    const href = String(rawHref || '').trim();
    if (!href) return href;
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')) {
      return href;
    }

    const hashIndex = href.indexOf('#');
    const queryIndex = href.indexOf('?');
    let splitIndex = -1;
    if (hashIndex >= 0 && queryIndex >= 0) splitIndex = Math.min(hashIndex, queryIndex);
    else splitIndex = Math.max(hashIndex, queryIndex);

    const pathPart = splitIndex >= 0 ? href.slice(0, splitIndex) : href;
    const suffix = splitIndex >= 0 ? href.slice(splitIndex) : '';

    if (!/\.mq$/i.test(pathPart)) return href;

    const absolute = pathPart.startsWith('/');
    const normalizedInput = normalizeRelPath(pathPart.replace(/^\/+/, ''));
    const relCandidate = absolute
      ? normalizedInput
      : normalizeRelPath(path.posix.join(currentDir === '.' ? '' : currentDir, pathPart));

    const mapped = routeMap.get(relCandidate.toLowerCase());
    if (mapped) return `${mapped}${suffix}`;

    // Fallback: keep original shape, replace extension only.
    return `${pathPart.slice(0, -3)}.html${suffix}`;
  };
}

function normalizeRelPath(value) {
  return String(value || '')
    .split(path.sep).join('/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function findConfigKeyLine(configPath, key) {
  if (!fs.existsSync(configPath)) return null;
  const lines = fs.readFileSync(configPath, 'utf8').split(/\r?\n/);
  const re = new RegExp(`^\\s*${key}\\s*=`,'i');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return null;
}

function findFrontmatterKeyLine(src, key) {
  if (!src.startsWith('---')) return null;
  const lines = src.split(/\r?\n/);
  if (lines[0].trim() !== '---') return null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '---') break;
    if (new RegExp(`^${key}\\s*:`,'i').test(line)) return i + 1;
  }
  return null;
}

function buildMissingLayoutDiagnostic({ layoutName, sourceFile, line, value, siteDir }) {
  const lineText = readLine(sourceFile, line) || '';
  const col = findValueColumn(lineText, value);
  const safeValue = String(value || '').trim() || String(layoutName || '').trim();
  const caretLen = Math.max(1, safeValue.length);
  const lineNo = Math.max(1, parseInt(line || 1, 10));
  const gutter = String(lineNo).length;

  const availableLayouts = listAvailableLayouts(siteDir);
  const suggestion = findClosestName(safeValue, availableLayouts);

  const lines = [
    `error[MQ001]: layout "${layoutName}" not found`,
    ` --> ${sourceFile}:${lineNo}:${col}`,
    '  |',
    `${String(lineNo).padStart(gutter, ' ')} | ${lineText}`,
    `${' '.repeat(gutter)} | ${' '.repeat(Math.max(0, col - 1))}${'^'.repeat(caretLen)} unknown layout`,
    '  |',
    `  = help: available layouts: ${availableLayouts.join(', ') || '(none found)'}`,
  ];

  if (suggestion) {
    lines.push(`  = help: did you mean "${suggestion}"?`);
  }

  return lines.join('\n');
}

function readLine(filePath, lineNumber) {
  if (!fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const idx = Math.max(0, (parseInt(lineNumber || 1, 10) || 1) - 1);
  return lines[idx] || '';
}

function findValueColumn(lineText, value) {
  const text = String(lineText || '');
  const needle = String(value || '').trim();
  if (!text) return 1;

  if (needle) {
    const direct = text.indexOf(needle);
    if (direct >= 0) return direct + 1;

    const unquoted = needle.replace(/^['\"]|['\"]$/g, '');
    const alt = text.indexOf(unquoted);
    if (alt >= 0) return alt + 1;
  }

  const eq = text.indexOf('=');
  const colon = text.indexOf(':');
  const sep = [eq, colon].filter(i => i >= 0).sort((a, b) => a - b)[0];
  if (sep >= 0) {
    let i = sep + 1;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === '"' || text[i] === "'") i++;
    return i + 1;
  }

  return 1;
}

function listAvailableLayouts(siteDir) {
  const names = new Set();
  const dirs = [
    path.join(__dirname, '..', 'layouts'),
    path.join(siteDir, 'layouts'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.css')) continue;
      names.add(path.basename(file, '.css').toLowerCase());
    }
  }

  return Array.from(names).sort();
}

function findClosestName(input, candidates) {
  const target = String(input || '').trim().toLowerCase();
  if (!target || !candidates.length) return null;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = levenshteinDistance(target, candidate.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  const threshold = Math.max(2, Math.floor(target.length / 3));
  return bestDistance <= threshold ? best : null;
}

function levenshteinDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function buildRedirectPage(targetHref) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${targetHref}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Redirecting...</title>
<link rel="canonical" href="${targetHref}">
</head>
<body>
<p>Redirecting to <a href="${targetHref}">${targetHref}</a>...</p>
<script>location.replace(${JSON.stringify(targetHref)});</script>
</body>
</html>`;
}

function buildNav(pageEntries) {
  return pageEntries.map(page => ({
    href: page.href,
    label: page.label,
    order: page.order,
  }));
}

function renderNav(nav, current) {
  const groups = buildNavGroups(nav);

  return groups.map(group => {
    if (!group.children.length) {
      const active = group.root && group.root.href === current ? ' class="active"' : '';
      return `<a href="/${group.root.href}"${active}>${escapeHtml(group.root.label)}</a>`;
    }

    const triggerItem = group.root || group.children[0];
    const submenuItems = group.root ? group.children : group.children.slice(1);

    if (!submenuItems.length) {
      const active = triggerItem && triggerItem.href === current ? ' class="active"' : '';
      return `<a href="/${triggerItem.href}"${active}>${escapeHtml(triggerItem.label)}</a>`;
    }

    const submenu = submenuItems
      .sort((a, b) => a.order - b.order)
      .map(item => {
        const active = item.href === current ? ' class="active"' : '';
        return `<a href="/${item.href}"${active}>${escapeHtml(item.label)}</a>`;
      })
      .join('');

    const hasActiveItem = triggerItem.href === current || submenuItems.some(item => item.href === current);
    const groupClass = hasActiveItem ? 'mq-nav-group active' : 'mq-nav-group';
    const triggerActive = hasActiveItem ? ' active' : '';

    return `<div class="${groupClass}"><a class="mq-nav-group-trigger${triggerActive}" href="/${triggerItem.href}">${escapeHtml(triggerItem.label)}</a><div class="mq-nav-submenu">${submenu}</div></div>`;
  }).join('\n');
}

function buildPageSequence(pageEntries) {
  const sequence = [];
  const seen = new Set();

  const pushItem = (item) => {
    if (!item || !item.href || seen.has(item.href)) return;
    seen.add(item.href);
    sequence.push({ href: item.href, label: item.label || item.href });
  };

  for (const page of pageEntries) {
    pushItem(page);
  }

  return sequence;
}

function renderPageNav(sequence, currentHref) {
  const index = sequence.findIndex(item => item.href === currentHref);
  if (index === -1) return '';

  const prev = index > 0 ? sequence[index - 1] : null;
  const next = index < sequence.length - 1 ? sequence[index + 1] : null;
  if (!prev && !next) return '';

  const prevHtml = prev
    ? `<a class="mq-page-nav-link mq-page-nav-prev" href="/${prev.href}" aria-label="Previous page: ${escapeHtml(prev.label)}"><span class="mq-page-nav-kicker">Previous</span><span class="mq-page-nav-title">↩ ${escapeHtml(prev.label)}</span></a>`
    : '<span class="mq-page-nav-spacer" aria-hidden="true"></span>';

  const nextHtml = next
    ? `<a class="mq-page-nav-link mq-page-nav-next" href="/${next.href}" aria-label="Next page: ${escapeHtml(next.label)}"><span class="mq-page-nav-kicker">Next</span><span class="mq-page-nav-title">${escapeHtml(next.label)} ↪</span></a>`
    : '<span class="mq-page-nav-spacer" aria-hidden="true"></span>';

  return `<nav class="mq-page-nav" aria-label="Page navigation">${prevHtml}${nextHtml}</nav>`;
}

function buildNavGroups(nav) {
  const map = new Map();

  for (const item of nav) {
    const noExt = item.href.replace(/\.html$/, '');
    const parts = noExt.split('/').filter(Boolean);
    const key = parts[0] || noExt;

    if (!map.has(key)) {
      map.set(key, {
        key,
        label: toTitleCase(key),
        order: Number.POSITIVE_INFINITY,
        fallbackOrder: Number.POSITIVE_INFINITY,
        root: null,
        children: [],
      });
    }

    const group = map.get(key);
    group.fallbackOrder = Math.min(group.fallbackOrder, item.order);

    if (parts.length <= 1) {
      group.root = item;
      group.label = item.label || group.label;
      group.order = item.order;
    } else {
      group.children.push(item);
    }
  }

  // A group's position in top-level nav is driven by its root page order.
  // Only groups without a root page fall back to child order.
  for (const group of map.values()) {
    if (!Number.isFinite(group.order)) {
      group.order = group.fallbackOrder;
    }
    delete group.fallbackOrder;
  }

  return Array.from(map.values()).sort((a, b) => a.order - b.order);
}

function toTitleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyTemplate(template, vars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => vars[key] || '');
}

function copyDir(src, dest) {
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function ensureEmptyDir(dirPath) {
  mkdirWithRetry(dirPath, { recursive: true });
  const entries = fs.readdirSync(dirPath);
  for (const name of entries) {
    const removed = removePathWithRetry(path.join(dirPath, name));
    if (!removed) {
      // Best effort on Windows: keep serving even if some files are temporarily locked.
      console.warn(`  warn → could not remove ${name} from dist (file lock), continuing`);
    }
  }
}

function removePathWithRetry(targetPath) {
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return true;
    } catch (err) {
      const isTransient = err && ['ENOTEMPTY', 'EPERM', 'EBUSY'].includes(err.code);
      if (!isTransient || attempt === maxAttempts) return false;
      // Briefly back off to let Windows release file/directory handles.
      const waitUntil = Date.now() + attempt * 20;
      while (Date.now() < waitUntil) {
        // busy wait (small and deterministic, avoids async refactor)
      }
    }
  }

  return false;
}

function mkdirWithRetry(dirPath, options) {
  const maxAttempts = 12;
  const parentDir = path.dirname(dirPath);
  const baseName = path.basename(dirPath);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      fs.mkdirSync(dirPath, options);
      return;
    } catch (err) {
      // Another process may have created the directory while we retried.
      try {
        if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) return;
      } catch (_) {
        // keep retrying below
      }

      // Windows can occasionally deny mkdir on an existing directory.
      // If parent is readable and the entry is already present, treat as success.
      try {
        if (fs.existsSync(parentDir)) {
          const names = fs.readdirSync(parentDir);
          if (names.includes(baseName)) return;
        }
      } catch (_) {
        // keep retrying below
      }

      const isTransient = err && ['EPERM', 'EBUSY', 'EACCES', 'ENOENT'].includes(err.code);
      if (!isTransient || attempt === maxAttempts) throw err;

      const waitUntil = Date.now() + Math.min(800, attempt * 60);
      while (Date.now() < waitUntil) {
        // busy wait (small and deterministic, avoids async refactor)
      }
    }
  }
}

function writeFileWithRetry(filePath, content, softFsErrors = false) {
  const maxAttempts = 12;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      mkdirWithRetry(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
      return;
    } catch (err) {
      const isTransient = err && ['EPERM', 'EBUSY', 'EACCES'].includes(err.code);
      if (!isTransient || attempt === maxAttempts) {
        if (isTransient && softFsErrors) {
          console.warn(`  warn → could not write ${path.basename(filePath)} (file lock), keeping previous file`);
          return false;
        }
        throw err;
      }

      const waitUntil = Date.now() + Math.min(900, attempt * 70);
      while (Date.now() < waitUntil) {
        // busy wait (small and deterministic, avoids async refactor)
      }
    }
  }

  return true;
}

function resolveMainStyle(fm, defaultPageWidth) {
  const pageWidth = normalizeWidth(fm.width);
  const width = pageWidth || defaultPageWidth;
  if (!width) return '';
  return ` style="--page-width: ${width}; --page-max-w: none;"`;
}

function normalizeWidth(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;

  const named = {
    narrow: '70%',
    normal: '82%',
    wide: '92%',
    full: '100%',
  };
  if (named[raw]) return named[raw];

  // Bare numbers are interpreted as percentages (e.g. 86 -> 86%).
  if (/^\d+(?:\.\d+)?$/.test(raw)) return `${raw}%`;

  if (/^\d+(?:\.\d+)?%$/.test(raw)) {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0 && n <= 100) return raw;
  }

  return null;
}

module.exports = { build };
