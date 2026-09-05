const { WebSocket, WebSocketServer } = require("ws");
const Y = require("yjs");
const {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} = require("y-protocols/awareness");
const path = require("node:path");
const { createWorkspacePersistence } = require("./workspace");

const yjsMessageType = 1;
const awarenessMessageType = 2;

function createYjsMessage(update) {
  const message = new Uint8Array(update.length + 1);
  message[0] = yjsMessageType;
  message.set(update, 1);
  return message;
}

function createAwarenessMessage(update) {
  const message = new Uint8Array(update.length + 1);
  message[0] = awarenessMessageType;
  message.set(update, 1);
  return message;
}

function setupWebSocketServer(httpServer) {
  // Express serves pages over short-lived HTTP requests. The WebSocket server
  // shares that HTTP server and keeps one connection open for each browser.
  const webSocketServer = new WebSocketServer({
    server: httpServer,
    path: "/ws",
  });
  webSocketServer.on("error", (error) => {
    console.error(`WebSocket server error: ${error.message}`);
  });
  const sharedDocument = new Y.Doc();
  const awareness = new Awareness(sharedDocument);
  function broadcastControl(message) {
    const encoded = JSON.stringify(message);
    for (const client of webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(encoded);
        } catch (error) {
          console.warn(`Could not send control message: ${error.message}`);
        }
      }
    }
  }

  const workspace = createWorkspacePersistence(
    sharedDocument,
    path.join(__dirname, "..", "workspace"),
    {
      onError(sourceClient, message) {
        if (sourceClient?.readyState === WebSocket.OPEN) {
          sourceClient.send(JSON.stringify({ type: "workspace-error", message }));
        }
      },
      onStatus(status) {
        broadcastControl({ type: "save-status", ...status });
      },
      onRename(rename) {
        broadcastControl({ type: "file-renamed", ...rename });
      },
      onProjectReplace() {
        broadcastControl({ type: "project-replacing" });
      },
    },
  );

  sharedDocument.on("update", (update, sourceClient) => {
    const message = createYjsMessage(update);

    for (const client of webSocketServer.clients) {
      if (client !== sourceClient && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  });

  awareness.on("update", ({ added, updated, removed }, sourceClient) => {
    const changedClientIds = [...added, ...updated, ...removed];
    const message = createAwarenessMessage(
      encodeAwarenessUpdate(awareness, changedClientIds),
    );

    if (sourceClient?.awarenessClientIds) {
      for (const clientId of [...added, ...updated]) {
        sourceClient.awarenessClientIds.add(clientId);
      }

      for (const clientId of removed) {
        sourceClient.awarenessClientIds.delete(clientId);
      }
    }

    for (const client of webSocketServer.clients) {
      if (client !== sourceClient && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
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
    client.awarenessClientIds = new Set();
    console.log("WebSocket client connected");
    broadcastClientCount();

    // A full Yjs state update brings a new or returning browser up to date.
    client.send(createYjsMessage(Y.encodeStateAsUpdate(sharedDocument)));
    client.send(JSON.stringify({ type: "save-status", state: "saved" }));
    client.send(
      createAwarenessMessage(
        encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]),
      ),
    );

    client.on("message", async (data, isBinary) => {
      if (!isBinary) {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "rename-file") {
            const result = await workspace.renameFile(
              message.oldName,
              message.newName,
              client,
            );
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "rename-result",
                requestId: message.requestId,
                ...result,
              }));
            }
          }
        } catch (error) {
          console.warn(`Ignored invalid control message: ${error.message}`);
        }
        return;
      }

      const message = new Uint8Array(data);

      if (message[0] === yjsMessageType) {
        Y.applyUpdate(sharedDocument, message.subarray(1), client);
      } else if (message[0] === awarenessMessageType) {
        applyAwarenessUpdate(awareness, message.subarray(1), client);
      }
    });

    client.on("pong", () => {
      client.isAlive = true;
    });

    client.on("close", () => {
      // Awareness is temporary. Removing the IDs owned by this socket clears
      // its participant entry, cursor, and selection from every other browser.
      removeAwarenessStates(
        awareness,
        [...client.awarenessClientIds],
        client,
      );
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

  webSocketServer.on("close", () => {
    clearInterval(heartbeat);
    workspace.close();
  });

  return { webSocketServer, workspace, broadcastControl };
}

module.exports = { setupWebSocketServer };
