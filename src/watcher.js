// watcher.js — dev server + live reload
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const chokidar = require('chokidar');
const { build } = require('./builder');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const RELOAD_SNIPPET = `
<script>
(function() {
  const ws = new WebSocket('ws://localhost:__PORT__');
  ws.onmessage = (e) => { if (e.data === 'reload') location.reload(); };
  ws.onclose = () => setTimeout(() => location.reload(), 1000);
})();
</script>`;

const CREATE_FROM_404_SNIPPET = `
<script>
(function() {
  const route = '__REQUEST_PATH__';
  const btn = document.getElementById('mq-create-missing-page');
  const status = document.getElementById('mq-create-missing-status');
  const hint = document.getElementById('mq-create-missing-hint');
  if (!btn) return;

  function setStatus(text, ok) {
    if (!status) return;
    status.textContent = text;
    status.style.color = ok ? 'var(--success, #1f7a1f)' : 'var(--text-muted, #666)';
  }

  if (hint) {
    hint.textContent = route;
  }

  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    btn.disabled = true;
    setStatus('Creating page...', false);
    try {
      const res = await fetch('/__marque/create-page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestPath: route }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error((data && data.error) || 'Could not create page');
      }
      setStatus('Created ' + data.file + '. Reloading...', true);
      setTimeout(() => location.reload(), 350);
    } catch (err) {
      setStatus((err && err.message) || 'Failed to create page', false);
      btn.disabled = false;
    }
  });
})();
</script>`;

