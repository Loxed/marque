'use strict';

function mqEscapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mqEscapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mqNormalizeSearchValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function mqIsTypingTarget(target) {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

function mqTab(id, idx) {
  const el = document.getElementById(id);
  el.querySelectorAll('.mq-tab-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  el.querySelectorAll('.mq-tab-content').forEach((c, i) => c.classList.toggle('active', i === idx));
}

function mqToggleNav(btn) {
  const nav = btn.closest('.mq-nav');
  if (!nav) return;
  const open = nav.classList.toggle('mq-nav-open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function mqCloseNav(nav) {
  if (!nav) return;
  nav.classList.remove('mq-nav-open');
  const btn = nav.querySelector('.mq-nav-toggle');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function mqIsCompactNav(nav) {
  if (!nav) return false;
  const btn = nav.querySelector('.mq-nav-toggle');
  if (!btn) return false;
  return window.getComputedStyle(btn).display !== 'none';
}

function mqPositionSubmenus() {
  const viewportPadding = 8;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const groups = document.querySelectorAll('.mq-nav-group');
  groups.forEach(group => {
    const submenu = group.querySelector(':scope > .mq-nav-submenu');
    if (!submenu) return;

    group.classList.remove('mq-nav-group-open-left');

    const style = window.getComputedStyle(submenu);
    if (style.position !== 'absolute') return;

    const groupRect = group.getBoundingClientRect();
    const submenuWidth = Math.max(submenu.offsetWidth || 0, submenu.scrollWidth || 0);
    const openRightEdge = groupRect.left + submenuWidth;
    const openLeftEdge = groupRect.right - submenuWidth;
    const overflowsRight = openRightEdge > (viewportWidth - viewportPadding);
    const fitsWhenOpenLeft = openLeftEdge >= viewportPadding;

    if (overflowsRight && fitsWhenOpenLeft) {
      group.classList.add('mq-nav-group-open-left');
    }
  });
}

const mqSearchState = {
  activeIndex: -1,
  index: null,
  indexPromise: null,
  initialized: false,
  input: null,
  lastTrigger: null,
  meta: null,
  results: null,
  resultsData: [],
  root: null,
};

function mqApplySearchShortcutHints() {
  const hints = document.querySelectorAll('[data-search-shortcut]');
  const closeHints = document.querySelectorAll('[data-search-close-hint]');
  if (!hints.length && !closeHints.length) return;

  const coarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const smallScreen = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;
  const touchDevice = coarsePointer || smallScreen;
  const platform = String(
    (navigator.userAgentData && navigator.userAgentData.platform)
    || navigator.platform
    || navigator.userAgent
    || ''
  ).toLowerCase();
  const isApple = /(mac|iphone|ipad|ipod)/.test(platform);
  const shortcutHint = touchDevice ? '' : (isApple ? '⌘ K' : 'Ctrl K');
  const closeHint = touchDevice ? '' : 'Esc';

  hints.forEach(el => {
    if (!shortcutHint) {
      el.hidden = true;
      el.textContent = '';
      return;
    }

    el.hidden = false;
    el.textContent = shortcutHint;
  });

  closeHints.forEach(el => {
    if (!closeHint) {
      el.hidden = true;
      el.textContent = '';
      return;
    }

    el.hidden = false;
    el.textContent = closeHint;
  });
}

function mqSearchElements() {
  if (mqSearchState.root && mqSearchState.root.isConnected) return mqSearchState;

  mqSearchState.root = document.getElementById('mq-search');
  mqSearchState.input = document.getElementById('mq-search-input');
  mqSearchState.results = document.getElementById('mq-search-results');
  mqSearchState.meta = document.getElementById('mq-search-meta');
  return mqSearchState;
}

function mqSetSearchExpanded(open) {
  document.querySelectorAll('.mq-search-toggle').forEach(btn => {
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
}

function mqIsSearchOpen() {
  const state = mqSearchElements();
  return !!(state.root && !state.root.hidden);
}

function mqToggleSearch(btn) {
  if (mqIsSearchOpen()) {
    mqCloseSearch();
    return;
  }

  mqOpenSearch(btn);
}

async function mqOpenSearch(btn) {
  const state = mqSearchElements();
  if (!state.root) return;

  mqInitSearch();
  state.lastTrigger = btn || document.activeElement;

  document.querySelectorAll('.mq-nav.mq-nav-open').forEach(mqCloseNav);
  state.root.hidden = false;
  state.root.setAttribute('aria-hidden', 'false');
  document.body.classList.add('mq-search-open');
  mqSetSearchExpanded(true);

  if (state.input) {
    window.requestAnimationFrame(() => {
      state.input.focus();
      state.input.select();
    });
  }

  if (!state.index) {
    mqRenderSearchLoading();
  }

  try {
    await mqLoadSearchIndex();
    if (state.input && state.input.value.trim()) {
      mqRunSearch(state.input.value);
    } else {
      mqRenderSearchIdle();
    }
  } catch (err) {
    mqRenderSearchError(err);
  }
}

function mqCloseSearch() {
  const state = mqSearchElements();
  if (!state.root) return;

  state.root.hidden = true;
  state.root.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('mq-search-open');
  mqSetSearchExpanded(false);

  if (state.lastTrigger && typeof state.lastTrigger.focus === 'function') {
    state.lastTrigger.focus();
  }
}

function mqInitSearch() {
  const state = mqSearchElements();
  if (state.initialized || !state.root || !state.input || !state.results) return;

  state.initialized = true;

  state.input.addEventListener('input', () => {
    mqRunSearch(state.input.value);
  });

  state.input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      mqMoveSearchSelection(1);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      mqMoveSearchSelection(-1);
      return;
    }

    if (e.key === 'Enter') {
      const target = mqGetActiveSearchResult();
      if (target) {
        e.preventDefault();
        target.click();
      }
    }
  });

  state.results.addEventListener('mouseover', e => {
    const result = e.target.closest('.mq-search-result');
    if (!result) return;
    state.activeIndex = Number(result.dataset.resultIndex || -1);
    mqSyncActiveSearchResult();
  });

  state.results.addEventListener('click', e => {
    const result = e.target.closest('.mq-search-result');
    if (!result) return;
    mqCloseSearch();
  });
}

async function mqLoadSearchIndex() {
  const state = mqSearchElements();
  if (state.index) return state.index;
  if (state.indexPromise) return state.indexPromise;

  state.indexPromise = fetch('/search-index.json', {
    headers: { Accept: 'application/json' },
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Search index unavailable (${res.status})`);
      }
      return res.json();
    })
    .then(entries => Array.isArray(entries) ? entries : [])
    .then(entries => entries.map(entry => ({
      ...entry,
      _descriptionSearch: mqNormalizeSearchValue(entry.description),
      _headingsSearch: Array.isArray(entry.headings) ? entry.headings.map(mqNormalizeSearchValue) : [],
      _headingsJoined: Array.isArray(entry.headings) ? entry.headings.map(mqNormalizeSearchValue).join(' ') : '',
      _textSearch: mqNormalizeSearchValue(entry.text),
      _titleSearch: mqNormalizeSearchValue(entry.title),
    })))
    .then(entries => {
      state.index = entries;
      state.indexPromise = null;
      return entries;
    })
    .catch(err => {
      state.indexPromise = null;
      throw err;
    });

  return state.indexPromise;
}

function mqRunSearch(query) {
  const state = mqSearchElements();
  if (!state.results || !state.meta) return;

  const rawQuery = String(query || '').trim();
  if (!rawQuery) {
    mqRenderSearchIdle();
    return;
  }

  const normalizedQuery = mqNormalizeSearchValue(rawQuery);
  const terms = Array.from(new Set(normalizedQuery.split(/\s+/).filter(Boolean)));

  if (!terms.length || !Array.isArray(state.index)) {
    mqRenderSearchIdle();
    return;
  }

  const matches = state.index
    .map(entry => mqScoreSearchEntry(entry, terms, normalizedQuery))
    .filter(Boolean)
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return String(a.title || '').localeCompare(String(b.title || ''));
    })
    .slice(0, 40);

  state.resultsData = matches;
  state.activeIndex = matches.length ? 0 : -1;

  if (!matches.length) {
    state.meta.textContent = `No results for "${rawQuery}".`;
    state.results.innerHTML = `<div class="mq-search-empty">No pages matched <strong>${mqEscapeHtml(rawQuery)}</strong>. Try a shorter title, a section heading, or a broader phrase.</div>`;
    return;
  }

  const capped = matches.length === 40 && state.index.length > 40;
  state.meta.textContent = `${matches.length} result${matches.length === 1 ? '' : 's'}${capped ? ' shown' : ''} for "${rawQuery}".`;
  state.results.innerHTML = matches.map((entry, index) => mqRenderSearchResult(entry, index, terms)).join('');
  mqSyncActiveSearchResult();
}

function mqScoreSearchEntry(entry, terms, phrase) {
  let score = 0;
  let firstHit = Number.POSITIVE_INFINITY;

  for (const term of terms) {
    let matched = false;

    const titlePos = entry._titleSearch.indexOf(term);
    if (titlePos >= 0) {
      score += titlePos === 0 ? 120 : 88;
      firstHit = Math.min(firstHit, titlePos);
      matched = true;
    }

    const headingPos = entry._headingsJoined.indexOf(term);
    if (headingPos >= 0) {
      score += 46;
      firstHit = Math.min(firstHit, 700 + headingPos);
      matched = true;
    }

    const descriptionPos = entry._descriptionSearch.indexOf(term);
    if (descriptionPos >= 0) {
      score += 28;
      firstHit = Math.min(firstHit, 1400 + descriptionPos);
      matched = true;
    }

    const textPos = entry._textSearch.indexOf(term);
    if (textPos >= 0) {
      score += 12;
      firstHit = Math.min(firstHit, 2200 + textPos);
      matched = true;
    }

    if (!matched) return null;
  }

  if (entry._titleSearch.includes(phrase)) score += 140;
  else if (entry._headingsJoined.includes(phrase)) score += 84;
  else if (entry._descriptionSearch.includes(phrase)) score += 52;
  else if (entry._textSearch.includes(phrase)) score += 26;

  score -= Math.min(30, Math.floor(firstHit / 180));

  return {
    ...entry,
    _score: score,
  };
}

function mqRenderSearchIdle() {
  const state = mqSearchElements();
  if (!state.results || !state.meta) return;

  if (Array.isArray(state.index) && state.index.length) {
    const suggestions = state.index.slice(0, 8);
    state.resultsData = suggestions;
    state.activeIndex = suggestions.length ? 0 : -1;
    state.meta.textContent = `Search across ${state.index.length} page${state.index.length === 1 ? '' : 's'}.`;
    state.results.innerHTML = suggestions
      .map((entry, index) => mqRenderSearchResult(entry, index, [], true))
      .join('');
    mqSyncActiveSearchResult();
    return;
  }

  state.resultsData = [];
  state.activeIndex = -1;
  state.meta.textContent = 'Type to search titles, headings, and page content.';
  state.results.innerHTML = '<div class="mq-search-empty">Search is ready. Try a page title, a section heading, or a phrase from the content.</div>';
}

function mqRenderSearchLoading() {
  const state = mqSearchElements();
  if (!state.results || !state.meta) return;
  state.resultsData = [];
  state.activeIndex = -1;
  state.meta.textContent = 'Loading the search index...';
  state.results.innerHTML = '<div class="mq-search-empty">Loading searchable content...</div>';
}

function mqRenderSearchError(err) {
  const state = mqSearchElements();
  if (!state.results || !state.meta) return;
  state.resultsData = [];
  state.activeIndex = -1;
  state.meta.textContent = 'Search could not load.';
  state.results.innerHTML = `<div class="mq-search-empty">The search index could not be loaded${err && err.message ? `: ${mqEscapeHtml(err.message)}` : '.'}</div>`;
}

function mqRenderSearchResult(entry, index, terms, suggestionMode) {
  const matchedHeadings = Array.isArray(entry.headings)
    ? entry.headings.filter(heading => terms.length ? terms.some(term => mqNormalizeSearchValue(heading).includes(term)) : true).slice(0, 2)
    : [];
  const snippet = mqBuildSearchSnippet(entry, terms);
  const pathLabel = entry.href || '/';
  const headingsHtml = matchedHeadings.length
    ? `<div class="mq-search-result-headings">${matchedHeadings.map(heading => `<span class="mq-search-result-chip">${mqHighlightText(heading, terms)}</span>`).join('')}</div>`
    : '';
  const snippetHtml = snippet
    ? `<p class="mq-search-result-snippet">${mqHighlightText(snippet, terms)}</p>`
    : '';
  const pathPrefix = suggestionMode ? 'Page' : 'Match';

  return `<a class="mq-search-result" href="${mqEscapeHtml(entry.href || '/')}" data-result-index="${index}"><span class="mq-search-result-meta">${mqEscapeHtml(pathPrefix)} <span class="mq-search-result-path">${mqEscapeHtml(pathLabel)}</span></span><strong class="mq-search-result-title">${mqHighlightText(entry.title || entry.href || 'Untitled', terms)}</strong>${headingsHtml}${snippetHtml}</a>`;
}

function mqBuildSearchSnippet(entry, terms) {
  const source = String(entry.description || entry.text || '').trim();
  if (!source) return '';

  if (!terms.length) {
    return source.length > 180 ? `${source.slice(0, 177).trimEnd()}...` : source;
  }

  const haystack = source.toLowerCase();
  let index = -1;
  for (const term of terms) {
    const match = haystack.indexOf(term.toLowerCase());
    if (match >= 0 && (index === -1 || match < index)) {
      index = match;
    }
  }

  if (index === -1) {
    return source.length > 180 ? `${source.slice(0, 177).trimEnd()}...` : source;
  }

  const start = Math.max(0, index - 48);
  const end = Math.min(source.length, index + 132);
  let snippet = source.slice(start, end).trim();

  if (start > 0) snippet = `...${snippet}`;
  if (end < source.length) snippet = `${snippet}...`;
  return snippet;
}

function mqMoveSearchSelection(step) {
  const state = mqSearchElements();
  if (!state.resultsData.length) return;

  const total = state.resultsData.length;
  state.activeIndex = state.activeIndex < 0
    ? 0
    : (state.activeIndex + step + total) % total;

  mqSyncActiveSearchResult();
}

function mqSyncActiveSearchResult() {
  const state = mqSearchElements();
  const items = state.results ? state.results.querySelectorAll('.mq-search-result') : [];
  items.forEach((item, index) => {
    const active = index === state.activeIndex;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  const active = mqGetActiveSearchResult();
  if (active) {
    active.scrollIntoView({ block: 'nearest' });
  }
}

function mqGetActiveSearchResult() {
  const state = mqSearchElements();
  if (!state.results || state.activeIndex < 0) return null;
  return state.results.querySelector(`.mq-search-result[data-result-index="${state.activeIndex}"]`);
}

function mqHighlightText(text, terms) {
  const source = String(text || '');
  if (!terms.length) return mqEscapeHtml(source);

  const escapedTerms = Array.from(new Set(terms.filter(Boolean)))
    .sort((a, b) => b.length - a.length)
    .map(mqEscapeRegex);

  if (!escapedTerms.length) return mqEscapeHtml(source);

  const pattern = new RegExp(`(${escapedTerms.join('|')})`, 'ig');
  return mqEscapeHtml(source).replace(pattern, '<mark>$1</mark>');
}

const mqDropdownToggleHandlers = new WeakMap();

function mqInitDropdownPersistence() {
  const dropdowns = document.querySelectorAll('.mq-dropdown');
  dropdowns.forEach((dropdown, index) => {
    if (String(dropdown.tagName || '').toLowerCase() !== 'details') return;

    const dropdownId = mqResolveDropdownPersistenceId(dropdown, index);
    if (!dropdownId) return;

    dropdown.dataset.mqDropdownId = dropdownId;
    if (mqDropdownCacheDisabled(dropdown)) {
      mqClearDropdownState(dropdownId);
      return;
    }

    mqRestoreDropdownState(dropdown, dropdownId);

    if (mqDropdownToggleHandlers.has(dropdown)) return;

    const onToggle = () => {
      mqPersistDropdownState(dropdownId, dropdown.open);
    };

    dropdown.addEventListener('toggle', onToggle);
    mqDropdownToggleHandlers.set(dropdown, onToggle);
  });
}

function mqRestoreDropdownState(dropdown, dropdownId) {
  const stored = mqReadDropdownState(dropdownId);
  if (stored === null) return;
  dropdown.open = stored;
}

function mqPersistDropdownState(dropdownId, isOpen) {
  mqSafeLocalStorage((storage) => {
    storage.setItem(mqDropdownStorageKey(dropdownId), isOpen ? 'open' : 'closed');
  });
}

function mqReadDropdownState(dropdownId) {
  let value = null;

  mqSafeLocalStorage((storage) => {
    value = storage.getItem(mqDropdownStorageKey(dropdownId));
  });

  if (value === 'open') return true;
  if (value === 'closed') return false;
  return null;
}

function mqClearDropdownState(dropdownId) {
  mqSafeLocalStorage((storage) => {
    storage.removeItem(mqDropdownStorageKey(dropdownId));
  });
}

function mqDropdownStorageKey(dropdownId) {
  const path = window.location && window.location.pathname ? window.location.pathname : '/';
  return `mq:dropdown:${path}:${dropdownId}`;
}

function mqDropdownCacheDisabled(dropdown) {
  const value = String((dropdown && dropdown.dataset && dropdown.dataset.mqDropdownCache) || '').trim().toLowerCase();
  return value === 'disabled' || value === 'off' || value === 'false';
}

function mqResolveDropdownPersistenceId(dropdown, index) {
  const explicit = String((dropdown.dataset && dropdown.dataset.mqDropdownId) || '').trim();
  if (explicit) return explicit;

  const summary = dropdown.querySelector(':scope > summary');
  const summaryText = summary ? mqSlugifyValue(summary.textContent || '') : '';
  const fallback = summaryText || `dropdown-${index + 1}`;
  return `${fallback}-${index + 1}`;
}

function mqSlugifyValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mqSafeLocalStorage(work) {
  if (typeof work !== 'function') return;
  if (typeof window === 'undefined' || !('localStorage' in window)) return;

  try {
    work(window.localStorage);
  } catch (_) {
    // Ignore storage access failures such as private mode restrictions.
  }
}

const mqSummaryTrackers = new Set();
let mqSummaryTrackingBound = false;
let mqSummaryTrackingScheduled = false;

function mqInitSummaries() {
  const slot = document.getElementById('mq-page-summary-slot');
  const shell = document.getElementById('mq-page-shell');
  const tocPanels = Array.from(document.querySelectorAll('[data-mq-toc]'));
  const pageSummaryEnabled = !!(shell && shell.dataset.pageSummary === 'true');

  if (pageSummaryEnabled && slot) {
    const panel = mqCreateSummaryPanel('Page summary', 'page');
    slot.hidden = false;
    slot.innerHTML = '';
    slot.appendChild(panel);
    if (shell) shell.dataset.hasSummary = 'true';
    mqBindSummaryPanel(panel);
  }

  tocPanels.forEach(panel => {
    const scopedSource = mqFindSummarySource(panel);
    if (scopedSource) panel._mqSummarySourceEl = scopedSource;
    mqBindSummaryPanel(panel);
  });
}

function mqBindSummaryPanel(panel) {
  if (!panel || panel.dataset.mqSummaryBound === 'true') return;
  panel.dataset.mqSummaryBound = 'true';
  const source = mqResolveSummarySource(panel);
  mqRenderSummaryPanel(panel, source);

  if (!source || typeof MutationObserver === 'undefined') return;

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => {
      scheduled = false;
      mqRenderSummaryPanel(panel, source);
      mqScheduleSummaryTracking();
    });
  });

  observer.observe(source, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function mqCreateSummaryPanel(title, scope) {
  const panel = document.createElement('aside');
  panel.className = 'mq-summary-panel';
  panel.dataset.mqSummaryScope = scope || 'page';
  panel.setAttribute('role', 'navigation');
  panel.setAttribute('aria-label', String(title || 'Summary'));
  return panel;
}

function mqResolveSummarySource(panel) {
  const scope = String((panel && panel.dataset && panel.dataset.mqSummaryScope) || 'page').toLowerCase();
  if (scope === 'scoped' || scope === 'local') {
    return (panel && panel._mqSummarySourceEl) || mqFindSummarySource(panel);
  }
  return document.querySelector('.mq-main');
}

function mqFindSummarySource(panel) {
  let source = panel ? panel.previousElementSibling : null;
  while (source) {
    if (!source.hasAttribute('data-mq-toc')) return source;
    source = source.previousElementSibling;
  }
  return null;
}

function mqRenderSummaryPanel(panel, source) {
  if (!panel) return;

  const headings = source ? mqCollectSummaryHeadings(source) : [];
  const scope = String((panel && panel.dataset && panel.dataset.mqSummaryScope) || 'page').toLowerCase();

  if (!headings.length) {
    const emptyText = (scope === 'scoped' || scope === 'local')
      ? 'Add headings in the previous block to populate this summary.'
      : 'Add headings to the page to populate this summary.';
    panel.innerHTML = `<p class="mq-summary-empty">${emptyText}</p>`;
    mqSyncSummaryTracking(panel, source);
    return;
  }

  panel.innerHTML = `<ol class="mq-summary-list">${headings.map(mqRenderSummaryHeading).join('')}</ol>`;
  mqSyncSummaryTracking(panel, source);
}

function mqCollectSummaryHeadings(source) {
  const headings = mqGetSummaryHeadingElements(source);
  if (!headings.length) return [];

  return headings.map(heading => ({
    level: Number(String(heading.tagName || 'H1').slice(1)) || 1,
    text: String(heading.textContent || '').replace(/\s+/g, ' ').trim(),
    id: String(heading.id || '').trim(),
  })).filter(item => item.text);
}

function mqGetSummaryHeadingElements(source) {
  const headings = Array.from(source.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .filter(heading => !heading.hasAttribute('data-mq-toc-hidden'));
  if (!headings.length) return [];

  const usedIds = new Set(
    Array.from(document.querySelectorAll('[id]'))
      .map(el => String(el.id || '').trim())
      .filter(Boolean)
  );

  headings.forEach((heading, index) => {
    mqEnsureSummaryHeadingId(heading, usedIds, index);
  });

  return headings.filter(heading => String(heading.id || '').trim());
}

function mqEnsureSummaryHeadingId(heading, usedIds, index) {
  const existing = String((heading && heading.id) || '').trim();
  if (existing) {
    usedIds.add(existing);
    return existing;
  }

  const base = mqSlugifySummaryValue(heading && heading.textContent ? heading.textContent : `summary-${index + 1}`);
  let candidate = base;
  let suffix = 2;

  while (!candidate || usedIds.has(candidate)) {
    candidate = `${base || 'section'}-${suffix}`;
    suffix += 1;
  }

  heading.id = candidate;
  usedIds.add(candidate);
  return candidate;
}

function mqSlugifySummaryValue(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function mqRenderSummaryHeading(item) {
  const level = Number(item && item.level) || 1;
  const text = mqEscapeHtml(item && item.text ? item.text : '');
  const href = mqEscapeHtml(item && item.id ? `#${item.id}` : '#');
  return `<li class="mq-summary-item mq-summary-level-${level}" data-mq-summary-level="${level}"><a class="mq-summary-link" href="${href}">${text}</a></li>`;
}

function mqSyncSummaryTracking(panel, source) {
  if (!panel) return;

  let tracker = panel._mqSummaryTracker;
  if (!tracker) {
    tracker = {
      activeId: '',
      headings: [],
      links: [],
      panel,
      source: null,
    };
    panel._mqSummaryTracker = tracker;
    mqSummaryTrackers.add(tracker);
  }

  tracker.panel = panel;
  tracker.source = source || null;
  tracker.headings = source ? mqGetSummaryHeadingElements(source) : [];
  tracker.links = Array.from(panel.querySelectorAll('.mq-summary-link'));

  if (!tracker.headings.length || !tracker.links.length) {
    mqApplySummaryActiveState(tracker, '');
    return;
  }

  mqEnsureSummaryTracking();
  mqScheduleSummaryTracking();
}

function mqEnsureSummaryTracking() {
  if (mqSummaryTrackingBound) return;
  mqSummaryTrackingBound = true;

  window.addEventListener('scroll', mqScheduleSummaryTracking, { passive: true });
  window.addEventListener('resize', mqScheduleSummaryTracking);
  window.addEventListener('hashchange', mqScheduleSummaryTracking);
}

function mqScheduleSummaryTracking() {
  if (mqSummaryTrackingScheduled) return;
  mqSummaryTrackingScheduled = true;

  window.requestAnimationFrame(() => {
    mqSummaryTrackingScheduled = false;
    mqUpdateSummaryTracking();
  });
}

function mqUpdateSummaryTracking() {
  mqSummaryTrackers.forEach(tracker => {
    if (!tracker || !tracker.panel || !tracker.panel.isConnected) {
      mqSummaryTrackers.delete(tracker);
      return;
    }

    if (!tracker.source || !tracker.source.isConnected) {
      mqApplySummaryActiveState(tracker, '');
      return;
    }

    const nextId = mqFindActiveSummaryId(tracker.headings);
    mqApplySummaryActiveState(tracker, nextId);
  });
}

function mqFindActiveSummaryId(headings) {
  if (!Array.isArray(headings) || !headings.length) return '';

  const visibleHeadings = headings.filter(heading => {
    if (!heading || !heading.isConnected) return false;
    return !!String(heading.id || '').trim();
  });
  if (!visibleHeadings.length) return '';
  if (mqSummaryReachedPageBottom()) {
    return String(visibleHeadings[visibleHeadings.length - 1].id || '').trim();
  }

  const activationLine = mqSummaryActivationLine();
  let activeId = String(visibleHeadings[0].id || '').trim();

  for (const heading of visibleHeadings) {
    const id = String(heading.id || '').trim();
    if (heading.getBoundingClientRect().top <= activationLine) {
      activeId = id;
      continue;
    }
    break;
  }

  return activeId;
}

function mqSummaryActivationLine() {
  const viewport = window.innerHeight || document.documentElement.clientHeight || 0;
  return Math.max(160, viewport * 0.5);
}

function mqSummaryReachedPageBottom() {
  const doc = document.documentElement;
  const body = document.body;
  const scrollTop = window.scrollY || doc.scrollTop || (body ? body.scrollTop : 0) || 0;
  const viewport = window.innerHeight || doc.clientHeight || 0;
  const scrollHeight = Math.max(
    doc.scrollHeight || 0,
    doc.offsetHeight || 0,
    body ? body.scrollHeight : 0,
    body ? body.offsetHeight : 0
  );

  return (scrollTop + viewport) >= (scrollHeight - 2);
}

function mqApplySummaryActiveState(tracker, activeId) {
  if (!tracker || !Array.isArray(tracker.links)) return;

  const nextId = String(activeId || '').trim();
  let activeLink = null;

  tracker.links.forEach(link => {
    const href = String((link && link.getAttribute && link.getAttribute('href')) || '').trim();
    const linkId = href.startsWith('#') ? href.slice(1) : '';
    const isActive = !!nextId && linkId === nextId;
    const item = link && typeof link.closest === 'function' ? link.closest('.mq-summary-item') : null;

    if (item) item.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'location');
      activeLink = link;
    } else {
      link.removeAttribute('aria-current');
    }
  });

  if (activeLink && tracker.activeId !== nextId) {
    mqKeepSummaryLinkInView(activeLink, tracker.panel);
  }

  tracker.activeId = nextId;
}

function mqKeepSummaryLinkInView(link, panel) {
  if (!link || !panel) return;

  const canScrollY = panel.scrollHeight > panel.clientHeight + 2;
  const canScrollX = panel.scrollWidth > panel.clientWidth + 2;
  if (!canScrollY && !canScrollX) return;

  const panelRect = panel.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  const padding = 14;
  const above = linkRect.top < (panelRect.top + padding);
  const below = linkRect.bottom > (panelRect.bottom - padding);
  const left = linkRect.left < (panelRect.left + padding);
  const right = linkRect.right > (panelRect.right - padding);

  if (above || below || left || right) {
    link.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

function mqHandleWindowResize() {
  document.querySelectorAll('.mq-nav.mq-nav-open').forEach(nav => {
    if (!mqIsCompactNav(nav)) mqCloseNav(nav);
  });
  mqPositionSubmenus();
  mqApplySearchShortcutHints();
}

function mqHandleDomReady() {
  mqPositionSubmenus();
  mqInitSearch();
  mqApplySearchShortcutHints();
  mqInitDropdownPersistence();
  mqInitSummaries();
}

function mqHandleNavPointerIntent(event) {
  if (event.target.closest('.mq-nav-group')) mqPositionSubmenus();
}

function mqHandleDocumentClick(event) {
  const nav = document.querySelector('.mq-nav.mq-nav-open');
  if (!nav) return;
  if (!event.target.closest('.mq-nav')) {
    mqCloseNav(nav);
    return;
  }

  const link = event.target.closest('.mq-nav a');
  if (link && mqIsCompactNav(nav)) {
    mqCloseNav(nav);
  }
}

function mqHandleGlobalKeydown(event) {
  const key = String(event.key || '').toLowerCase();
  const typing = mqIsTypingTarget(event.target);

  if ((event.ctrlKey || event.metaKey) && key === 'k') {
    event.preventDefault();
    mqOpenSearch();
    return;
  }

  if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey && key === '/') {
    event.preventDefault();
    mqOpenSearch();
    return;
  }

  if (event.key !== 'Escape') return;

  if (mqIsSearchOpen()) {
    event.preventDefault();
    mqCloseSearch();
    return;
  }

  document.querySelectorAll('.mq-nav.mq-nav-open').forEach(mqCloseNav);
}

async function mqHandleCodeCopy(event) {
  const btn = event.target.closest('.mq-code-copy');
  if (!btn) return;
  const block = btn.closest('.mq-code-block');
  const codeEl = block && block.querySelector('pre code');
  if (!codeEl) return;

  const source = codeEl.textContent || '';
  const original = btn.textContent;

  try {
    await navigator.clipboard.writeText(source);
    btn.textContent = 'Copied';
  } catch (_) {
    btn.textContent = 'Failed';
  }

  setTimeout(() => {
    btn.textContent = original;
  }, 1200);
}

window.addEventListener('resize', mqHandleWindowResize);

document.addEventListener('DOMContentLoaded', mqHandleDomReady);
document.addEventListener('mouseover', mqHandleNavPointerIntent);
document.addEventListener('focusin', mqHandleNavPointerIntent);
document.addEventListener('click', mqHandleDocumentClick);
document.addEventListener('keydown', mqHandleGlobalKeydown);
document.addEventListener('click', mqHandleCodeCopy);
