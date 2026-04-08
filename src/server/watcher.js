'use strict';

const path = require('path');
const chokidar = require('chokidar');
const { execSync } = require('child_process');
const { removeGeneratedHtmlForDeletedMq } = require('./page-creator');
const { printBuildError } = require('../utils/errors');

function clearTerminal() {
	const cmd = process.platform === 'win32' ? 'cls' : 'clear';
	try {
		execSync(cmd, { stdio: 'inherit' });
	} catch (_) {
		if (typeof console.clear === 'function') console.clear();
	}
}

function startFileWatcher({
	siteDir,
	pagesDir,
	themesDir,
	layoutsDir,
	directivesDir,
	configFile,
	summaryFile,
	pagesSummaryFile,
	outDir,
	build,
	broadcast,
	buildOptions,
	errorPrintOptions,
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
			const relToDirectives = path.relative(directivesDir, absFile);
			const inDirectives = !!relToDirectives && !relToDirectives.startsWith('..') && !path.isAbsolute(relToDirectives);

			if (absFileNorm === outDirAbsNorm || absFileNorm.startsWith(`${outDirAbsNorm}${path.sep}`)) return;

			const ext = path.extname(absFile).toLowerCase();
			const isMqFileEvent = ['add', 'change', 'unlink'].includes(event) && ext === '.mq';
			const isPagesDirEvent = ['addDir', 'unlinkDir'].includes(event);
			const isThemeEvent = inThemes && ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event);
			const isLayoutEvent = inLayouts && ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event);
			const isDirectivesEvent = inDirectives
				&& ['add', 'change', 'unlink', 'addDir', 'unlinkDir'].includes(event)
				&& (['addDir', 'unlinkDir'].includes(event) || ext === '.js');
			const isTomlChangeEvent = event === 'change' && absFileNorm === configFileNorm;
			const isSummaryFileEvent = ['add', 'change', 'unlink'].includes(event)
				&& (absFileNorm === summaryFileNorm || absFileNorm === pagesSummaryFileNorm);

			if (!((inPages && (isMqFileEvent || isPagesDirEvent)) || isThemeEvent || isLayoutEvent || isDirectivesEvent || isTomlChangeEvent || isSummaryFileEvent)) return;

			if (inPages && event === 'unlink' && ext === '.mq') {
				removeGeneratedHtmlForDeletedMq(absFile, pagesDir, outDir);
			}

			clearTerminal();
			const rel = path.relative(siteDir, file);
			console.log(`  ${event} → ${rel}`);
			try {
				build(siteDir, outDir, { cleanDist: false, softFsErrors: true, ...(buildOptions || {}) });
				broadcast();
			} catch (e) {
				printBuildError(e, errorPrintOptions || {});
			}
		});

	return { watcher, usePolling };
}

module.exports = { startFileWatcher };