function serve(siteDir, outDir, port = 3000) {
  const releaseServeLock = acquireServeLock(siteDir, port);

  const wsPort = port + 1;
  const isMntPath = /^\/mnt\/[a-z]\//i.test(siteDir);
  const forcePolling = process.env.MARQUE_WATCH_POLLING === '1';
  const usePolling = forcePolling || isMntPath;
  const pagesDir = path.resolve(siteDir, 'pages');
  const themesDir = path.resolve(siteDir, 'themes');
  const layoutsDir = path.resolve(siteDir, 'layouts');
  const configFile = path.resolve(siteDir, 'marque.toml');
  const summaryFile = path.resolve(siteDir, 'summary.mq');
  const pagesSummaryFile = path.resolve(pagesDir, 'summary.mq');
  const outDirAbs = path.resolve(outDir);
  const normalizePathForCompare = (p) => {
    const resolved = path.resolve(String(p || ''));
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  const summaryFileNorm = normalizePathForCompare(summaryFile);
  const pagesSummaryFileNorm = normalizePathForCompare(pagesSummaryFile);
  const configFileNorm = normalizePathForCompare(configFile);
  const outDirAbsNorm = normalizePathForCompare(outDirAbs);

  const watchTargets = [
    siteDir,
    path.join(siteDir, '**', '*'),
    configFile,
  ];

  const watchOptions = {
    ignoreInitial: true,
    usePolling,
    interval: usePolling ? 250 : 100,
    binaryInterval: usePolling ? 400 : 300,
    awaitWriteFinish: {
      stabilityThreshold: 140,
      pollInterval: 60,
    },
  };

  // initial build
  try {
    build(siteDir, outDir, { cleanDist: true, softFsErrors: true });
  } catch (e) {
    printBuildError(e);
  }

  // websocket server for live reload
  const wss = new WebSocketServer({ port: wsPort });
  const broadcast = () => {
    wss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send('reload');
    });
  };

  // http server
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url && req.url.split('?')[0] === '/__marque/create-page') {
      let body = '';
      req.on('data', chunk => {
        body += chunk;
        if (body.length > 51200) req.destroy();
      });
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          const requestPath = String(parsed.requestPath || '/').trim();
          const target = resolveMissingPageTarget(requestPath, pagesDir);
          if (!target) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'Invalid target path' }));
            return;
          }

          if (!fs.existsSync(target.absPath)) {
            fs.mkdirSync(path.dirname(target.absPath), { recursive: true });
            fs.writeFileSync(target.absPath, buildStarterPage(target.relPath));
          }

          build(siteDir, outDir, { cleanDist: false, softFsErrors: true });
          broadcast();

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, file: target.relPath.replace(/\\/g, '/') }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err || 'Create failed') }));
        }
      });
      return;
    }

    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    if (!path.extname(urlPath)) urlPath += '.html';

    const filePath = path.join(outDir, urlPath);

    if (!fs.existsSync(filePath)) {
      const fallback404 = path.join(outDir, '404.html');
      if (fs.existsSync(fallback404)) {
        let content = fs.readFileSync(fallback404, 'utf8').toString();
        const reload = RELOAD_SNIPPET.replace('__PORT__', wsPort);
        const createSnippet = CREATE_FROM_404_SNIPPET.replace('__REQUEST_PATH__', escapeForJs(urlPath));
        content = injectBeforeBodyEnd(content, `${reload}${createSnippet}`);
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(content);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404</h1><p>Create pages by adding .mq files under pages/.</p>');
      return;
    }

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    let content = fs.readFileSync(filePath);

    if (ext === '.html') {
      const snippet = RELOAD_SNIPPET.replace('__PORT__', wsPort);
      content = injectBeforeBodyEnd(content.toString(), snippet);
    }

    res.writeHead(200, { 'Content-Type': mime });
    res.end(content);
  });

  server.listen(port, () => {
    console.log(`\nmarque dev server → http://localhost:${port}`);
    console.log(`watching ${siteDir}/\n`);
    if (usePolling) {
      console.log('watch mode: polling enabled (recommended on WSL /mnt paths)\n');
    }
  });

  const cleanup = () => {
    try { releaseServeLock(); } catch (_) {}
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });

  // file watcher
  chokidar
    .watch(watchTargets, watchOptions)
    .on('all', (event, file) => {
      const absFile = path.resolve(file || '');
      const absFileNorm = normalizePathForCompare(absFile);
      const relToPages = path.relative(pagesDir, absFile);
      const inPages = !!relToPages && !relToPages.startsWith('..') && !path.isAbsolute(relToPages);
      const relToThemes = path.relative(themesDir, absFile);
      const inThemes = !!relToThemes && !relToThemes.startsWith('..') && !path.isAbsolute(relToThemes);
      const relToLayouts = path.relative(layoutsDir, absFile);
      const inLayouts = !!relToLayouts && !relToLayouts.startsWith('..') && !path.isAbsolute(relToLayouts);

      // Ignore output tree changes to prevent rebuild loops.
      if (absFileNorm === outDirAbsNorm || absFileNorm.startsWith(`${outDirAbsNorm}${path.sep}`)) return;

      const ext = path.extname(absFile).toLowerCase();
      const isMqFileEvent = ['add', 'change', 'unlink'].includes(event) && ext === '.mq';
      const isPagesDirEvent = ['addDir', 'unlinkDir'].includes(event);
      const isThemeEvent = inThemes && ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event);
      const isLayoutEvent = inLayouts && ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event);
      const isTomlChangeEvent = event === 'change' && absFileNorm === configFileNorm;
      const isSummaryFileEvent = ['add', 'change', 'unlink'].includes(event)
        && (absFileNorm === summaryFileNorm || absFileNorm === pagesSummaryFileNorm);
      if (!((inPages && (isMqFileEvent || isPagesDirEvent)) || isThemeEvent || isLayoutEvent || isTomlChangeEvent || isSummaryFileEvent)) return;

      if (inPages && event === 'unlink' && ext === '.mq') {
        removeGeneratedHtmlForDeletedMq(absFile, pagesDir, outDir);
      }

      const rel = path.relative(siteDir, file);
      console.log(`  ${event} → ${rel}`);
      try {
        build(siteDir, outDir, { cleanDist: false, softFsErrors: true });
        broadcast();
      } catch (e) {
        printBuildError(e);
      }
    });
}

function injectBeforeBodyEnd(html, snippet) {
  const doc = String(html || '');
  if (/<\/body>/i.test(doc)) {
    return doc.replace(/<\/body>/i, `${snippet}</body>`);
  }
  return `${doc}${snippet}`;
}

