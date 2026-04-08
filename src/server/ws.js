'use strict';

const { WebSocketServer, WebSocket } = require('ws');

/**
 * Start a WebSocket server on `port` and return a `broadcast()` function
 * that sends a `'reload'` message to all connected clients.
 */
function createWsServer(port) {
  return new Promise((resolve, reject) => {
    let wss;

    try {
      wss = new WebSocketServer({ port });
    } catch (err) {
      reject(err);
      return;
    }

    function broadcast() {
      wss.clients.forEach(c => {
        if (c.readyState === WebSocket.OPEN) c.send('reload');
      });
    }

    const onListening = () => {
      cleanup();
      resolve({ wss, broadcast });
    };
    const onError = (err) => {
      cleanup();
      try { wss.close(); } catch (_) {}
      reject(err);
    };
    const cleanup = () => {
      wss.removeListener('listening', onListening);
      wss.removeListener('error', onError);
    };

    wss.once('listening', onListening);
    wss.once('error', onError);
  });
}

module.exports = { createWsServer };
