'use strict';

const fs = require('fs');

const DiagnosticLevel = Object.freeze({
  ERROR: 'Error',
  WARNING: 'Warning',
  NOTE: 'Note',
});

function createDiagnostic({ level, message, code = null, spans = [], suggestions = [] }) {
  return { level, message, code, spans, suggestions };
}

function createDiagnosticError(diagnostic) {
  const err = new Error(diagnostic && diagnostic.message ? diagnostic.message : 'Build failed');
  err.diagnostic = diagnostic;
  return err;
}

function formatDiagnostic(diagnostic) {
  if (!diagnostic || !diagnostic.message) return 'Build error: Unknown diagnostic';

  const level = String(diagnostic.level || DiagnosticLevel.ERROR);
  const codeSuffix = diagnostic.code ? `[${diagnostic.code}]` : '';
  const lines = [`${level.toLowerCase()}${codeSuffix}: ${diagnostic.message}`];

  const span = Array.isArray(diagnostic.spans) && diagnostic.spans.length ? diagnostic.spans[0] : null;
  if (span && span.file) {
    const startLine = Math.max(1, parseInt(span.start_line || 1, 10));
    const startCol = Math.max(1, parseInt(span.start_col || 1, 10));
    lines.push(` --> ${span.file}:${startLine}:${startCol}`);

    const lineText = readLine(span.file, startLine);
    if (lineText) {
      const gutter = String(startLine).length;
      const endColRaw = parseInt(span.end_col || startCol, 10);
      const endCol = Number.isFinite(endColRaw) ? Math.max(startCol, endColRaw) : startCol;
      const caretLen = Math.max(1, endCol - startCol + 1);
      lines.push('  |');
      lines.push(`${String(startLine).padStart(gutter, ' ')} | ${lineText}`);
      lines.push(`${' '.repeat(gutter)} | ${' '.repeat(startCol - 1)}${'^'.repeat(caretLen)}`);
      lines.push('  |');
    }
  }

  if (Array.isArray(diagnostic.suggestions)) {
    for (const suggestion of diagnostic.suggestions) {
      if (!suggestion || !suggestion.message) continue;
      lines.push(`  = help: ${suggestion.message}`);
      if (suggestion.replacement) {
        lines.push(`  = try: ${suggestion.replacement}`);
      }
    }
  }

  return lines.join('\n');
}

function readLine(filePath, lineNumber) {
  if (!filePath || !fs.existsSync(filePath)) return '';
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const idx = Math.max(0, (parseInt(lineNumber || 1, 10) || 1) - 1);
  return lines[idx] || '';
}

module.exports = {
  DiagnosticLevel,
  createDiagnostic,
  createDiagnosticError,
  formatDiagnostic,
};
