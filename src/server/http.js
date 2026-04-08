'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { resolveMissingPageTarget, buildStarterPage } = require('./page-creator');
const { escapeForJs } = require('../utils/strings');

const MIME = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
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

function createHttpServer({ siteDir, outDir, pagesDir, wsPort, broadcast, build, buildOptions }) {
	return http.createServer((req, res) => {
		if (req.method === 'POST' && req.url && req.url.split('?')[0] === '/__marque/create-page') {
			return handleCreatePage({ req, res, siteDir, outDir, pagesDir, broadcast, build, buildOptions });
		}

		let urlPath = req.url.split('?')[0];
		if (urlPath === '/') urlPath = '/index.html';
		if (!path.extname(urlPath)) urlPath += '.html';

		const filePath = path.join(outDir, urlPath);

		if (!fs.existsSync(filePath)) {
			const fallback404 = path.join(outDir, '404.html');
			if (fs.existsSync(fallback404)) {
				let content = fs.readFileSync(fallback404, 'utf8').toString();
				content = absolutizeFallbackDocumentPaths(content);
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
}

function handleCreatePage({ req, res, siteDir, outDir, pagesDir, broadcast, build, buildOptions }) {
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

			build(siteDir, outDir, { cleanDist: false, softFsErrors: true, ...(buildOptions || {}) });
			broadcast();

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: true, file: target.relPath.replace(/\\/g, '/') }));
		} catch (err) {
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ ok: false, error: String((err && err.message) || err || 'Create failed') }));
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

module.exports = { createHttpServer };
