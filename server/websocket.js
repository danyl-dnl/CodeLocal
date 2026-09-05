const { WebSocket, WebSocketServer } = require("ws");

function setupWebSocketServer(httpServer) {
  // Express serves pages over short-lived HTTP requests. The WebSocket server
  // shares that HTTP server and keeps one connection open for each browser.
  const webSocketServer = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });

  function broadcastClientCount() {
    const message = JSON.stringify({
      type: "client-count",
      count: webSocketServer.clients.size,
    });

    // Everyone receives the new total so every open workspace stays current.
    for (const client of webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }

    console.log(`Connected clients: ${webSocketServer.clients.size}`);
  }

  webSocketServer.on("connection", (client) => {
    // A newly opened browser is now part of the active client set.
    client.isAlive = true;
    console.log("WebSocket client connected");
    broadcastClientCount();

    client.on("pong", () => {
      client.isAlive = true;
    });

    client.on("close", () => {
      // ws removes closed connections before this event is handled.
      console.log("WebSocket client disconnected");
      broadcastClientCount();
    });

    client.on("error", (error) => {
      console.error(`WebSocket client error: ${error.message}`);
    });
  });

  // A small heartbeat removes connections left behind when a device vanishes
  // without completing a normal WebSocket close handshake.
  const heartbeat = setInterval(() => {
    for (const client of webSocketServer.clients) {
      if (!client.isAlive) {
        client.terminate();
        continue;
      }

      client.isAlive = false;
      client.ping();
    }
  }, 30_000);

  webSocketServer.on("close", () => clearInterval(heartbeat));

  return webSocketServer;
}

module.exports = { setupWebSocketServer };
