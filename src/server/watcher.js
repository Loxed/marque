'use strict';

const path = require('path');
const chokidar = require('chokidar');
const { removeGeneratedHtmlForDeletedMq } = require('./page-creator');

function startFileWatcher({
	siteDir,
	pagesDir,
	themesDir,
	layoutsDir,
	configFile,
	summaryFile,
	pagesSummaryFile,
	outDir,
	build,
	broadcast,
}) {
	const isMntPath = /^\/mnt\/[a-z]\//i.test(siteDir);
	const forcePolling = process.env.MARQUE_WATCH_POLLING === '1';
	const usePolling = forcePolling || isMntPath;

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

	const normalizePathForCompare = p => {
		const resolved = path.resolve(String(p || ''));
		return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
	};

	const summaryFileNorm = normalizePathForCompare(summaryFile);
	const pagesSummaryFileNorm = normalizePathForCompare(pagesSummaryFile);
	const configFileNorm = normalizePathForCompare(configFile);
	const outDirAbsNorm = normalizePathForCompare(outDir);

	const watcher = chokidar
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
				const message = String((e && e.message) || e || 'Unknown build error');
				if (/^error\[MQ\d+\]:/m.test(message)) {
					console.error(`\nBuild error\n${message}\n`);
				} else {
					console.error(`\nBuild error: ${message}\n`);
				}
			}
		});

	return { watcher, usePolling };
}

module.exports = { startFileWatcher };
