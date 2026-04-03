'use strict';

const path = require('path');
const { build } = require('../builder');
const { printBuildError } = require('../utils/errors');
const { acquireServeLock } = require('./lock');
const { createWsServer } = require('./ws');
const { createHttpServer } = require('./http');
const { startFileWatcher } = require('./watcher');

function serve(siteDir, outDir, port = 3000) {
	const releaseServeLock = acquireServeLock(siteDir, port);
	const wsPort = port + 1;
	const diagnosticCache = new Set();
	const serveDiagnosticOptions = { suppressUnchanged: true, cache: diagnosticCache };
	const serveBuildOptions = {
		cleanDist: false,
		softFsErrors: true,
		logBuiltFiles: false,
		logStaticCopy: false,
		logSummary: true,
		diagnosticPrintOptions: serveDiagnosticOptions,
	};

	const pagesDir = path.resolve(siteDir, 'pages');
	const themesDir = path.resolve(siteDir, 'themes');
	const layoutsDir = path.resolve(siteDir, 'layouts');
	const directivesDir = path.resolve(siteDir, 'directives');
	const customDir = path.resolve(siteDir, 'custom');
	const configFile = path.resolve(siteDir, 'marque.toml');
	const summaryFile = path.resolve(siteDir, 'summary.mq');
	const pagesSummaryFile = path.resolve(pagesDir, 'summary.mq');

	try {
		build(siteDir, outDir, { ...serveBuildOptions, cleanDist: true });
	} catch (e) {
		printBuildError(e, serveDiagnosticOptions);
	}

	const { wss, broadcast } = createWsServer(wsPort);
	const server = createHttpServer({
		siteDir,
		outDir,
		pagesDir,
		wsPort,
		broadcast,
		build,
		buildOptions: serveBuildOptions,
	});
	const { watcher, usePolling } = startFileWatcher({
		siteDir,
		pagesDir,
		themesDir,
		layoutsDir,
		directivesDir,
		customDir,
		configFile,
		summaryFile,
		pagesSummaryFile,
		outDir,
		build,
		broadcast,
		buildOptions: serveBuildOptions,
		errorPrintOptions: serveDiagnosticOptions,
	});

	server.listen(port, () => {
		console.log(`\nmarque dev server → http://localhost:${port}`);
		console.log(`watching ${siteDir}/\n`);
		if (usePolling) {
			console.log('watch mode: polling enabled (recommended on WSL /mnt paths)\n');
		}
	});

	const cleanup = () => {
		try { watcher && watcher.close(); } catch (_) {}
		try { server && server.close(); } catch (_) {}
		try { wss && wss.close(); } catch (_) {}
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
}

module.exports = { serve };
