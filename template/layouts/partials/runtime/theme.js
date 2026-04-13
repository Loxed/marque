const mqThemeState = {
  config: null,
  currentLabel: null,
  initialized: false,
  select: null,
  switcher: null,
};

function mqGetThemeConfig() {
  if (mqThemeState.config) return mqThemeState.config;
  const config = window.__mqThemeConfig;
  if (!config || typeof config !== 'object') return null;
  mqThemeState.config = config;
  return config;
}

function mqGetThemeStylesheet() {
  return document.getElementById('mq-theme-stylesheet');
}

function mqGetStoredThemeName(config) {
  let value = '';

  mqSafeLocalStorage(storage => {
    value = String(storage.getItem(config.storageKey) || '').trim();
  });

  return value;
}

function mqPersistThemeName(config, themeName) {
  mqSafeLocalStorage(storage => {
    if (!themeName || themeName === config.defaultTheme) {
      storage.removeItem(config.storageKey);
      return;
    }

    storage.setItem(config.storageKey, themeName);
  });
}

function mqResolveThemeName(config) {
  if (!config || !config.themes) return '';

  const pageTheme = String(config.pageTheme || config.defaultTheme || '').trim();
  if (!config.canSwitch) return pageTheme;

  const stored = mqGetStoredThemeName(config);
  if (stored && config.themes[stored]) return stored;
  return pageTheme;
}

function mqApplyThemeName(themeName, options) {
  const config = mqGetThemeConfig();
  if (!config || !config.themes) return;

  const settings = options && typeof options === 'object' ? options : {};
  const target = String(themeName || '').trim();
  const theme = config.themes[target];
  if (!theme || !theme.href) return;

  const link = mqGetThemeStylesheet();
  if (!link) return;

  link.href = theme.href;
  link.setAttribute('data-theme-name', target);
  document.documentElement.setAttribute('data-mq-theme', target);

  if (mqThemeState.select) {
    mqThemeState.select.value = target;
  }

  if (mqThemeState.currentLabel) {
    mqThemeState.currentLabel.textContent = theme.label || target;
  }

  if (settings.persist !== false && config.canSwitch) {
    mqPersistThemeName(config, target);
  }
}

function mqInitThemeSwitcher() {
  const config = mqGetThemeConfig();
  if (mqThemeState.initialized || !config || !config.themes) return;

  mqThemeState.initialized = true;
  mqThemeState.switcher = document.querySelector('[data-theme-switcher]');
  mqThemeState.select = document.querySelector('[data-theme-select]');
  mqThemeState.currentLabel = document.querySelector('[data-theme-current]');

  mqApplyThemeName(mqResolveThemeName(config), { persist: false });

  if (!config.canSwitch || !mqThemeState.select) return;

  mqThemeState.select.addEventListener('change', event => {
    const nextTheme = String(event.target && event.target.value || '').trim();
    if (!nextTheme) return;
    mqApplyThemeName(nextTheme);

    if (mqThemeState.switcher) {
      mqThemeState.switcher.open = false;
    }
  });
}
