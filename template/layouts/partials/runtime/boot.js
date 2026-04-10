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
