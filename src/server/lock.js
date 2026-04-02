'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * Write a `.marque-serve.lock` file in `siteDir`.
 * Throws if another live process already owns the lock.
 * Returns a `release()` function that deletes the lock.
 */
function acquireServeLock(siteDir, port) {
  const lockPath = path.join(siteDir, '.marque-serve.lock');
  const now      = new Date().toISOString();

  if (fs.existsSync(lockPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      const pid  = parseInt(data.pid, 10);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, 0); // throws ESRCH if dead
          throw new Error(
            `Another marque serve process is already running for this site ` +
            `(pid ${pid}, port ${data.port || 'unknown'}). Stop it first.`,
          );
        } catch (err) {
          if (err && err.code !== 'ESRCH') throw err;
          // stale lock — safe to replace
        }
      }
    } catch (err) {
      if (/Another marque serve process/.test(String(err && err.message))) throw err;
      // malformed lock — replace
    }
  }

  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, port, startedAt: now }, null, 2));

  return function release() {
    if (!fs.existsSync(lockPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
      if (parseInt(data.pid, 10) !== process.pid) return; // not ours
    } catch (_) { /* best effort */ }
    try { fs.rmSync(lockPath, { force: true }); } catch (_) {}
  };
}

module.exports = { acquireServeLock };