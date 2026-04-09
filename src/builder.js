// builder.js — reads .mq files, applies template, writes dist/
const fs = require('fs');
const path = require('path');
const { parse, extractFrontmatter } = require('./parser');
const { render } = require('./renderer');
const { DiagnosticLevel, createDiagnostic, createDiagnosticError } = require('./diagnostics');
const { collectDirectiveDiagnostics } = require('./directive-diagnostics');
const { collectDirectiveStyles } = require('./directives/registry');
const { loadProjectDirectives } = require('./directives/project-loader');
const { printDiagnostic } = require('./utils/errors');
const { parseFlatToml } = require('./utils/toml');

function build(siteDir, outDir, options = {}) {
  const cleanDist = options.cleanDist !== false;
  const softFsErrors = options.softFsErrors === true;
  const logBuiltFiles = options.logBuiltFiles !== false;
  const logStaticCopy = options.logStaticCopy !== false;
  const logSummary = options.logSummary !== false;
  const diagnosticPrintOptions = options.diagnosticPrintOptions || undefined;
  const configPath = path.join(siteDir, 'marque.toml');
  const config = loadConfig(configPath);
  const defaultThemeName = config.theme || 'default';
  const configuredLayoutName = config.layout || 'topnav';
  const defaultLayoutName = normalizeLayoutName(configuredLayoutName);
  const defaultPageWidth = normalizeWidth(config.width);
  const defaultPageAlign = normalizeContentAlign(config.align);
  const siteRepo = normalizeRepoValue(config.repo || config.repository || '');

  // Refresh packaged + project directives on every build.
  loadProjectDirectives(siteDir);

  // clean + create dist
  if (cleanDist) {
    ensureEmptyDir(outDir);
  } else {
    mkdirWithRetry(outDir, { recursive: true });
  }

  // cache theme assets so each theme is loaded and written once per build
  const themeCache = new Map();
  const layoutCache = new Map();
  const commonAssets = getCommonAssets(siteDir, outDir, softFsErrors);

  // keep a legacy alias for templates that still link /theme.css directly
  const defaultAssets = getThemeAssets(defaultThemeName, siteDir, outDir, themeCache, softFsErrors);
  writeFileWithRetry(path.join(outDir, 'theme.css'), defaultAssets.css, softFsErrors);

  let defaultLayout;
  try {
    defaultLayout = getLayoutAssets(defaultLayoutName, siteDir, outDir, layoutCache, softFsErrors);
  } catch (err) {
    if (/^Layout ".+" not found$/.test(err.message)) {
      const line = findConfigKeyLine(configPath, 'layout');
      throw createDiagnosticError(buildMissingLayoutDiagnostic({
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

  const sharedRuntimeScript = loadSharedRuntimeScript(siteDir);
  if (typeof sharedRuntimeScript === 'string' && sharedRuntimeScript.trim()) {
    writeFileWithRetry(path.join(outDir, 'index.js'), sharedRuntimeScript, softFsErrors);
  }

  // find all .mq files
  const pagesDir = path.join(siteDir, 'pages');
  const pages = findMQ(pagesDir);
  const summary = loadSummary(siteDir, pagesDir);

  const pageEntries = buildPageEntries(pages, pagesDir, config, summary);
  const nav = buildNav(pageEntries, summary);
  const pageSequence = buildPageSequence(pageEntries, summary);

  let built = 0;
  const searchEntries = [];
  for (const page of pageEntries) {
    const { file, fm, body, bodyStartLine, href: outName, layoutLine } = page;
    const pageThemeName = fm.theme || defaultThemeName;
    const rawPageLayoutName = fm.layout || defaultLayoutName;
    const pageLayoutName = normalizeLayoutName(rawPageLayoutName);
    const pageTheme = getThemeAssets(pageThemeName, siteDir, outDir, themeCache, softFsErrors);
    let pageLayout;
    try {
      pageLayout = getLayoutAssets(pageLayoutName, siteDir, outDir, layoutCache, softFsErrors);
    } catch (err) {
      if (/^Layout ".+" not found$/.test(err.message)) {
        throw createDiagnosticError(buildMissingLayoutDiagnostic({
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
    const directiveDiagnostics = collectDirectiveDiagnostics(ast, {
      file,
      lineOffset: Math.max(0, (parseInt(bodyStartLine || 1, 10) || 1) - 1),
    });
    const firstDirectiveError = directiveDiagnostics.find(d => d.level === DiagnosticLevel.ERROR);
    if (firstDirectiveError) {
      throw createDiagnosticError(firstDirectiveError);
    }
    for (const warning of directiveDiagnostics.filter(d => d.level === DiagnosticLevel.WARNING || d.level === DiagnosticLevel.NOTE)) {
      printDiagnostic(warning, diagnosticPrintOptions);
    }

    const resolveHref = createPageHrefResolver(pageEntries, page.rel);
    const content = render(ast, { resolveHref });

    const outFile = path.join(outDir, outName);
    const pageTemplate = loadPageTemplate(pageTheme.source, siteDir, pageLayoutName);

    mkdirWithRetry(path.dirname(outFile), { recursive: true });

    const siteTitle = config.title || 'Marque';
    const title = fm.title || config.title || 'Marque Site';
    const documentTitle = title ? `${siteTitle} — ${title}` : siteTitle;
    const searchTitle = String(fm.title || page.label || title || path.basename(page.rel, '.mq')).trim();
    const pageMainStyle = resolveMainStyle(fm, defaultPageWidth, defaultPageAlign);
    const pageSummaryAttr = normalizeBoolean(fm.summary) ? ' data-page-summary="true"' : '';
    let html = applyTemplate(pageTemplate, {
      document_title: documentTitle,
      title,
      content,
      nav: renderNav(nav, outName, pageLayoutName),
      page_nav: renderPageNav(pageSequence, outName),
      site_title: siteTitle,
      description: fm.description || config.description || '',
      common_css: commonAssets.href,
      layout_css: pageLayout.href,
      theme_css: pageTheme.href,
      page_main_style: pageMainStyle,
      page_summary_attr: pageSummaryAttr,
      repo: siteRepo,
      footer_repo_hidden: siteRepo ? '' : ' hidden',
    });

    if (!/\{\{\s*common_css\s*\}\}/.test(pageTemplate)) {
      html = ensureStylesheetLink(html, commonAssets.href, [pageLayout.href, pageTheme.href, '/theme.css']);
    }

    // Backward compatibility for templates that don't have layout_css token.
    if (!/\{\{\s*layout_css\s*\}\}/.test(pageTemplate)) {
      html = ensureStylesheetLink(html, pageLayout.href, [pageTheme.href, '/theme.css']);
    }

    // Backward compatibility for templates that hardcode /theme.css.
    if (!/\{\{\s*theme_css\s*\}\}/.test(pageTemplate)) {
      html = html.replace(/href="\/theme\.css"/g, `href="${pageTheme.href}"`);
    }

    html = rewriteLocalDocumentPaths(html, outName);
    if (isFallback404Page(outName)) {
      html = absolutizeFallbackDocumentPaths(html);
    }
    writeFileWithRetry(outFile, html, softFsErrors);
    searchEntries.push(buildSearchIndexEntry({
      page,
      title: searchTitle,
      description: fm.description || '',
      content,
    }));
    built++;
    if (logBuiltFiles) {
      console.log(`  built → ${outName}`);
    }
  }

  // Keep /index.html (and nested /index.html) as redirect shims when an index.mq
  // page is renamed via frontmatter nav/title slug.
  for (const page of pageEntries) {
    if (!page.redirectFrom || page.redirectFrom === page.href) continue;
    const redirectFile = path.join(outDir, page.redirectFrom);
    mkdirWithRetry(path.dirname(redirectFile), { recursive: true });
    writeFileWithRetry(redirectFile, buildRedirectPage(toRelativeOutputHref(page.redirectFrom, page.href)), softFsErrors);
    if (logBuiltFiles) {
      console.log(`  redirect → ${page.redirectFrom} -> ${page.href}`);
    }
  }

  // copy static assets if they exist
  const staticDir = path.join(siteDir, 'static');
  if (fs.existsSync(staticDir)) {
    copyDir(staticDir, outDir);
    if (logStaticCopy) {
      console.log(`  copied static/`);
    }
  }

  writeFileWithRetry(path.join(outDir, 'search-index.json'), `${JSON.stringify(searchEntries, null, 2)}\n`, softFsErrors);
  if (logBuiltFiles) {
    console.log('  built → search-index.json');
  }

  if (logSummary) {
    console.log(`\nmarque: ${built} page${built !== 1 ? 's' : ''} built → ${path.relative(process.cwd(), outDir)}/`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function loadConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};
  const raw = fs.readFileSync(configPath, 'utf8');
  return parseFlatToml(raw, { allowBareStrings: true });
}

function resolveTheme(theme, siteDir) {
  const name = String(theme || 'default').trim();
  const builtinTemplateThemesDir = path.join(__dirname, '..', 'template', 'themes');
  const legacyBuiltinThemesDir = path.join(__dirname, '..', 'themes');

  const searchRoots = [
    path.join(siteDir, 'themes'),
    builtinTemplateThemesDir,
    legacyBuiltinThemesDir,
  ];

  for (const root of searchRoots) {
    const flatCss = path.join(root, `${name}.css`);
    if (fs.existsSync(flatCss)) return flatCss;

    // Backward compatibility for legacy themes/<name>/theme.css.
    const legacyDir = path.join(root, name);
    if (fs.existsSync(legacyDir)) return legacyDir;
  }

  throw new Error(`Theme "${name}" not found`);
}

function getThemeAssets(themeName, siteDir, outDir, cache, softFsErrors = false) {
  const key = themeName || 'default';
  if (cache.has(key)) return cache.get(key);

  const themeRef = resolveTheme(key, siteDir);
  const css = loadThemeStyle(themeRef, siteDir);

  const cssFile = `theme-${safeName(key)}.css`;
  writeFileWithRetry(path.join(outDir, cssFile), css, softFsErrors);

  const assets = {
    source: themeRef,
    css,
    href: `/${cssFile}`,
  };
  cache.set(key, assets);
  return assets;
}

function getCommonAssets(siteDir, outDir, softFsErrors = false) {
  const css = loadCommonStyle(siteDir);
  const cssFile = 'common.css';
  writeFileWithRetry(path.join(outDir, cssFile), css, softFsErrors);

  return {
    css,
    href: `/${cssFile}`,
  };
}

function loadThemeStyle(themeDir, siteDir) {
  let themeCss;

  if (fs.existsSync(themeDir) && fs.statSync(themeDir).isDirectory()) {
    const cssPath = path.join(themeDir, 'theme.css');
    if (fs.existsSync(cssPath)) {
      themeCss = fs.readFileSync(cssPath, 'utf8');
    }
  } else if (/\.css$/i.test(themeDir)) {
    themeCss = fs.readFileSync(themeDir, 'utf8');
  }

  if (typeof themeCss !== 'string') {
    throw new Error(`Theme style not found in ${themeDir}. Expected <name>.css.`);
  }

  return themeCss;
}

function resolveCommonCSSPath(siteDir) {
  const candidates = [
    path.join(siteDir, 'common.css'),
    path.join(siteDir, 'styles', 'common.css'),
    path.join(__dirname, '..', 'template', 'common.css'),
  ];

  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function loadCommonStyle(siteDir) {
  const stylePath = resolveCommonCSSPath(siteDir);
  const commonCss = stylePath ? fs.readFileSync(stylePath, 'utf8') : '';
  const directiveCss = buildDirectiveStylesCSS(siteDir);
  const parts = [String(commonCss || '').trim(), String(directiveCss || '').trim()].filter(Boolean);

  if (!parts.length) return '';
  return `${parts.join('\n\n')}\n`;
}

function buildDirectiveStylesCSS(siteDir) {
  const styleDefs = collectDirectiveStyles();
  if (!styleDefs.length) return '';

  const out = [];
  for (const def of styleDefs) {
    const css = String(def.css || '').trim();
    if (!css) continue;
    out.push(`/* directive-style: @${def.name} */`);
    out.push(css);
    out.push(`/* end directive-style: @${def.name} */`);
  }

  return out.join('\n');
}

function buildSearchIndexEntry({ page, title, description, content }) {
  return {
    title: String(title || path.basename(page && page.rel ? page.rel : 'page', '.mq')).trim(),
    href: hrefToSitePath(page && page.href),
    description: normalizeSearchText(decodeHtmlEntities(description)),
    headings: extractSearchHeadings(content),
    text: extractSearchText(content),
  };
}

function extractSearchHeadings(html) {
  const headings = [];
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;

  while ((match = pattern.exec(String(html || '')))) {
    const text = normalizeSearchText(decodeHtmlEntities(stripHtmlTags(match[2])));
    if (text) headings.push(text);
  }

  return headings;
}

function extractSearchText(html) {
  const blockSeparated = String(html || '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|aside|header|footer|li|ul|ol|blockquote|pre|h[1-6]|table|tr|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return normalizeSearchText(decodeHtmlEntities(blockSeparated));
}

function stripHtmlTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function normalizeSearchText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const num = parseInt(code, 16);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'');
}

function getLayoutAssets(layoutName, siteDir, outDir, cache, softFsErrors = false) {
  const key = normalizeLayoutName(layoutName || 'topnav');
  if (cache.has(key)) return cache.get(key);

  const css = loadLayoutStyle(key, siteDir);
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
  const builtinTemplateLayoutsDir = path.join(__dirname, '..', 'template', 'layouts');
  const legacyBuiltinLayoutsDir = path.join(__dirname, '..', 'layouts');

  const custom = path.join(siteDir, 'layouts', `${name}.css`);
  if (fs.existsSync(custom)) return custom;

  const builtin = path.join(builtinTemplateLayoutsDir, `${name}.css`);
  if (fs.existsSync(builtin)) return builtin;

  const legacyBuiltin = path.join(legacyBuiltinLayoutsDir, `${name}.css`);
  if (fs.existsSync(legacyBuiltin)) return legacyBuiltin;

  throw new Error(`Layout "${name}" not found`);
}

function loadLayoutStyle(layout, siteDir) {
  const stylePath = resolveLayoutCSSPath(layout, siteDir);
  return fs.readFileSync(stylePath, 'utf8');
}

function normalizeLayoutName(layout) {
  const name = String(layout || 'topnav').trim().toLowerCase();
  if (name === 'default' || name === 'crossmediabar' || name === 'xmb') return 'topnav';
  return name || 'topnav';
}

function loadPageTemplate(themeRef, siteDir, layoutName) {
  if (fs.existsSync(themeRef) && fs.statSync(themeRef).isDirectory()) {
    const themeIndexTemplate = path.join(themeRef, 'index.html');
    if (fs.existsSync(themeIndexTemplate)) {
      return fs.readFileSync(themeIndexTemplate, 'utf8');
    }

    // Backward compatibility for older themes.
    const legacyBaseTemplate = path.join(themeRef, 'base.html');
    if (fs.existsSync(legacyBaseTemplate)) {
      return fs.readFileSync(legacyBaseTemplate, 'utf8');
    }
  }

  const layout = normalizeLayoutName(layoutName || 'topnav');
  const candidates = [
    path.join(siteDir, 'layouts', `${layout}.html`),
    path.join(__dirname, '..', 'template', 'layouts', `${layout}.html`),
    path.join(__dirname, '..', 'layouts', `${layout}.html`),
    path.join(siteDir, 'layouts', 'index.html'),
    path.join(__dirname, '..', 'template', 'layouts', 'index.html'),
    path.join(__dirname, '..', 'layouts', 'index.html'),
    path.join(siteDir, 'themes', 'index.html'),
    path.join(__dirname, '..', 'template', 'themes', 'index.html'),
    path.join(__dirname, '..', 'themes', 'index.html'),
  ];

  const templatePath = candidates.find(p => fs.existsSync(p));
  if (templatePath) {
    return fs.readFileSync(templatePath, 'utf8');
  }

  throw new Error('No template found. Add layouts/index.html (preferred) or a theme-level index.html/base.html.');
}

function loadSharedRuntimeScript(siteDir) {
  const candidates = [
    path.join(siteDir, 'layouts', 'index.js'),
    path.join(__dirname, '..', 'template', 'layouts', 'index.js'),
    path.join(__dirname, '..', 'layouts', 'index.js'),
    path.join(siteDir, 'themes', 'index.js'),
    path.join(__dirname, '..', 'template', 'themes', 'index.js'),
    path.join(__dirname, '..', 'themes', 'index.js'),
  ];

  const scriptPath = candidates.find(p => fs.existsSync(p));
  if (!scriptPath) return '';
  return fs.readFileSync(scriptPath, 'utf8');
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

function buildPageEntries(pages, pagesDir, config, summary) {
  const summaryMap = (summary && summary.map) || new Map();
  const homeKey = summary && summary.firstPageKey ? String(summary.firstPageKey).toLowerCase() : null;

  return pages.map(file => {
    const rel = path.relative(pagesDir, file);
    const normalizedRel = normalizeRelPath(rel).toLowerCase();
    const src = fs.readFileSync(file, 'utf8');
    const { fm, body, bodyStartLine } = extractFrontmatter(src);
    const layoutLine = findFrontmatterKeyLine(src, 'layout');

    const dir = path.dirname(rel);
    const webDir = (dir && dir !== '.') ? dir.split(path.sep).join('/') : '';
    const sourceBase = path.basename(rel, '.mq');
    const isIndexSource = sourceBase.toLowerCase() === 'index';
    const slugSource = fm.nav || fm.title || sourceBase;
    const fileBase = safeName(slugSource) || safeName(sourceBase);
    const isSummaryHome = !!homeKey && normalizedRel === homeKey;

    let href = webDir ? `${webDir}/${fileBase}.html` : `${fileBase}.html`;
    let redirectFrom = null;

    if (isIndexSource && !isSummaryHome) {
      const indexHref = webDir ? `${webDir}/index.html` : 'index.html';
      if (fileBase !== 'index') {
        redirectFrom = indexHref;
      } else {
        href = indexHref;
      }
    }

    if (isSummaryHome) {
      if (href !== 'index.html') {
        redirectFrom = href;
      }
      href = 'index.html';
    } else if (homeKey && !webDir && isIndexSource && href === 'index.html') {
      href = 'index-page.html';
    }

    const summaryMeta = summaryMap.get(normalizedRel);
    const label = (summaryMeta && summaryMeta.label) || fm.title || fm.nav || sourceBase;
    const order = summaryMeta ? summaryMeta.order : Number.POSITIVE_INFINITY;
    return { file, rel, fm, body, bodyStartLine, href, redirectFrom, label, order, layoutLine };
  }).sort((a, b) => {
    const aFinite = Number.isFinite(a.order);
    const bFinite = Number.isFinite(b.order);

    if (aFinite && bFinite) return a.order - b.order;
    if (aFinite) return -1;
    if (bFinite) return 1;

    return a.href.localeCompare(b.href);
  });
}

function loadSummary(siteDir, pagesDir) {
  const summaryCandidates = [
    path.join(siteDir, 'navigation.mq'),
    path.join(pagesDir, 'navigation.mq'),
    path.join(siteDir, 'summary.mq'),
    path.join(pagesDir, 'summary.mq'),
  ];

  const summaryPath = summaryCandidates.find(p => fs.existsSync(p));
  if (!summaryPath) {
    return { path: null, map: new Map() };
  }

  const raw = fs.readFileSync(summaryPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const map = new Map();
  const items = [];
  const isMqSummary = /\.mq$/i.test(summaryPath);
  let order = 0;
  let firstPageKey = null;

  for (const line of lines) {
    const rawLine = String(line || '');
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    if (/^@divider\b/i.test(trimmed)) {
      items.push({ type: 'divider' });
      continue;
    }

    // Allow title lines in navigation docs, especially in navigation.mq.
    if (/^#{1,6}\s+/.test(trimmed)) continue;

    const fullLink = trimmed.match(/^(?:[-*+]\s+)?\[([^\]]+)\]\(([^)]+)\)\s*$/);
    if (fullLink) {
      const label = String(fullLink[1] || '').trim();
      const href = String(fullLink[2] || '').trim();
      const rel = normalizeSummaryTarget(href);
      if (!rel) continue;

      const key = rel.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          order: order++,
          label: label || path.basename(rel, '.mq'),
        });
      }

      items.push({
        type: 'page',
        key,
        label: label || path.basename(rel, '.mq'),
        order: map.get(key).order,
      });
      if (!firstPageKey) firstPageKey = key;
      continue;
    }

    if (isMqSummary) {
      items.push({ type: 'heading', label: trimmed });
    }
  }

  applySummaryPathHierarchy(items);
  return { path: summaryPath, map, items, firstPageKey };
}

function normalizeSummaryTarget(href) {
  const raw = String(href || '').trim();
  if (!raw) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//') || raw.startsWith('#')) {
    return null;
  }

  const hashIndex = raw.indexOf('#');
  const queryIndex = raw.indexOf('?');
  let splitIndex = -1;
  if (hashIndex >= 0 && queryIndex >= 0) splitIndex = Math.min(hashIndex, queryIndex);
  else splitIndex = Math.max(hashIndex, queryIndex);

  let pathPart = splitIndex >= 0 ? raw.slice(0, splitIndex) : raw;
  const absolute = pathPart.startsWith('/');
  pathPart = pathPart.replace(/^\/+/, '');
  pathPart = pathPart.replace(/^pages\//i, '');

  if (/\.html$/i.test(pathPart)) {
    pathPart = pathPart.replace(/\.html$/i, '.mq');
  }

  if (!/\.mq$/i.test(pathPart)) return null;

  if (absolute) {
    pathPart = pathPart.replace(/^\/+/, '');
  }

  return normalizeRelPath(pathPart);
}

function applySummaryPathHierarchy(items) {
  const pages = items.filter(item => item.type === 'page');
  const pageByPath = new Map();
  const levelCache = new Map();
  const parentCache = new Map();

  for (const item of pages) {
    const pathKey = summaryPathKey(item.key);
    if (!pathKey) continue;
    item.pathKey = pathKey;
    if (!pageByPath.has(pathKey)) {
      pageByPath.set(pathKey, item);
    }
  }

  function findParentPath(pathKey) {
    let current = path.posix.dirname(summaryPathKey(pathKey));
    while (current && current !== '.' && current !== pathKey) {
      const candidate = current.toLowerCase();
      if (pageByPath.has(candidate)) return candidate;
      current = path.posix.dirname(current);
    }
    return '';
  }

  function resolveLevel(pathKey) {
    const normalizedPath = summaryPathKey(pathKey);
    if (!normalizedPath) return 0;
    if (levelCache.has(normalizedPath)) return levelCache.get(normalizedPath);

    const parentPath = findParentPath(normalizedPath);
    parentCache.set(normalizedPath, parentPath);
    const level = parentPath ? resolveLevel(parentPath) + 1 : 0;
    levelCache.set(normalizedPath, level);
    return level;
  }

  for (const item of pages) {
    const pathKey = item.pathKey || summaryPathKey(item.key);
    item.pathKey = pathKey;
    item.parentPathKey = pathKey ? (parentCache.get(pathKey) || findParentPath(pathKey)) : '';
    item.level = pathKey ? resolveLevel(pathKey) : 0;
    item.navKey = pathKey || '';
  }
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

function splitHrefTarget(href) {
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

function toRelativeOutputHref(currentPageHref, targetHref) {
  const { pathPart, suffix } = splitHrefTarget(targetHref);
  let targetPath = String(pathPart || '').trim();

  if (!targetPath || targetPath === '/') {
    targetPath = 'index.html';
  } else {
    targetPath = targetPath.replace(/^\/+/, '');
  }

  if (/\.mq$/i.test(targetPath)) {
    targetPath = targetPath.replace(/\.mq$/i, '.html');
  }

  targetPath = normalizeRelPath(path.posix.normalize(targetPath));

  const currentPage = normalizeRelPath(currentPageHref || 'index.html');
  const currentDir = normalizeRelPath(path.posix.dirname(currentPage)).replace(/^\.$/, '');

  if (targetPath === 'index.html') {
    const up = normalizeRelPath(path.posix.relative(currentDir || '.', '.')).replace(/^\.$/, '');
    const baseHref = up ? `${up}/` : './';
    return `${baseHref}${suffix || ''}`;
  }

  const relativeTarget = path.posix.relative(currentDir || '.', targetPath);
  const href = normalizeRelPath(relativeTarget || path.posix.basename(targetPath));

  return `${href || path.posix.basename(targetPath)}${suffix}`;
}

function rewriteLocalDocumentPaths(html, currentPageHref) {
  return String(html || '').replace(
    /(\b(?:href|src)=["'])([^"']+)(["'])/gi,
    (_, head, rawHref, tail) => {
      const href = String(rawHref || '').trim();
      if (!href.startsWith('/') || href.startsWith('//')) {
        return `${head}${rawHref}${tail}`;
      }

      return `${head}${toRelativeOutputHref(currentPageHref, href)}${tail}`;
    },
  );
}

function isFallback404Page(href) {
  return normalizeRelPath(String(href || '')).toLowerCase() === '404.html';
}

function absolutizeFallbackDocumentPaths(html) {
  return String(html || '').replace(
    /(\b(?:href|src)=["'])([^"']*)(["'])/gi,
    (_, head, rawHref, tail) => `${head}${toAbsoluteFallbackHref(rawHref)}${tail}`,
  );
}

function toAbsoluteFallbackHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href) return rawHref;
  if (href.startsWith('/') || href.startsWith('//') || href.startsWith('#')) return href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return href;

  const hashIndex = href.indexOf('#');
  const queryIndex = href.indexOf('?');
  let splitIndex = -1;
  if (hashIndex >= 0 && queryIndex >= 0) splitIndex = Math.min(hashIndex, queryIndex);
  else splitIndex = Math.max(hashIndex, queryIndex);

  const pathPart = splitIndex >= 0 ? href.slice(0, splitIndex) : href;
  const suffix = splitIndex >= 0 ? href.slice(splitIndex) : '';
  if (!pathPart || pathPart === '.') return `/${suffix}`;

  const absolutePath = path.posix.normalize(`/${pathPart.replace(/^\.\/+/, '')}`);
  return `${absolutePath}${suffix}`;
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
  const lines = String(src || '').split(/\r?\n/);
  if (!lines.length) return null;

  const fence = getFrontmatterFence(lines[0]);
  if (!fence) return null;
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*${fence === '+++' ? '=' : ':'}`, 'i');

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === fence) break;
    if (keyPattern.test(line)) return i + 1;
  }
  return null;
}

function getFrontmatterFence(firstLine) {
  const line = String(firstLine || '').trim();
  if (line === '+++') return '+++';
  if (line === '---') return '---';
  return null;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMissingLayoutDiagnostic({ layoutName, sourceFile, line, value, siteDir }) {
  const lineText = readLine(sourceFile, line) || '';
  const col = findValueColumn(lineText, value);
  const safeValue = String(value || '').trim() || String(layoutName || '').trim();
  const lineNo = Math.max(1, parseInt(line || 1, 10));
  const endCol = col + Math.max(1, safeValue.length) - 1;

  const availableLayouts = listAvailableLayouts(siteDir);
  const suggestion = findClosestName(safeValue, availableLayouts);

  const suggestions = [
    { message: `available layouts: ${availableLayouts.join(', ') || '(none found)'}` },
  ];
  if (suggestion) {
    suggestions.push({
      message: `did you mean "${suggestion}"?`,
      replacement: `layout = ${suggestion}`,
    });
  }

  return createDiagnostic({
    level: DiagnosticLevel.ERROR,
    code: 'MQ001',
    message: `layout "${layoutName}" not found`,
    spans: [{
      file: sourceFile,
      start_line: lineNo,
      start_col: col,
      end_line: lineNo,
      end_col: endCol,
    }],
    suggestions,
  });
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
    path.join(__dirname, '..', 'template', 'layouts'),
    path.join(__dirname, '..', 'layouts'),
    path.join(siteDir, 'layouts'),
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.css')) continue;
      names.add(path.basename(file, path.extname(file)).toLowerCase());
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

function buildNav(pageEntries, summary) {
  if (summary && Array.isArray(summary.items) && summary.items.length) {
    return buildNavFromSummary(pageEntries, summary);
  }

  return pageEntries.map(page => ({
    type: 'link',
    href: page.href,
    label: page.label,
    order: page.order,
  }));
}

function buildNavFromSummary(pageEntries, summary) {
  const nav = [];
  const pageByRel = new Map();

  for (const page of pageEntries) {
    const rel = normalizeRelPath(page.rel).toLowerCase();
    pageByRel.set(rel, page);
  }

  for (const item of summary.items) {
    if (item.type === 'divider') {
      nav.push({ type: 'divider' });
      continue;
    }

    if (item.type === 'heading') {
      nav.push({ type: 'heading', label: item.label, level: item.level || 0 });
      continue;
    }

    if (item.type === 'page') {
      const level = Math.max(0, Number(item.level || 0));
      const navKey = String(item.navKey || item.pathKey || summaryPathKey(item.key)).trim().toLowerCase();
      const page = pageByRel.get(item.key);
      if (page) {
        nav.push({
          type: 'link',
          href: page.href,
          label: item.label || page.label,
          order: Number.isFinite(item.order) ? item.order : page.order,
          level,
          navKey,
          pathKey: summaryPathKey(item.key),
        });
      } else {
        nav.push({
          type: 'link',
          href: item.key.replace(/\.mq$/i, '.html'),
          label: item.label || path.basename(item.key, '.mq'),
          order: Number.isFinite(item.order) ? item.order : Number.POSITIVE_INFINITY,
          level,
          navKey,
          pathKey: summaryPathKey(item.key),
          virtual: true,
        });
      }
    }
  }

  return nav;
}

function renderNav(nav, current, layoutName = 'topnav') {
  if (normalizeLayoutName(layoutName) === 'sidebar') {
    return renderSidebarNav(nav, current);
  }

  const hasStructuredSummary = nav.some(item => (
    item.type === 'divider'
    || item.type === 'heading'
    || (item.type === 'link' && Number(item.level || 0) > 0)
  ));

  if (hasStructuredSummary) {
    return renderStructuredSummaryNav(nav, current, { showHeadings: false });
  }

  const groups = buildNavGroups(nav);

  return groups.map(group => {
    if (group.root && !group.children.length) {
      const active = group.root.href === current ? ' class="active"' : '';
      return `<a href="${hrefToSitePath(group.root.href)}"${active}>${escapeHtml(group.root.label)}</a>`;
    }

    if (!group.root && group.children.length === 1) {
      const loneChild = group.children[0];
      const active = loneChild && loneChild.href === current ? ' class="active"' : '';
      return `<a href="${hrefToSitePath(loneChild.href)}"${active}>${escapeHtml(loneChild.label)}</a>`;
    }

    const triggerItem = group.root;
    const submenuItems = group.root ? group.children : group.children;

    if (triggerItem && !submenuItems.length) {
      const active = triggerItem && triggerItem.href === current ? ' class="active"' : '';
      return `<a href="${hrefToSitePath(triggerItem.href)}"${active}>${escapeHtml(triggerItem.label)}</a>`;
    }

    const submenu = submenuItems
      .sort((a, b) => a.order - b.order)
      .map(item => {
        const active = item.href === current ? ' class="active"' : '';
        return `<a href="${hrefToSitePath(item.href)}"${active}>${escapeHtml(item.label)}</a>`;
      })
      .join('');

    const hasActiveItem = (triggerItem && triggerItem.href === current) || submenuItems.some(item => item.href === current);
    const groupClass = hasActiveItem ? 'mq-nav-group active' : 'mq-nav-group';
    const triggerActive = hasActiveItem ? ' active' : '';

    if (!triggerItem) {
      return `<div class="${groupClass}"><span class="mq-nav-group-trigger mq-nav-group-trigger-label${triggerActive}">${escapeHtml(group.label)}</span><div class="mq-nav-submenu">${submenu}</div></div>`;
    }

    return `<div class="${groupClass}"><a class="mq-nav-group-trigger mq-nav-group-trigger-link${triggerActive}" href="${hrefToSitePath(triggerItem.href)}">${escapeHtml(triggerItem.label)}</a><div class="mq-nav-submenu">${submenu}</div></div>`;
  }).join('\n');
}

function renderSidebarNav(nav, current) {
  const out = [];
  let linkBuffer = [];
  const topCounter = { value: 0 };

  const flushLinks = () => {
    if (!linkBuffer.length) return;
    const trees = buildSummaryLinkTrees(linkBuffer);
    out.push(renderSidebarLinkTrees(trees, current, topCounter));
    linkBuffer = [];
  };

  for (const item of nav) {
    if (item.type === 'link') {
      linkBuffer.push(item);
      continue;
    }

    flushLinks();

    if (item.type === 'divider') {
      out.push('<div class="mq-nav-divider" role="separator" aria-hidden="true"></div>');
      continue;
    }

    if (item.type === 'heading') {
      out.push(`<div class="mq-nav-heading">${escapeHtml(item.label)}</div>`);
    }
  }

  flushLinks();
  return out.join('\n');
}

function buildSummaryLinkTrees(links) {
  if (links.some(link => Number(link.level || 0) > 0 || link.navKey)) {
    return buildLevelSummaryLinkTrees(links);
  }

  return buildPrefixSummaryLinkTrees(links);
}

function buildLevelSummaryLinkTrees(links) {
  const roots = [];
  const stack = [];

  for (const link of links) {
    const node = { item: link, prefix: navGroupPrefix(link), children: [] };
    const level = Math.max(0, Number(link.level || 0));
    const parent = findSummaryTreeParent(stack, level, link);

    stack.length = Math.max(0, level);

    if (level > 0 && parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }

    stack[level] = node;
    stack.length = level + 1;
  }

  return roots;
}

function findSummaryTreeParent(stack, level, link) {
  if (level <= 0) return null;

  const maxIndex = Math.min(level - 1, stack.length - 1);
  let fallback = null;

  for (let i = maxIndex; i >= 0; i--) {
    const candidate = stack[i];
    if (!candidate) continue;
    if (!fallback) fallback = candidate;
    if (isSummaryPathAncestor(candidate.item, link)) {
      return candidate;
    }
  }

  return fallback;
}

function isSummaryPathAncestor(parentItem, childItem) {
  const parentPath = summaryPathKey(parentItem && parentItem.pathKey);
  const childPath = summaryPathKey(childItem && childItem.pathKey);
  if (!parentPath || !childPath || parentPath === childPath) return false;
  return childPath.startsWith(`${parentPath}/`);
}

function summaryPathKey(value) {
  const rel = normalizeRelPath(String(value || '')).replace(/\.mq$/i, '').replace(/^\.$/, '');
  return rel.toLowerCase();
}

function buildPrefixSummaryLinkTrees(links) {
  const roots = [];
  const stack = [];

  for (const link of links) {
    const prefix = navGroupPrefix(link);
    const node = { item: link, prefix, children: [] };

    while (stack.length) {
      const parent = stack[stack.length - 1];
      const isChild = !!prefix && !!parent.prefix && prefix.startsWith(`${parent.prefix}/`);
      if (isChild) break;
      stack.pop();
    }

    if (stack.length) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }

    stack.push(node);
  }

  return roots;
}

function renderSidebarLinkTrees(nodes, current, topCounter, depth = 0, parentNumber = '') {
  const parts = [];
  const maxDepth = 2;

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const item = node.item;
    const isTop = depth === 0;
    const number = isTop ? `${++topCounter.value}` : `${parentNumber}.${i + 1}`;
    const isActive = item.href === current;
    const activeClass = isActive ? ' active' : '';
    const numberText = isTop ? `${number}.` : number;
    const numSpan = `<span class="mq-nav-num">${escapeHtml(numberText)}</span>`;

    const hasChildren = Array.isArray(node.children) && node.children.length > 0 && depth < maxDepth;
    if (!hasChildren) {
      parts.push(`<a class="mq-nav-link mq-nav-level-${depth} mq-nav-numbered-link${activeClass}" style="--mq-nav-level:${depth};" href="${hrefToSitePath(item.href)}">${numSpan}${escapeHtml(item.label)}</a>`);
      continue;
    }

    const childHtml = renderSidebarLinkTrees(node.children, current, topCounter, depth + 1, number);
    const childActive = node.children.some(child => isSidebarNodeActive(child, current));
    const groupActive = (isActive || childActive) ? ' active' : '';
    parts.push(`<div class="mq-nav-group mq-nav-summary-group${groupActive}"><a class="mq-nav-group-trigger mq-nav-group-trigger-link mq-nav-level-${depth} mq-nav-numbered-link${activeClass}" style="--mq-nav-level:${depth};" href="${hrefToSitePath(item.href)}">${numSpan}${escapeHtml(item.label)}</a><div class="mq-nav-submenu">${childHtml}</div></div>`);
  }

  return parts.join('');
}

function isSidebarNodeActive(node, current) {
  if (!node || !node.item) return false;
  if (node.item.href === current) return true;
  if (!Array.isArray(node.children) || !node.children.length) return false;
  return node.children.some(child => isSidebarNodeActive(child, current));
}

function renderStructuredSummaryNav(nav, current, options = {}) {
  const showHeadings = options.showHeadings !== false;
  const out = [];
  let linkBuffer = [];

  const flushLinks = () => {
    if (!linkBuffer.length) return;
    out.push(renderSummaryLinkSegment(linkBuffer, current));
    linkBuffer = [];
  };

  for (const item of nav) {
    if (item.type === 'link') {
      linkBuffer.push(item);
      continue;
    }

    flushLinks();

    if (item.type === 'divider') {
      out.push('<div class="mq-nav-divider" role="separator" aria-hidden="true"></div>');
      continue;
    }

    if (item.type === 'heading') {
      if (showHeadings) {
        out.push(`<div class="mq-nav-heading">${escapeHtml(item.label)}</div>`);
      }
    }
  }

  flushLinks();
  return out.join('\n');
}

function renderSummaryLinkSegment(links, current) {
  const trees = buildSummaryLinkTrees(links);
  return trees.map(node => {
    if (!node.children.length) {
      return renderNavLink(node.item, current);
    }

    const hasActive = isSidebarNodeActive(node, current);
    const groupClass = hasActive ? 'mq-nav-group mq-nav-summary-group active' : 'mq-nav-group mq-nav-summary-group';
    const triggerClass = hasActive ? 'mq-nav-group-trigger mq-nav-group-trigger-link active' : 'mq-nav-group-trigger mq-nav-group-trigger-link';
    const submenu = renderTopnavDropdownTree(node.children, current);
    return `<div class="${groupClass}"><a class="${triggerClass}" href="${hrefToSitePath(node.item.href)}">${escapeHtml(node.item.label)}</a><div class="mq-nav-submenu">${submenu}</div></div>`;
  }).join('\n');
}

function renderTopnavDropdownTree(nodes, current, numberPrefix = []) {
  const maxDepth = 2;

  return nodes.map((node, idx) => {
    const item = node.item;
    const numbering = [...numberPrefix, idx + 1];
    const depth = Math.max(0, Math.min(maxDepth, numberPrefix.length));
    const numberText = depth === 0 ? `${numbering.join('.')}.` : numbering.join('.');
    const classes = [`mq-nav-link`, `mq-nav-level-${depth}`, `mq-nav-numbered-link`];
    if (item.href === current) classes.push('active');

    const linkHtml = `<a class="${classes.join(' ')}" style="--mq-nav-level:${depth};" href="${hrefToSitePath(item.href)}"><span class="mq-nav-num">${escapeHtml(numberText)}</span>${escapeHtml(item.label)}</a>`;
    if (!node.children.length || depth >= maxDepth) {
      return linkHtml;
    }

    return `${linkHtml}${renderTopnavDropdownTree(node.children, current, numbering)}`;
  }).join('');
}

function hrefPrefix(href) {
  return String(href || '').replace(/\.html$/i, '').replace(/^\/+/, '').trim().toLowerCase();
}

function hrefToSitePath(href) {
  const normalized = String(href || '').trim();
  if (!normalized || normalized === 'index.html') return '/';
  return `/${normalized.replace(/^\/+/, '')}`;
}

function navGroupPrefix(item) {
  return String((item && item.navKey) || (item && item.pathKey) || hrefPrefix(item && item.href)).trim().toLowerCase();
}

function renderNavLink(item, current) {
  const level = Math.max(0, Math.min(6, Number(item.level || 0)));
  const classes = [`mq-nav-link`, `mq-nav-level-${level}`];
  if (item.href === current) classes.push('active');
  return `<a class="${classes.join(' ')}" style="--mq-nav-level:${level};" href="${hrefToSitePath(item.href)}">${escapeHtml(item.label)}</a>`;
}

function buildPageSequence(pageEntries, summary) {
  const sequence = [];
  const seen = new Set();

  const pushItem = (item) => {
    if (!item || !item.href || seen.has(item.href)) return;
    seen.add(item.href);
    sequence.push({ href: item.href, label: item.label || item.href });
  };

  if (summary && Array.isArray(summary.items) && summary.items.length) {
    const pageByRel = new Map();
    for (const page of pageEntries) {
      pageByRel.set(normalizeRelPath(page.rel).toLowerCase(), page);
    }

    for (const item of summary.items) {
      if (item.type !== 'page') continue;
      pushItem(pageByRel.get(item.key));
    }
    return sequence;
  }

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
    ? `<a class="mq-page-nav-link mq-page-nav-prev" href="${hrefToSitePath(prev.href)}" aria-label="Previous page: ${escapeHtml(prev.label)}"><span class="mq-page-nav-kicker">Previous</span><span class="mq-page-nav-title">↩ ${escapeHtml(prev.label)}</span></a>`
    : '<span class="mq-page-nav-spacer" aria-hidden="true"></span>';

  const nextHtml = next
    ? `<a class="mq-page-nav-link mq-page-nav-next" href="${hrefToSitePath(next.href)}" aria-label="Next page: ${escapeHtml(next.label)}"><span class="mq-page-nav-kicker">Next</span><span class="mq-page-nav-title">${escapeHtml(next.label)} ↪</span></a>`
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

function ensureStylesheetLink(html, href, anchors = []) {
  if (!href || String(html || '').includes(`href="${href}"`)) return html;

  for (const anchor of anchors) {
    if (!anchor) continue;
    const pattern = new RegExp(`(<link rel="stylesheet" href="${escapeRegex(anchor)}">)`);
    if (pattern.test(html)) {
      return html.replace(pattern, `<link rel="stylesheet" href="${href}">\n$1`);
    }
  }

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `<link rel="stylesheet" href="${href}">\n</head>`);
  }

  return `<link rel="stylesheet" href="${href}">\n${html}`;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function resolveMainStyle(fm, defaultPageWidth, defaultPageAlign) {
  const pageWidth = normalizeWidth(fm.width);
  const width = pageWidth || defaultPageWidth;
  const align = normalizeContentAlign(fm.align) || defaultPageAlign;
  const declarations = [];

  if (width) {
    declarations.push(`--page-width: ${width}`);
    declarations.push(`--page-max-w: none`);
  }

  if (align === 'left') {
    declarations.push(`--page-margin-left: 0`);
    declarations.push(`--page-margin-right: auto`);
  } else if (align === 'right') {
    declarations.push(`--page-margin-left: auto`);
    declarations.push(`--page-margin-right: 0`);
  } else if (align === 'center') {
    declarations.push(`--page-margin-left: auto`);
    declarations.push(`--page-margin-right: auto`);
  }

  if (!declarations.length) return '';
  return ` style="${declarations.join('; ')};"`;
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

function normalizeContentAlign(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'left' || raw === 'center' || raw === 'right') return raw;
  return null;
}

function normalizeRepoValue(value) {
  return String(value || '').trim();
}

function normalizeBoolean(value) {
  if (value === true || value === false) return value;
  if (value === undefined || value === null) return false;

  const raw = String(value).trim().toLowerCase();
  if (raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on') return true;
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return false;
}

module.exports = { build };
