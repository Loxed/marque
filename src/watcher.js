// watcher.js — dev server + live reload
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
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

  // initial build
  try {
    build(siteDir, outDir);
  } catch (e) {
    console.error('Build error:', e.message);
  }

  // websocket server for live reload
  const wss = new WebSocketServer({ port: wsPort });
  const broadcast = () => wss.clients.forEach(c => c.send('reload'));

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
  });

  // file watcher
  chokidar
    .watch([
      path.join(siteDir, 'pages'),
      path.join(siteDir, 'themes'),
      path.join(siteDir, 'static'),
      path.join(siteDir, 'marque.toml'),
      path.join(__dirname, '..', 'themes'), // built-in themes
    ], { ignoreInitial: true })
    .on('all', (event, file) => {
      const rel = path.relative(siteDir, file);
      console.log(`  ${event} → ${rel}`);
      try {
        build(siteDir, outDir);
        broadcast();
      } catch (e) {
        console.error('Build error:', e.message);
      }
    });
}

module.exports = { serve };