function escapeForJs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolveMissingPageTarget(requestPath, pagesDir) {
  const raw = String(requestPath || '').split('?')[0].split('#')[0].trim();
  if (!raw) return null;

  let route = raw;
  if (!route.startsWith('/')) route = `/${route}`;
  if (route === '/') route = '/index.html';
  if (!path.extname(route)) route += '.html';
  if (!/\.html$/i.test(route)) return null;

  let rel = route.replace(/^\/+/, '').replace(/\.html$/i, '.mq');
  rel = rel.replace(/\\/g, '/');
  rel = path.posix.normalize(rel);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;

  const absPath = path.resolve(pagesDir, rel);
  const pagesRoot = path.resolve(pagesDir);
  const absNorm = process.platform === 'win32' ? absPath.toLowerCase() : absPath;
  const rootNorm = process.platform === 'win32' ? pagesRoot.toLowerCase() : pagesRoot;
  if (!(absNorm === rootNorm || absNorm.startsWith(`${rootNorm}${path.sep}`))) return null;

  return { relPath: rel, absPath };
}

function buildStarterPage(relPath) {
  const normalized = String(relPath || '').replace(/\\/g, '/');
  const base = path.posix.basename(normalized, '.mq');
  const nav = base.toLowerCase() === 'index' ? 'index' : slugify(base);
  const title = toTitle(base);

  return `---
title: ${title}
nav: ${nav}
---

# ${title}

Page created from the dev 404 helper.
`;
}

function removeGeneratedHtmlForDeletedMq(absFile, pagesDir, outDir) {
  const relToPages = path.relative(pagesDir, absFile);
  if (!relToPages || relToPages.startsWith('..') || path.isAbsolute(relToPages)) return;

  const relHtml = normalizeRelPath(relToPages)
    .replace(/\.mq$/i, '.html')
    .replace(/^\/+/, '');
  if (!relHtml) return;

  const outFile = path.resolve(outDir, relHtml);
  const outRoot = path.resolve(outDir);
  const outFileNorm = process.platform === 'win32' ? outFile.toLowerCase() : outFile;
  const outRootNorm = process.platform === 'win32' ? outRoot.toLowerCase() : outRoot;
  if (!(outFileNorm === outRootNorm || outFileNorm.startsWith(`${outRootNorm}${path.sep}`))) return;

  try {
    if (fs.existsSync(outFile)) {
      fs.rmSync(outFile, { force: true });
    }
  } catch (_) {
    // Best effort: build() can still refresh remaining outputs.
  }
}

function normalizeRelPath(value) {
  return String(value || '')
    .split(path.sep).join('/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/');
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'page';
}

function toTitle(value) {
  return String(value || 'Page')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Page';
}

function acquireServeLock(siteDir, port) {
  const lockPath = path.join(siteDir, '.marque-serve.lock');
  const now = new Date().toISOString();

  if (fs.existsSync(lockPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const pid = parseInt(data.pid, 10);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, 0);
          throw new Error(`Another marque serve process is already running for this site (pid ${pid}, port ${data.port || 'unknown'}). Stop it first.`);
        } catch (err) {
          if (err && err.code !== 'ESRCH') throw err;
          // stale lock, safe to replace
        }
      }
    } catch (err) {
      // If the lock is malformed, replace it.
      if (/Another marque serve process/.test(String(err && err.message))) throw err;
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port, startedAt: now }, null, 2));

  return () => {
    if (!fs.existsSync(lockPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (parseInt(data.pid, 10) !== process.pid) return;
    } catch (_) {
      // best effort cleanup
    }
    try { fs.rmSync(lockPath, { force: true }); } catch (_) {}
  };
}

function printBuildError(err) {
  const message = String((err && err.message) || err || 'Unknown build error');
  if (/^error\[MQ\d+\]:/m.test(message)) {
    console.error(`\nBuild error\n${message}\n`);
    return;
  }
  console.error(`\nBuild error: ${message}\n`);
}

module.exports = { serve };
