// builder.js — reads .mq files, applies template, writes dist/
const fs = require('fs');
const path = require('path');
const { parse, extractFrontmatter } = require('./parser');
const { render } = require('./renderer');

function build(siteDir, outDir) {
  const configPath = path.join(siteDir, 'marque.toml');
  const config = loadConfig(configPath);
  const defaultThemeName = config.theme || 'default';
  const defaultLayoutName = normalizeLayoutName(config.layout || 'default');
  const defaultPageWidth = normalizeWidth(config.width);

  // clean + create dist
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // cache theme assets so each theme is loaded and written once per build
  const themeCache = new Map();
  const layoutCache = new Map();

  // keep a legacy alias for templates that still link /theme.css directly
  const defaultAssets = getThemeAssets(defaultThemeName, siteDir, outDir, themeCache);
  fs.writeFileSync(path.join(outDir, 'theme.css'), defaultAssets.css);

  const defaultLayout = getLayoutAssets(defaultLayoutName, siteDir, outDir, layoutCache);
  fs.writeFileSync(path.join(outDir, 'layout.css'), defaultLayout.css);

  // find all .mq files
  const pagesDir = path.join(siteDir, 'pages');
  const pages = findMQ(pagesDir);

  const pageEntries = buildPageEntries(pages, pagesDir, config);
  const nav = buildNav(pageEntries);

  let built = 0;
  for (const page of pageEntries) {
    const { file, fm, body, href: outName } = page;
    const pageThemeName = fm.theme || defaultThemeName;
    const pageLayoutName = normalizeLayoutName(fm.layout || defaultLayoutName);
    const pageTheme = getThemeAssets(pageThemeName, siteDir, outDir, themeCache);
    const pageLayout = getLayoutAssets(pageLayoutName, siteDir, outDir, layoutCache);

    const ast = parse(body);
    const content = render(ast);

    const outFile = path.join(outDir, outName);

    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    const title = fm.title || config.title || 'Marque Site';
    const pageMainStyle = resolveMainStyle(fm, defaultPageWidth);
    let html = applyTemplate(pageTheme.baseTemplate, {
      title,
      content,
      nav: renderNav(nav, outName),
      site_title: config.title || 'Marque',
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

    fs.writeFileSync(outFile, html);
    built++;
    console.log(`  built → ${outName}`);
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

function getThemeAssets(themeName, siteDir, outDir, cache) {
  const key = themeName || 'default';
  if (cache.has(key)) return cache.get(key);

  const themeDir = resolveTheme(key, siteDir);
  const baseTemplate = loadPageTemplate(themeDir);
  const css = fs.readFileSync(path.join(themeDir, 'theme.css'), 'utf8');

  const cssFile = `theme-${safeName(key)}.css`;
  fs.writeFileSync(path.join(outDir, cssFile), css);

  const assets = {
    baseTemplate,
    css,
    href: `/${cssFile}`,
  };
  cache.set(key, assets);
  return assets;
}

function getLayoutAssets(layoutName, siteDir, outDir, cache) {
  const key = normalizeLayoutName(layoutName || 'default');
  if (cache.has(key)) return cache.get(key);

  const css = fs.readFileSync(resolveLayoutCSSPath(key, siteDir), 'utf8');
  const cssFile = `layout-${safeName(key)}.css`;
  fs.writeFileSync(path.join(outDir, cssFile), css);

  const assets = {
    css,
    href: `/${cssFile}`,
  };
  cache.set(key, assets);
  return assets;
}

function resolveLayoutCSSPath(layout, siteDir) {
  const name = normalizeLayoutName(layout || 'default');

  const custom = path.join(siteDir, 'layouts', `${name}.css`);
  if (fs.existsSync(custom)) return custom;

  const builtin = path.join(__dirname, '..', 'layouts', `${name}.css`);
  if (fs.existsSync(builtin)) return builtin;

  throw new Error(`Layout "${name}" not found`);
}

function normalizeLayoutName(layout) {
  const name = String(layout || 'default').trim().toLowerCase();
  if (name === 'crossmediabar') return 'xmb';
  return name || 'default';
}

function loadPageTemplate(themeDir) {
  const themeIndexTemplate = path.join(themeDir, 'index.html');
  if (fs.existsSync(themeIndexTemplate)) {
    return fs.readFileSync(themeIndexTemplate, 'utf8');
  }

  // Backward compatibility for older themes.
  const legacyBaseTemplate = path.join(themeDir, 'base.html');
  if (fs.existsSync(legacyBaseTemplate)) {
    return fs.readFileSync(legacyBaseTemplate, 'utf8');
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

    const dir = path.dirname(rel);
    const sourceBase = path.basename(rel, '.mq');
    const isIndexSource = sourceBase.toLowerCase() === 'index';
    const slugSource = fm.nav || fm.title || sourceBase;
    const fileBase = isIndexSource ? 'index' : (safeName(slugSource) || safeName(sourceBase));
    const href = (dir && dir !== '.') ? path.join(dir, `${fileBase}.html`) : `${fileBase}.html`;

    const label = fm.nav || fm.title || sourceBase;
    const order = parseInt(fm.order || '99', 10);
    return { file, rel, fm, body, href, label, order };
  }).sort((a, b) => a.order - b.order);
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
    const triggerActive = triggerItem.href === current ? ' active' : '';

    return `<div class="${groupClass}"><a class="mq-nav-group-trigger${triggerActive}" href="/${triggerItem.href}">${escapeHtml(triggerItem.label)}</a><div class="mq-nav-submenu">${submenu}</div></div>`;
  }).join('\n');
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
        order: item.order,
        root: null,
        children: [],
      });
    }

    const group = map.get(key);
    group.order = Math.min(group.order, item.order);

    if (parts.length <= 1) {
      group.root = item;
      group.label = item.label || group.label;
    } else {
      group.children.push(item);
    }
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
