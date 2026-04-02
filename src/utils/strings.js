'use strict';

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

function escapeForJs(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function normalizeLayoutName(layout) {
  const name = String(layout || 'topnav').trim().toLowerCase();
  if (name === 'default' || name === 'crossmediabar' || name === 'xmb') return 'topnav';
  return name || 'topnav';
}

module.exports = { slugify, toTitle, escapeForJs, normalizeLayoutName };