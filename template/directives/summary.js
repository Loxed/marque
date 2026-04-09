'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('toc', {
    type: 'inline',
    style: `
.mq-summary-panel {
  position: sticky;
  top: clamp(1rem, 2.5vw, 1.5rem);
  border: 1px solid var(--mq-summary-border, var(--mq-border, var(--border, rgba(0, 0, 0, 0.14))));
  border-radius: var(--mq-summary-radius, calc(var(--mq-radius, var(--radius, 8px)) + 2px));
  background: var(--mq-summary-bg, var(--mq-surface-alt, var(--surface2, rgba(0, 0, 0, 0.04))));
  box-shadow: var(--mq-summary-shadow, 0 18px 40px rgba(15, 23, 42, 0.08));
  padding: 1rem;
  min-width: 0;
  width: 100%;
}

.mq-summary-panel[hidden] {
  display: none !important;
}

.mq-page-summary-slot {
  display: none;
}

.mq-page-shell[data-has-summary="true"] .mq-page-summary-slot {
  display: block;
}

.mq-summary-panel > :first-child {
  margin-top: 0;
}

.mq-summary-title {
  margin: 0 0 0.85rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--mq-summary-title, var(--mq-muted, var(--muted, inherit)));
}

.mq-summary-list {
  display: grid;
  gap: 0.35rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.mq-summary-item {
  margin: 0;
  padding-left: 0;
}

.mq-summary-link,
.mq-summary-fallback {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0.2rem 0.45rem;
  border-radius: 0.6rem;
  text-decoration: none;
  color: var(--mq-summary-link, inherit);
  text-align: left;
  transition: background 0.18s ease, color 0.18s ease, transform 0.18s ease;
}

.mq-summary-link:hover,
.mq-summary-link:focus-visible {
  background: color-mix(in srgb, var(--mq-primary, var(--accent, currentColor)) 10%, transparent);
  color: var(--mq-primary, var(--accent, currentColor));
  outline: none;
}

.mq-summary-item.active > .mq-summary-link {
  background: color-mix(in srgb, var(--mq-primary, var(--accent, currentColor)) 14%, transparent);
  color: var(--mq-primary, var(--accent, currentColor));
}

.mq-summary-level-1 > :is(.mq-summary-link, .mq-summary-fallback) {
  font-weight: 700;
}

.mq-summary-level-2 > :is(.mq-summary-link, .mq-summary-fallback) {
  padding-left: 0.7rem;
}

.mq-summary-level-3 > :is(.mq-summary-link, .mq-summary-fallback) {
  padding-left: 1rem;
}

.mq-summary-level-4 > :is(.mq-summary-link, .mq-summary-fallback) {
  padding-left: 1.3rem;
}

.mq-summary-level-5 > :is(.mq-summary-link, .mq-summary-fallback) {
  padding-left: 1.6rem;
}

.mq-summary-level-6 > :is(.mq-summary-link, .mq-summary-fallback) {
  padding-left: 1.9rem;
}

.mq-summary-empty {
  margin: 0;
  color: var(--mq-summary-empty, var(--mq-muted, var(--muted, inherit)));
  font-size: 0.95rem;
}
`,
    render: ({ mods, name, opts, ctx }) => {
      const mode = resolveSummaryMode(mods, name);
      const sourceNodes = mode === 'scoped'
        ? findScopedSummarySourceNodes(ctx.siblings, ctx.index)
        : findPageSummarySourceNodes(ctx.parentNode, ctx.siblings, ctx.index);
      const items = extractSummaryItems(sourceNodes, ctx, opts);
      const title = escapeHtml(resolveSummaryTitle(name, mode));
      const body = items.length
        ? `<ol class="mq-summary-list">${items.map(renderSummaryItem).join('')}</ol>`
        : `<p class="mq-summary-empty">${escapeHtml(summaryEmptyText(mode))}</p>`;

      return `<aside class="mq-summary-panel" data-mq-toc data-mq-summary-scope="${mode}"><p class="mq-summary-title">${title}</p>${body}</aside>`;
    },
  });
};

function resolveSummaryMode(mods, name) {
  const modSet = new Set((mods || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean));
  const rawName = String(name || '').trim().toLowerCase();

  if (modSet.has('scoped') || modSet.has('local')) return 'scoped';
  if (modSet.has('page') || modSet.has('global')) return 'page';
  if (rawName === 'scoped' || rawName === 'local') return 'scoped';
  return 'page';
}

function resolveSummaryTitle(name, mode) {
  const raw = String(name || '').trim();
  if (!raw) return 'Summary';
  if (raw.toLowerCase() === mode) return 'Summary';
  if (raw.toLowerCase() === 'page' || raw.toLowerCase() === 'global' || raw.toLowerCase() === 'scoped' || raw.toLowerCase() === 'local') {
    return 'Summary';
  }
  return raw;
}

function summaryEmptyText(mode) {
  return mode === 'scoped'
    ? 'Add headings in the previous block to populate this summary.'
    : 'Add headings to the page to populate this summary.';
}

function findScopedSummarySourceNodes(siblings, index) {
  if (!Array.isArray(siblings) || !Number.isFinite(index)) return null;

  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = siblings[i];
    if (!candidate) continue;
    if (candidate.type === 'directive' && String(candidate.tag || '').toLowerCase() === 'summary') continue;
    if (candidate.type === 'markdown' && !String(candidate.content || '').trim()) continue;
    if (candidate.type === 'directive' || candidate.type === 'markdown') return [candidate];
  }

  return [];
}

function findPageSummarySourceNodes(parentNode, siblings, index) {
  const list = parentNode && Array.isArray(parentNode.children)
    ? parentNode.children
    : (Array.isArray(siblings) ? siblings : []);

  return list.filter((candidate, candidateIndex) => {
    if (!candidate) return false;
    if (Number.isFinite(index) && candidateIndex === index) return false;
    if (candidate.type === 'directive' && String(candidate.tag || '').toLowerCase() === 'summary') return false;
    if (candidate.type === 'markdown' && !String(candidate.content || '').trim()) return false;
    return candidate.type === 'directive' || candidate.type === 'markdown';
  });
}

function extractSummaryItems(sourceNodes, ctx, opts) {
  const html = ctx.renderNodes(Array.isArray(sourceNodes) ? sourceNodes : [], { ...(opts || {}) });
  const pattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const items = [];
  let match;

  while ((match = pattern.exec(String(html || '')))) {
    const level = Number(match[1]) || 1;
    const text = normalizeText(decodeHtmlEntities(stripHtmlTags(match[2])));
    if (!text) continue;
    items.push({ level, text });
  }

  return items;
}

function renderSummaryItem(item) {
  const level = Number(item && item.level) || 1;
  const text = escapeHtml(item && item.text ? item.text : '');
  return `<li class="mq-summary-item mq-summary-level-${level}" data-mq-summary-level="${level}"><span class="mq-summary-fallback">${text}</span></li>`;
}

function stripHtmlTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => {
      const num = Number(code);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const num = parseInt(code, 16);
      return Number.isFinite(num) ? String.fromCodePoint(num) : _;
    })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
