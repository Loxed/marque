'use strict';

module.exports = ({ defineDirective }) => {
  defineDirective('filetree', {
    type: 'block',
    validate: (node, { diagnostics }, { createDiagnostic, DiagnosticLevel }) => {
      const text = collectPlainText(node.children || []).trim();
      if (text) return;

      diagnostics.push(createDiagnostic({
        level: DiagnosticLevel.WARNING,
        code: 'MQ351',
        message: '@filetree has no visible text content.',
        suggestions: [{ message: 'put the directory tree lines inside the block body' }],
      }));
    },
    style: `
.mq-filetree {
  margin: 1rem 0;
}

.mq-filetree .mq-code-head {
  justify-content: flex-start;
}

.mq-filetree-caption {
  margin-left: auto;
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.9;
}

.mq-filetree-body {
  margin: 0;
  padding: 1rem 1.15rem 1.05rem 1rem;
  border: 1px solid var(--mq-code-border, var(--mq-border));
  border-top: 0;
  border-radius: 0 0 var(--mq-radius) var(--mq-radius);
  background: var(--mq-code-bg, #1e1c18);
  color: var(--mq-code-text, #e8e4dc);
  overflow-x: auto;
}

.mq-filetree-list,
.mq-filetree-list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.mq-filetree-list {
  min-width: max-content;
}

.mq-filetree-list ul {
  position: relative;
  margin-top: 0.08rem;
  margin-left: 0.2rem;
  padding-left: 1.15rem;
}

.mq-filetree-list ul::before {
  content: '';
  position: absolute;
  left: 0.25rem;
  top: 0;
  bottom: 0.9rem;
  width: 1px;
  background: var(--mq-filetree-line, color-mix(in srgb, var(--mq-code-text, #e8e4dc) 22%, transparent));
}

.mq-filetree-list li {
  position: relative;
  margin: 0;
  padding: 0.08rem 0;
}

.mq-filetree-list ul > li::before {
  content: '';
  position: absolute;
  left: -0.9rem;
  top: 0.92rem;
  width: 0.9rem;
  height: 1px;
  background: var(--mq-filetree-line, color-mix(in srgb, var(--mq-code-text, #e8e4dc) 22%, transparent));
}

.mq-filetree-list ul > li:last-child::after {
  content: '';
  position: absolute;
  left: -0.9rem;
  top: 0.98rem;
  bottom: -0.08rem;
  width: 0.9rem;
  background: var(--mq-code-bg, #1e1c18);
}

.mq-filetree-entry {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
  min-width: 0;
  white-space: nowrap;
}

.mq-filetree-marker {
  width: 0.56rem;
  height: 0.56rem;
  margin-top: 0.18rem;
  flex: 0 0 0.56rem;
  border-radius: 999px;
  background: var(--mq-filetree-file, color-mix(in srgb, var(--mq-code-text, #e8e4dc) 54%, transparent));
}

.mq-filetree-file > .mq-filetree-entry > .mq-filetree-marker {
  background: var(--mq-filetree-file, color-mix(in srgb, var(--mq-code-text, #e8e4dc) 78%, transparent));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--mq-code-text, #e8e4dc) 24%, transparent);
}

.mq-filetree-folder > .mq-filetree-entry > .mq-filetree-marker {
  border-radius: 2px;
  background: var(--mq-filetree-folder, var(--mq-code-head-text, var(--mq-primary, #e8e4dc)));
}

.mq-filetree-root > .mq-filetree-entry > .mq-filetree-marker {
  width: 0.65rem;
  height: 0.65rem;
  flex-basis: 0.65rem;
  margin-top: 0.14rem;
}

.mq-filetree-name {
  font-family: var(--mq-font-mono, ui-monospace, monospace);
  font-size: 0.92rem;
  line-height: 1.55;
  color: inherit;
}

.mq-filetree-file > .mq-filetree-entry > .mq-filetree-name {
  font-weight: 600;
  color: var(--mq-filetree-file-text, var(--mq-code-text, #e8e4dc));
}

.mq-filetree-folder > .mq-filetree-entry > .mq-filetree-name,
.mq-filetree-root > .mq-filetree-entry > .mq-filetree-name {
  font-weight: 700;
  color: var(--mq-filetree-folder, var(--mq-code-head-text, var(--mq-primary, #e8e4dc)));
}

.mq-filetree-comment {
  color: color-mix(in srgb, var(--mq-code-text, #e8e4dc) 42%, transparent);
}

@media (max-width: 640px) {
  .mq-filetree-body {
    padding-right: 0.9rem;
  }

  .mq-filetree-caption {
    display: none;
  }
}
`,
    render: ({ name, nodes }) => {
      const text = collectPlainText(nodes || []).replace(/^\s*\n/, '').replace(/\n\s*$/, '');
      const tree = buildTree(parseTreeItems(text));
      const caption = String(name || '').trim();
      const captionHtml = caption ? `<span class="mq-filetree-caption">${escapeHtml(caption)}</span>` : '';
      const body = tree.length
        ? renderTreeList(tree, { root: true })
        : '<div class="mq-filetree-entry"><span class="mq-filetree-name">No tree items.</span></div>';

      return `<div class="mq-code-block mq-filetree" data-lang="tree"><div class="mq-code-head"><span class="mq-code-lang">${captionHtml}</span></div><div class="mq-filetree-body">${body}</div></div>`;
    },
  });
};

