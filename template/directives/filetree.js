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
