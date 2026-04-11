'use strict';

const fs = require('fs');
const path = require('path');
const { normalizeRelPath } = require('./fs');

function listThemeEntries(themeRoot) {
  if (!themeRoot) return [];

  const root = path.resolve(themeRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  const entries = [];
  walkThemeTree(root, '', entries);
  return entries;
}

function listThemeNames(themeRoot) {
  return listThemeEntries(themeRoot).map(entry => entry.name);
}

function resolveThemeName(reference, themeRoot, options = {}) {
  const requested = normalizeThemeReference(reference || options.defaultName || 'comte');
  const entries = listThemeEntries(themeRoot);
  const match = findThemeEntry(requested, entries);
  if (!match) {
    throw new Error(`Theme "${reference}" not found`);
  }
  return match.name;
}

function resolveThemePath(reference, themeRoots, options = {}) {
  const requested = String(reference || options.defaultName || 'comte').trim();
  if (!requested) {
    throw new Error('Theme reference cannot be empty');
  }

  const directPath = resolveThemeDirectPath(requested, themeRoots);
  if (directPath) return directPath;

  const normalized = normalizeThemeReference(requested);
  const entries = flattenThemeEntries(themeRoots);
  const match = findThemeEntry(normalized, entries);
  if (!match) {
    throw new Error(`Theme "${reference}" not found`);
  }
  return match.fullPath;
}

function walkThemeTree(rootDir, relDir, out) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    const relPath = relDir ? normalizeRelPath(path.join(relDir, entry.name)) : entry.name;

    if (entry.isDirectory()) {
      const legacyThemeCss = path.join(fullPath, 'theme.css');
      if (fs.existsSync(legacyThemeCss) && fs.statSync(legacyThemeCss).isFile()) {
        out.push(createThemeEntry(relPath, fullPath));
        continue;
      }

      walkThemeTree(fullPath, relPath, out);
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.css') continue;
    out.push(createThemeEntry(relPath, fullPath));
  }
}

function createThemeEntry(relPath, fullPath) {
  const name = normalizeThemeReference(relPath);
  return {
    name,
    alias: themeAlias(name),
    fullPath,
  };
}

function flattenThemeEntries(themeRoots) {
  const roots = Array.isArray(themeRoots) ? themeRoots : [themeRoots];
  const out = [];

  for (const root of roots) {
    out.push(...listThemeEntries(root));
  }

  return out;
}

function findThemeEntry(requested, entries) {
  const exact = entries.find(entry => entry.name === requested);
  if (exact) return exact;

  if (requested.includes('/')) return null;
  return entries.find(entry => entry.alias === requested) || null;
}

function resolveThemeDirectPath(reference, themeRoots) {
  const roots = Array.isArray(themeRoots) ? themeRoots : [themeRoots];
  const directCandidates = [
    path.resolve(reference),
  ];

  if (!/\.css$/i.test(reference)) {
    directCandidates.push(path.resolve(`${reference}.css`));
  }

  for (const candidate of directCandidates) {
    const resolved = resolveThemePathCandidate(candidate);
    if (resolved) return resolved;
  }

  for (const root of roots) {
    if (!root) continue;

    const baseCandidate = path.resolve(root, reference);
    const resolvedBase = resolveThemePathCandidate(baseCandidate);
    if (resolvedBase) return resolvedBase;

    if (/\.css$/i.test(reference)) continue;

    const cssCandidate = path.resolve(root, `${reference}.css`);
    const resolvedCss = resolveThemePathCandidate(cssCandidate);
    if (resolvedCss) return resolvedCss;
  }

  return null;
}

function resolveThemePathCandidate(candidate) {
  if (!fs.existsSync(candidate)) return null;

  const stat = fs.statSync(candidate);
  if (stat.isFile()) return candidate;

  if (stat.isDirectory()) {
    const cssPath = path.join(candidate, 'theme.css');
    if (fs.existsSync(cssPath) && fs.statSync(cssPath).isFile()) {
      return candidate;
    }
  }

  return null;
}

function normalizeThemeReference(value) {
  return normalizeRelPath(String(value || '').trim())
    .replace(/\.css$/i, '')
    .replace(/\/theme$/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+/g, '/')
    .toLowerCase();
}

function themeAlias(name) {
  const normalized = normalizeThemeReference(name);
  const parts = normalized.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : normalized;
}

module.exports = {
  listThemeEntries,
  listThemeNames,
  resolveThemeName,
  resolveThemePath,
};
