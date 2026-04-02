'use strict';

function printBuildError(err) {
  const message = String((err && err.message) || err || 'Unknown build error');
  if (/^error\[MQ\d+\]:/m.test(message)) {
    console.error(`\nBuild error\n${message}\n`);
  } else {
    console.error(`\nBuild error: ${message}\n`);
  }
}

module.exports = { printBuildError };