'use strict';

const { formatDiagnostic } = require('../diagnostics');

function printDiagnostic(diagnostic, options = {}) {
  const suppressUnchanged = options && options.suppressUnchanged === true;
  const cache = options && options.cache instanceof Set ? options.cache : null;
  const key = diagnosticKey(diagnostic);
  if (suppressUnchanged && cache && cache.has(key)) {
    return false;
  }
  if (suppressUnchanged && cache) {
    cache.add(key);
  }

  const level = String((diagnostic && diagnostic.level) || '').toLowerCase();
  const label = level === 'warning' ? 'Build warning' : level === 'note' ? 'Build note' : 'Build error';
  const out = `\n${label}\n${formatDiagnostic(diagnostic)}\n`;
  if (level === 'warning') {
    console.warn(out);
  } else if (level === 'note') {
    console.info(out);
  } else {
    console.error(out);
  }
  return true;
}

function printBuildError(err, options = {}) {
  if (err && err.diagnostic) {
    printDiagnostic(err.diagnostic, options);
    return;
  }

  const message = String((err && err.message) || err || 'Unknown build error');
  const suppressUnchanged = options && options.suppressUnchanged === true;
  const cache = options && options.cache instanceof Set ? options.cache : null;
  const key = `plain:${message}`;
  if (suppressUnchanged && cache && cache.has(key)) {
    return;
  }
  if (suppressUnchanged && cache) {
    cache.add(key);
  }

  if (/^error\[MQ\d+\]:/m.test(message)) {
    console.error(`\nBuild error\n${message}\n`);
  } else {
    console.error(`\nBuild error: ${message}\n`);
  }
}

function diagnosticKey(diagnostic) {
  if (!diagnostic || typeof diagnostic !== 'object') return 'diag:unknown';
  const spans = Array.isArray(diagnostic.spans) ? diagnostic.spans : [];
  const suggestions = Array.isArray(diagnostic.suggestions) ? diagnostic.suggestions : [];
  return JSON.stringify({
    level: diagnostic.level || 'Error',
    code: diagnostic.code || null,
    message: diagnostic.message || '',
    spans,
    suggestions,
  });
}

module.exports = { printBuildError, printDiagnostic };