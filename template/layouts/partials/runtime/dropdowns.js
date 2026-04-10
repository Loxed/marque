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
