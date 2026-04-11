'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('tab', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const label = String(node.name || '').trim();
      if (!label) {
        diagnostics.push(createDiagnostic({
          level: DiagnosticLevel.WARNING,
          code: 'MQ401',
          message: '@tab is missing a label.',
          suggestions: [{ message: 'add a label after @tab, e.g. @tab Windows' }],
        }));
      }
    },
    style: `
.mq-tabs {
  margin: 1rem 0;
  border: 1px solid var(--mq-border);
  border-radius: var(--mq-radius);
  overflow: clip;
}

.mq-tabs-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  border-bottom: 1px solid var(--mq-border);
  background: var(--mq-code-bg, #1e1c18);
  overflow-x: auto;
  scrollbar-width: none;
}

.mq-tabs-bar::-webkit-scrollbar {
  display: none;
}

.mq-tabs-btn {
  padding: 0.55rem 1.1rem;
  font-size: 0.82rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--mq-code-text, #e8e4dc);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  opacity: 0.55;
  transition: opacity 0.15s ease, border-color 0.15s ease;
  margin-bottom: -1px;
}

.mq-tabs-btn:hover {
  opacity: 0.85;
}

.mq-tabs-btn[aria-selected="true"] {
  opacity: 1;
  border-bottom-color: var(--mq-primary, #e8e4dc);
}

.mq-tab-panel {
  display: none;
  padding: 1rem 1.1rem;
  background: var(--mq-surface);
}

.mq-tab-panel.active {
  display: block;
}

.mq-tab-panel > :first-child {
  margin-top: 0;
}

.mq-tab-panel > :last-child {
  margin-bottom: 0;
}

/* raw tab items before JS groups them */
.mq-tab-item {
  display: none;
}
`,
    script: `
(function () {
  function groupTabs(root) {
    var items = Array.from((root || document).querySelectorAll('.mq-tab-item'));
    if (!items.length) return;

    var visited = new WeakSet();

    items.forEach(function (item) {
      if (visited.has(item)) return;

      // Collect the run of consecutive .mq-tab-item siblings
      var group = [];
      var node = item;
      while (node && node.classList && node.classList.contains('mq-tab-item')) {
        group.push(node);
        visited.add(node);
        // nextElementSibling only — any non-tab element breaks the group
        node = node.nextElementSibling;
      }

      if (!group.length) return;

      // Build tabs container
      var tabs = document.createElement('div');
      tabs.className = 'mq-tabs';

      var bar = document.createElement('div');
      bar.className = 'mq-tabs-bar';
      bar.setAttribute('role', 'tablist');

      var panels = [];

      group.forEach(function (tabItem, i) {
        var label = tabItem.getAttribute('data-label') || ('Tab ' + (i + 1));
        var panelId = 'mq-tab-panel-' + Math.random().toString(36).slice(2);
        var btnId = 'mq-tab-btn-' + Math.random().toString(36).slice(2);

        // Button
        var btn = document.createElement('button');
        btn.className = 'mq-tabs-btn';
        btn.type = 'button';
        btn.textContent = label;
        btn.id = btnId;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-controls', panelId);
        btn.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        bar.appendChild(btn);

        // Panel
        var panel = document.createElement('div');
        panel.className = 'mq-tab-panel' + (i === 0 ? ' active' : '');
        panel.id = panelId;
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', btnId);
        panel.innerHTML = tabItem.innerHTML;
        panels.push(panel);
      });

      // Click handling
      bar.addEventListener('click', function (e) {
        var btn = e.target.closest('.mq-tabs-btn');
        if (!btn) return;
        var btns = Array.from(bar.querySelectorAll('.mq-tabs-btn'));
        var idx = btns.indexOf(btn);
        if (idx < 0) return;
        btns.forEach(function (b, i) {
          b.setAttribute('aria-selected', i === idx ? 'true' : 'false');
        });
        panels.forEach(function (p, i) {
          p.classList.toggle('active', i === idx);
        });
      });

      tabs.appendChild(bar);
      panels.forEach(function (p) { tabs.appendChild(p); });

      // Replace the first item with the tabs group, remove the rest
      group[0].parentNode.insertBefore(tabs, group[0]);
      group.forEach(function (el) { el.parentNode.removeChild(el); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { groupTabs(document); });
  } else {
    groupTabs(document);
  }
})();
`,
    render: ({ name, children, ctx }) => {
      const label = ctx.escapeAttr(String(name || '').trim());
      return `<div class="mq-tab-item" data-label="${label}">${children}</div>`;
    },
  });
};