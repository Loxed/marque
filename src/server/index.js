'use strict';

const path = require('path');
const { build } = require('../builder');
const { printBuildError } = require('../utils/errors');
const { acquireServeLock } = require('./lock');
const { createWsServer } = require('./ws');
const { createHttpServer } = require('./http');
const { startFileWatcher } = require('./watcher');

async function serve(siteDir, outDir, port = 3000) {
	const preferredPort = normalizeServePort(port);
	const serveLock = acquireServeLock(siteDir, preferredPort);
	const releaseServeLock = typeof serveLock === 'function'
		? serveLock
		: () => serveLock.release();
	const updateServeLockPort = serveLock && typeof serveLock.updatePort === 'function'
		? (nextPort) => serveLock.updatePort(nextPort)
		: () => {};
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
	const configFile = path.resolve(siteDir, 'marque.toml');
	const navigationFiles = [
		path.resolve(siteDir, 'navigation.mq'),
		path.resolve(pagesDir, 'navigation.mq'),
		path.resolve(siteDir, 'summary.mq'),
		path.resolve(pagesDir, 'summary.mq'),
	];
	let server = null;
	let wss = null;
	let watcher = null;
	let usePolling = false;
	let actualPort = preferredPort;
	let wsPort = preferredPort + 1;
	let broadcast = () => {};

	try {
		build(siteDir, outDir, { ...serveBuildOptions, cleanDist: true });
	} catch (e) {
		printBuildError(e, serveDiagnosticOptions);
	}

	try {
		const started = await startServeServers({
			startPort: preferredPort,
			siteDir,
			outDir,
			pagesDir,
			build,
			buildOptions: serveBuildOptions,
		});
		server = started.server;
		wss = started.wss;
		broadcast = started.broadcast;
		actualPort = started.port;
		wsPort = started.wsPort;
		updateServeLockPort(actualPort);

		const watcherState = startFileWatcher({
			siteDir,
			pagesDir,
			themesDir,
			layoutsDir,
			directivesDir,
			configFile,
			navigationFiles,
			outDir,
			build,
			broadcast,
			buildOptions: serveBuildOptions,
			errorPrintOptions: serveDiagnosticOptions,
		});
		watcher = watcherState.watcher;
		usePolling = watcherState.usePolling;
	} catch (err) {
		try { watcher && watcher.close(); } catch (_) {}
		try { server && server.close(); } catch (_) {}
		try { wss && wss.close(); } catch (_) {}
		try { releaseServeLock(); } catch (_) {}
		throw err;
	}

	if (actualPort !== preferredPort) {
		console.log(`\nmarque: port ${preferredPort} unavailable, using ${actualPort} instead`);
	}
	console.log(`\nmarque dev server → http://localhost:${actualPort}`);
	console.log(`watching ${siteDir}/\n`);
	if (usePolling) {
		console.log('watch mode: polling enabled (recommended on WSL /mnt paths)\n');
	}

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

async function startServeServers(options) {
	let port = normalizeServePort(options && options.startPort);

	while (port <= 65534) {
		let server = null;
		let wss = null;

		try {
			const wsPort = port + 1;
			const wsState = await createWsServer(wsPort);
			wss = wsState.wss;
			server = createHttpServer({
				siteDir: options.siteDir,
				outDir: options.outDir,
				pagesDir: options.pagesDir,
				wsPort,
				broadcast: wsState.broadcast,
				build: options.build,
				buildOptions: options.buildOptions,
			});

			await listenServer(server, port);

			return {
				server,
				wss,
				broadcast: wsState.broadcast,
				port,
				wsPort,
			};
		} catch (err) {
			try { server && server.close(); } catch (_) {}
			try { wss && wss.close(); } catch (_) {}

			if (!isPortInUseError(err)) {
				throw err;
			}
			port += 1;
		}
	}

	throw new Error('No available serve ports found between the requested port and 65534.');
}

function listenServer(server, port) {
	return new Promise((resolve, reject) => {
		const onError = (err) => {
			server.removeListener('listening', onListening);
			reject(err);
		};
		const onListening = () => {
			server.removeListener('error', onError);
			resolve();
		};

		server.once('error', onError);
		server.once('listening', onListening);
		server.listen(port);
	});
}

function isPortInUseError(err) {
	return !!(err && (err.code === 'EADDRINUSE' || err.code === 'EACCES'));
}

function normalizeServePort(value) {
	const port = parseInt(value, 10);
	if (!Number.isFinite(port) || port < 1) return 3000;
	return Math.min(port, 65534);
}

module.exports = { serve };