function collectPlainText(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => {
    if (!node || typeof node !== 'object') return '';
    if (node.type === 'markdown') return String(node.content || '');
    if (Array.isArray(node.children) && node.children.length) return collectPlainText(node.children);
    return '';
  }).join('\n');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseTreeItems(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map(line => parseTreeLine(line))
    .filter(Boolean);
}

function parseTreeLine(line) {
  const raw = String(line || '').replace(/\t/g, '  ').replace(/\s+$/, '');
  if (!raw.trim()) return null;

  const dashed = raw.match(/^\s*(-+)\s*(.+)$/);
  if (dashed) {
    return finalizeTreeLine(dashed[2], dashed[1].length);
  }

  const ascii = raw.match(/^([\s|│]*)(?:[├└]──)\s*(.+)$/u);
  if (ascii) {
    const normalizedPrefix = ascii[1].replace(/[|│]/g, ' ');
    const depth = Math.floor(normalizedPrefix.length / 4) + 1;
    return finalizeTreeLine(ascii[2], depth);
  }

  return finalizeTreeLine(raw, 0);
}

function finalizeTreeLine(rawLabel, depth) {
  const trimmed = String(rawLabel || '').trim();
  if (!trimmed) return null;

  const commentIndex = trimmed.search(/\s+#\s+/);
  const label = commentIndex >= 0 ? trimmed.slice(0, commentIndex).trim() : trimmed;
  const comment = commentIndex >= 0 ? trimmed.slice(commentIndex).replace(/^\s+#\s+/, '').trim() : '';

  if (!label) return null;
  return {
    depth: Math.max(0, parseInt(depth, 10) || 0),
    label,
    comment: comment || null,
  };
}

function buildTree(items) {
  const roots = [];
  const stack = [];

  for (const item of items) {
    const depth = Math.max(0, Math.min(item.depth, stack.length));
    while (stack.length > depth) stack.pop();

    const node = {
      label: item.label,
      comment: item.comment,
      children: [],
    };

    if (!stack.length) roots.push(node);
    else stack[stack.length - 1].children.push(node);

    stack.push(node);
  }

  return roots;
}

function renderTreeList(nodes, meta = {}) {
  const cls = meta.root ? 'mq-filetree-list mq-filetree-root-list' : 'mq-filetree-list';
  return `<ul class="${cls}">${nodes.map((node, index) => renderTreeNode(node, {
    root: !!meta.root,
    last: index === nodes.length - 1,
  })).join('')}</ul>`;
}

function renderTreeNode(node, meta = {}) {
  const children = Array.isArray(node.children) ? node.children : [];
  const isFolder = children.length > 0 || /\/$/.test(String(node.label || ''));
  const classes = [
    'mq-filetree-item',
    isFolder ? 'mq-filetree-folder' : 'mq-filetree-file',
    meta.root ? 'mq-filetree-root' : '',
    meta.last ? 'mq-filetree-last' : '',
  ].filter(Boolean).join(' ');

  const commentHtml = node.comment ? `<span class="mq-filetree-comment"># ${escapeHtml(node.comment)}</span>` : '';
  const childrenHtml = children.length ? renderTreeList(children) : '';

  return `<li class="${classes}"><div class="mq-filetree-entry"><span class="mq-filetree-marker" aria-hidden="true"></span><span class="mq-filetree-name">${escapeHtml(node.label)}</span>${commentHtml}</div>${childrenHtml}</li>`;
}
