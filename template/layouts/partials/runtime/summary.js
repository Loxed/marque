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
