'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('demo', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      if (Array.isArray(node.children) && node.children.length) return;

      diagnostics.push(createDiagnostic({
        level: DiagnosticLevel.WARNING,
        code: 'MQ361',
        message: '@demo has no child content to render.',
        suggestions: [{ message: 'put the example markup inside the demo block' }],
      }));
    },
    style: `
.mq-demo {
  position: relative;
  margin: 1rem 0;
}

.mq-demo-toggle {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.mq-demo-head {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;
}

.mq-demo-tabs {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
}

.mq-demo-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.8rem;
  padding: 0.28rem 0.65rem;
  border: 1px solid transparent;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: inherit;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
}

.mq-demo-caption {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.88;
}

.mq-demo-copy {
  margin-left: auto;
}

.mq-demo-caption + .mq-demo-copy {
  margin-left: 0;
}

.mq-demo-panel {
  border: 1px solid var(--mq-code-border, var(--mq-border, rgba(0, 0, 0, 0.14)));
  border-top: 0;
  border-radius: 0 0 var(--mq-radius, 8px) var(--mq-radius, 8px);
}

.mq-demo-panel-preview {
  display: block;
  padding: 1rem 1.1rem;
  background: var(--mq-demo-preview-bg, var(--mq-surface, #ffffff));
  color: var(--mq-demo-preview-text, var(--mq-text, inherit));
}

.mq-demo-panel-preview > :first-child {
  margin-top: 0;
}

.mq-demo-panel-preview > :last-child {
  margin-bottom: 0;
}

.mq-demo-panel-code {
  display: none;
  background: var(--mq-code-bg, #1e1c18);
  color: var(--mq-code-text, #e8e4dc);
}

.mq-demo-panel-code pre {
  margin: 0;
  padding: 1rem 1.1rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
}

.mq-demo-toggle-preview:checked ~ .mq-demo-head .mq-demo-tab-preview,
.mq-demo-toggle-code:checked ~ .mq-demo-head .mq-demo-tab-code {
  opacity: 1;
  background: var(--mq-code-copy-bg, rgba(255, 255, 255, 0.07));
  border-color: var(--mq-code-copy-border, rgba(255, 255, 255, 0.25));
}

.mq-demo-toggle-preview:checked ~ .mq-demo-panel-preview {
  display: block;
}

.mq-demo-toggle-preview:checked ~ .mq-demo-panel-code {
  display: none;
}

.mq-demo-toggle-code:checked ~ .mq-demo-panel-preview {
  display: none;
}

.mq-demo-toggle-code:checked ~ .mq-demo-panel-code {
  display: block;
}

.mq-demo-toggle-preview:checked ~ .mq-demo-head .mq-demo-copy {
  opacity: 0.45;
  pointer-events: none;
}

.mq-demo-toggle-code:checked ~ .mq-demo-head .mq-demo-copy {
  opacity: 1;
  pointer-events: auto;
}

@media (max-width: 640px) {
  .mq-demo-head {
    align-items: stretch;
  }

  .mq-demo-caption {
    display: none;
  }

  .mq-demo-copy {
    margin-left: 0;
  }
}
`,
    render: ({ mods, name, children, nodes, node, opts, ctx }) => {
      const demoId = `mq-demo-${Number(node && node.loc && node.loc.start_line) || 0}-${Number(node && node.loc && node.loc.start_col) || 0}`;
      const previewId = `${demoId}-preview`;
      const codeId = `${demoId}-code`;
      const defaultCode = (mods || []).some(mod => /^code$/i.test(String(mod || '')));
      const caption = String(name || '').trim();
      const captionHtml = caption ? `<span class="mq-demo-caption">${escapeHtml(caption)}</span>` : '';
      const code = escapeHtml(extractDemoSource(nodes || [], opts));
      const copyLabel = 'Copy';

      return `<div class="mq-code-block mq-demo" data-lang="mq"><input class="mq-demo-toggle mq-demo-toggle-preview" type="radio" name="${ctx.escapeAttr(demoId)}" id="${ctx.escapeAttr(previewId)}"${defaultCode ? '' : ' checked'}><input class="mq-demo-toggle mq-demo-toggle-code" type="radio" name="${ctx.escapeAttr(demoId)}" id="${ctx.escapeAttr(codeId)}"${defaultCode ? ' checked' : ''}><div class="mq-code-head mq-demo-head"><div class="mq-demo-tabs"><label class="mq-demo-tab mq-demo-tab-preview" for="${ctx.escapeAttr(previewId)}">Preview</label><label class="mq-demo-tab mq-demo-tab-code" for="${ctx.escapeAttr(codeId)}">Syntax</label></div>${captionHtml}<button class="mq-code-copy mq-demo-copy" type="button" aria-label="Copy mq code">${copyLabel}</button></div><div class="mq-demo-panel mq-demo-panel-preview">${children}</div><div class="mq-demo-panel mq-demo-panel-code"><pre><code class="hljs language-mq">${code}</code></pre></div></div>`;
    },
  });
};

function extractDemoSource(nodes, opts = {}) {
  const sourceLines = Array.isArray(opts && opts._mqSourceLines) ? opts._mqSourceLines : null;
  const located = Array.isArray(nodes) ? nodes.filter(node => node && node.loc && Number.isFinite(node.loc.start_line)) : [];

  if (sourceLines && located.length) {
    const start = Math.max(1, Math.min(...located.map(node => Number(node.loc.start_line) || 1)));
    const end = Math.max(start, Math.max(...located.map(node => Number(node.loc.end_line || node.loc.start_line) || start)));
    const snippet = sourceLines.slice(start - 1, end).join('\n');
    return dedentBlock(snippet);
  }

  return serializeNodes(nodes || []);
}

function serializeNodes(nodes, depth = 0) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => serializeNode(node, depth)).filter(Boolean).join('\n');
}

function serializeNode(node, depth = 0) {
  if (!node || typeof node !== 'object') return '';
  if (node.type === 'markdown') return String(node.content || '');
  if (node.type === 'hr') return '---';
  if (node.type !== 'directive') return '';

  const mods = Array.isArray(node.mods) ? node.mods.map(mod => `.${mod}`).join(' ') : '';
  const name = formatDirectiveName(node.name);
  const open = `@${node.tag}${mods ? ` ${mods}` : ''}${name ? ` ${name}` : ''}`;
  if (node.inline) return open;

  const children = serializeNodes(node.children || [], depth + 1);
  if (!children.trim()) return `${open}\n@end ${node.tag}`;
  const indented = indentBlock(children, '  ');
  return `${open}\n${indented}\n@end ${node.tag}`;
}

function formatDirectiveName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  return /\s/.test(raw) ? `"${raw.replace(/"/g, '\\"')}"` : raw;
}

function indentBlock(text, indent = '  ') {
  return String(text || '').split('\n').map(line => line ? `${indent}${line}` : '').join('\n');
}

function dedentBlock(text) {
  const lines = String(text || '').split('\n');
  let minIndent = Infinity;

  for (const line of lines) {
    if (!String(line || '').trim()) continue;
    const indent = (String(line).match(/^[ \t]*/) || [''])[0].length;
    if (indent < minIndent) minIndent = indent;
  }

  if (!Number.isFinite(minIndent) || minIndent <= 0) return lines.join('\n').trim();
  return lines.map(line => line.slice(Math.min(minIndent, line.length))).join('\n').trim();
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
