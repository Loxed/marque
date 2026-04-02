'use strict';

const { WebSocketServer, WebSocket } = require('ws');

/**
 * Start a WebSocket server on `port` and return a `broadcast()` function
 * that sends a `'reload'` message to all connected clients.
 */
function createWsServer(port) {
  const wss = new WebSocketServer({ port });

  function broadcast() {
    wss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send('reload');
    });
  }

  return { wss, broadcast };
}

module.exports = { createWsServer };