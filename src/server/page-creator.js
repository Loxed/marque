'use strict';

const fs   = require('fs');
const path = require('path');
const { slugify, toTitle } = require('../utils/strings');

/**
 * Resolve a missing HTML route to the .mq file that should be created.
 * Returns `{ relPath, absPath }` or `null` if the path is invalid/unsafe.
 */
function resolveMissingPageTarget(requestPath, pagesDir) {
  const raw = String(requestPath || '').split('?')[0].split('#')[0].trim();
  if (!raw) return null;

  let route = raw.startsWith('/') ? raw : `/${raw}`;
  if (route === '/') route = '/index.html';
  if (!path.extname(route)) route += '.html';
  if (!/\.html$/i.test(route)) return null;

  let rel = route.replace(/^\/+/, '').replace(/\.html$/i, '.mq');
  rel = path.posix.normalize(rel.replace(/\\/g, '/'));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;

  const absPath   = path.resolve(pagesDir, rel);
  const pagesRoot = path.resolve(pagesDir);
  const norm      = p => process.platform === 'win32' ? p.toLowerCase() : p;

  if (!(norm(absPath) === norm(pagesRoot) || norm(absPath).startsWith(`${norm(pagesRoot)}${path.sep}`)))
    return null;

  return { relPath: rel, absPath };
}

/** Generate a minimal starter .mq page for the given relative path. */
function buildStarterPage(relPath) {
  const base  = path.posix.basename(String(relPath || '').replace(/\\/g, '/'), '.mq');
  const nav   = base.toLowerCase() === 'index' ? 'index' : slugify(base);
  const title = toTitle(base);

  return `+++
title = ${JSON.stringify(title)}
nav = ${JSON.stringify(nav)}
+++

# ${title}

Page created from the dev 404 helper.
`;
}

/**
 * Remove the compiled HTML file that corresponds to a deleted .mq source.
 * Best-effort — failures are silent since `build()` will clean up on next run.
 */
function removeGeneratedHtmlForDeletedMq(absFile, pagesDir, outDir) {
  const relToPages = path.relative(pagesDir, absFile);
  if (!relToPages || relToPages.startsWith('..') || path.isAbsolute(relToPages)) return;

  const relHtml = relToPages
    .split(path.sep).join('/')
    .replace(/^\.\//, '').replace(/\/+/g, '/')
    .replace(/\.mq$/i, '.html')
    .replace(/^\/+/, '');
  if (!relHtml) return;

  const outFile   = path.resolve(outDir, relHtml);
  const outRoot   = path.resolve(outDir);
  const norm      = p => process.platform === 'win32' ? p.toLowerCase() : p;

  if (!(norm(outFile) === norm(outRoot) || norm(outFile).startsWith(`${norm(outRoot)}${path.sep}`))) return;

  try {
    if (fs.existsSync(outFile)) fs.rmSync(outFile, { force: true });
  } catch (_) { /* ignore */ }
}

module.exports = {
  resolveMissingPageTarget,
  buildStarterPage,
  removeGeneratedHtmlForDeletedMq,
};
