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

function serve(siteDir, outDir, port = 3000) {
  const wsPort = port + 1;
  const isMntPath = /^\/mnt\/[a-z]\//i.test(siteDir);
  const forcePolling = process.env.MARQUE_WATCH_POLLING === '1';
  const usePolling = forcePolling || isMntPath;
  const pagesDir = path.resolve(siteDir, 'pages');
  const themesDir = path.resolve(siteDir, 'themes');
  const layoutsDir = path.resolve(siteDir, 'layouts');
  const configFile = path.resolve(siteDir, 'marque.toml');
  const outDirAbs = path.resolve(outDir);

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
    build(siteDir, outDir);
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
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/') urlPath = '/index.html';
    if (!path.extname(urlPath)) urlPath += '.html';

    const filePath = path.join(outDir, urlPath);

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      res.end('<h1>404</h1>');
      return;
    }

    const ext = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    let content = fs.readFileSync(filePath);

    if (ext === '.html') {
      const snippet = RELOAD_SNIPPET.replace('__PORT__', wsPort);
      content = content.toString().replace('</body>', snippet + '</body>');
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

  // file watcher
  chokidar
    .watch(watchTargets, watchOptions)
    .on('all', (event, file) => {
      const absFile = path.resolve(file || '');
      const relToPages = path.relative(pagesDir, absFile);
      const inPages = !!relToPages && !relToPages.startsWith('..') && !path.isAbsolute(relToPages);
      const relToThemes = path.relative(themesDir, absFile);
      const inThemes = !!relToThemes && !relToThemes.startsWith('..') && !path.isAbsolute(relToThemes);
      const relToLayouts = path.relative(layoutsDir, absFile);
      const inLayouts = !!relToLayouts && !relToLayouts.startsWith('..') && !path.isAbsolute(relToLayouts);

      // Ignore output tree changes to prevent rebuild loops.
      if (absFile === outDirAbs || absFile.startsWith(`${outDirAbs}${path.sep}`)) return;

      const ext = path.extname(absFile).toLowerCase();
      const isMqFileEvent = ['add', 'change', 'unlink'].includes(event) && ext === '.mq';
      const isPagesDirEvent = ['addDir', 'unlinkDir'].includes(event);
      const isThemeEvent = inThemes && ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event);
      const isLayoutEvent = inLayouts && ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event);
      const isTomlChangeEvent = event === 'change' && absFile === configFile;
      if (!((inPages && (isMqFileEvent || isPagesDirEvent)) || isThemeEvent || isLayoutEvent || isTomlChangeEvent)) return;

      const rel = path.relative(siteDir, file);
      console.log(`  ${event} → ${rel}`);
      try {
        build(siteDir, outDir);
        broadcast();
      } catch (e) {
        printBuildError(e);
      }
    });
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
