// builder.js — reads .mq files, applies template, writes dist/
const fs = require('fs');
const path = require('path');
const { parse, extractFrontmatter } = require('./parser');
const { render } = require('./renderer');

function build(siteDir, outDir) {
  const configPath = path.join(siteDir, 'marque.toml');
  const config = loadConfig(configPath);

  // resolve theme
  const themeDir = resolveTheme(config.theme, siteDir);
  const baseTemplate = fs.readFileSync(path.join(themeDir, 'base.html'), 'utf8');
  const themeCSS = fs.readFileSync(path.join(themeDir, 'theme.css'), 'utf8');

  // clean + create dist
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  // write theme css
  fs.writeFileSync(path.join(outDir, 'theme.css'), themeCSS);

  // find all .mq files
  const pagesDir = path.join(siteDir, 'pages');
  const pages = findMQ(pagesDir);

  const nav = buildNav(pages, pagesDir, config);

  let built = 0;
  for (const file of pages) {
    const src = fs.readFileSync(file, 'utf8');
    const { fm, body } = extractFrontmatter(src);
    const ast = parse(body);
    const content = render(ast);

    const rel = path.relative(pagesDir, file);
    const outName = rel.replace(/\.mq$/, '.html');
    const outFile = path.join(outDir, outName);

    fs.mkdirSync(path.dirname(outFile), { recursive: true });

    const title = fm.title || config.title || 'Marque Site';
    const html = applyTemplate(baseTemplate, {
      title,
      content,
      nav: renderNav(nav, outName),
      site_title: config.title || 'Marque',
      description: fm.description || config.description || '',
    });

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

function buildNav(pages, pagesDir, config) {
  return pages.map(file => {
    const rel = path.relative(pagesDir, file);
    const href = rel.replace(/\.mq$/, '.html');
    // read first frontmatter title for nav label
    const src = fs.readFileSync(file, 'utf8');
    const { fm } = extractFrontmatter(src);
    const label = fm.nav || fm.title || path.basename(href, '.html');
    const order = parseInt(fm.order || '99', 10);
    return { href, label, order };
  }).sort((a, b) => a.order - b.order);
}

function renderNav(nav, current) {
  return nav.map(({ href, label }) => {
    const active = href === current ? ' class="active"' : '';
    return `<a href="/${href}"${active}>${label}</a>`;
  }).join('\n');
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

module.exports = { build };
