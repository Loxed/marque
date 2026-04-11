'use strict';

const MAC_MAP = {
  ctrl:  '⌘',
  alt:   '⌥',
  shift: '⇧',
  meta:  '⌘',
  win:   '⌘',
};

const WIN_MAP = {
  ctrl:  'Ctrl',
  alt:   'Alt',
  shift: 'Shift',
  meta:  'Win',
  win:   'Win',
};

const KEY_ALIASES = {
  control: 'ctrl',
  cmd: 'ctrl',
  command: 'ctrl',
  option: 'alt',
};

module.exports = ({ defineDirective }) => {
  defineDirective('kbd', {
    type: 'inline',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const label = String(node.name || '').trim();
      if (!label) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ421',
          message: '@kbd is missing a key combo.',
          suggestions: [{ message: 'add a key combo after @kbd, e.g. @kbd Ctrl+K' }],
        }));
      }
    },
    script: `
(function () {
  var MAC_MAP = { ctrl: '⌘', alt: '⌥', shift: '⇧', meta: '⌘', win: '⌘' };

  function detectPlatform() {
    var ua = navigator.userAgent || '';
    var platform = (navigator.userAgentData && navigator.userAgentData.platform)
      || navigator.platform
      || '';

    if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua) || /iPhone|iPad/.test(platform)) {
      return 'mobile';
    }
    if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) {
      return 'mac';
    }
    return 'win';
  }

  function applyPlatform() {
    var platform = detectPlatform();

    if (platform === 'mobile') {
      document.documentElement.classList.add('mq-mobile');
      return;
    }

    if (platform !== 'mac') return;

    // Auto-swap: only touch elements with no forced platform
    document.querySelectorAll('.mq-kbd:not([data-kbd-platform]) kbd[data-key]').forEach(function (kbd) {
      var key = kbd.getAttribute('data-key');
      var mapped = MAC_MAP[key];
      if (mapped) kbd.textContent = mapped;
    });

    // Force-mac swap: always apply mac map
    document.querySelectorAll('.mq-kbd[data-kbd-platform="mac"] kbd[data-key]').forEach(function (kbd) {
      var key = kbd.getAttribute('data-key');
      var mapped = MAC_MAP[key];
      if (mapped) kbd.textContent = mapped;
    });

    // Force-win: no swap needed, already rendered as win keys
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPlatform);
  } else {
    applyPlatform();
  }
})();
`,
    render: ({ mods, name, ctx }) => {
      // Strip surrounding quotes (Marque may preserve them for inline directives)
      const raw = String(name || '').trim().replace(/^["']|["']$/g, '');
      if (!raw) return '';

      const forceMac = mods.includes('mac');
      const forceWin = mods.includes('win');
      const platformAttr = forceMac ? ' data-kbd-platform="mac"' : forceWin ? ' data-kbd-platform="win"' : '';

      // Split on +, trim each part
      const parts = raw.split('+').map(p => p.trim()).filter(Boolean);

      const keysHtml = parts.map((part, i) => {
        const key = normalizeKeyToken(part);
        const keyLower = key.toLowerCase();
        const isModifier = keyLower in WIN_MAP;

        // For force-mac, swap immediately at render time
        // For force-win, always use win labels
        // For auto (no modifier), render win label with data-key so JS can swap at runtime
        let display;
        if (forceMac) {
          display = MAC_MAP[keyLower] || key;
        } else {
          display = WIN_MAP[keyLower] || key;
        }

        const dataKey = isModifier && !forceMac && !forceWin ? ` data-key="${ctx.escapeAttr(keyLower)}"` : '';
        const sep = i < parts.length - 1 ? '<span class="mq-kbd-sep" aria-hidden="true">+</span>' : '';
        return `<kbd${dataKey}>${escapeHtml(display)}</kbd>${sep}`;
      }).join('');

      return `<span class="mq-kbd"${platformAttr}>${keysHtml}</span>`;
    },
  });
};

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeKeyToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lower = raw.toLowerCase();
  if (KEY_ALIASES[lower]) return KEY_ALIASES[lower];
  if (lower in WIN_MAP) return lower;
  return raw;
}
