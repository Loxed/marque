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
