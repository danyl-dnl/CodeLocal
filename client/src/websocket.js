import * as Y from "yjs";
import {
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
  removeAwarenessStates,
} from "y-protocols/awareness";

const reconnectDelay = 1_500;
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

export function connectWebSocket({
  document,
  awareness,
  onStateChange,
  onCountChange,
  onWorkspaceError,
  onSaveStatus,
  onFileRenamed,
  onProjectReplacing,
  onProjectImported,
}) {
  let socket;
  let reconnectTimer;
  let shouldReconnect = true;
  let reconnecting = false;
  const remoteUpdateOrigin = {};
  const renameRequests = new Map();
  let nextRequestId = 1;

  function sendDocumentUpdate(update) {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(createYjsMessage(update));
    }
  }

  function handleDocumentUpdate(update, origin) {
    if (origin !== remoteUpdateOrigin) {
      sendDocumentUpdate(update);
    }
  }

  function handleAwarenessUpdate({ added, updated, removed }, origin) {
    if (origin === remoteUpdateOrigin) {
      return;
    }

    const changedClientIds = [...added, ...updated, ...removed];

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        createAwarenessMessage(
          encodeAwarenessUpdate(awareness, changedClientIds),
        ),
      );
    }
  }

  // This listener is registered once, outside reconnect(), so retries cannot
  // accidentally send every local edit more than once.
  document.on("update", handleDocumentUpdate);
  awareness.on("update", handleAwarenessUpdate);

  function connect(isReconnect = false) {
    reconnecting = isReconnect;
    onStateChange(isReconnect ? "Reconnecting" : "Connecting");

    // location.host is whichever host opened the page. A LAN visitor therefore
    // connects back to the LAN host instead of incorrectly using localhost.
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const webSocketUrl = `${protocol}//${window.location.host}/ws`;
    socket = new WebSocket(webSocketUrl);
    socket.binaryType = "arraybuffer";

    socket.addEventListener("open", () => {
      reconnecting = false;
      onStateChange("Connected");

      // Sending our current state also carries edits made while disconnected.
      sendDocumentUpdate(Y.encodeStateAsUpdate(document));

      if (awareness.getLocalState()) {
        socket.send(
          createAwarenessMessage(
            encodeAwarenessUpdate(awareness, [document.clientID]),
          ),
        );
      }
    });

    socket.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        const message = new Uint8Array(event.data);

        if (message[0] === yjsMessageType) {
          Y.applyUpdate(document, message.subarray(1), remoteUpdateOrigin);
        } else if (message[0] === awarenessMessageType) {
          applyAwarenessUpdate(
            awareness,
            message.subarray(1),
            remoteUpdateOrigin,
          );
        }

        return;
      }

      try {
        const message = JSON.parse(event.data);

        if (message.type === "client-count" && Number.isInteger(message.count)) {
          onCountChange(message.count);
        } else if (message.type === "workspace-error") {
          onWorkspaceError?.(message.message);
        } else if (message.type === "save-status") {
          onSaveStatus?.(message);
        } else if (message.type === "file-renamed") {
          onFileRenamed?.(message.oldName, message.newName);
        } else if (message.type === "rename-result") {
          const request = renameRequests.get(message.requestId);
          if (request) {
            renameRequests.delete(message.requestId);
            if (message.error) request.reject(new Error(message.error));
            else request.resolve(message);
          }
        } else if (message.type === "project-replacing") {
          onProjectReplacing?.();
        } else if (message.type === "project-imported") {
          onProjectImported?.(message);
        }
      } catch (error) {
        console.warn("Ignored an invalid WebSocket message.", error);
      }
    });

    socket.addEventListener("close", () => {
      onCountChange(0);

      const remoteClientIds = [...awareness.getStates().keys()].filter(
        (clientId) => clientId !== document.clientID,
      );
      removeAwarenessStates(awareness, remoteClientIds, remoteUpdateOrigin);
      for (const request of renameRequests.values()) {
        request.reject(new Error("The server disconnected before the rename finished."));
      }
      renameRequests.clear();

      if (!shouldReconnect) {
        onStateChange("Disconnected");
        return;
      }

      // Advance the local awareness clock so the server accepts this identity
      // again immediately after it removed the old disconnected presence.
      const localState = awareness.getLocalState();
      if (localState) {
        awareness.setLocalState(localState);
      }

      onStateChange(reconnecting ? "Reconnecting" : "Disconnected");
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(true), reconnectDelay);
    });

    socket.addEventListener("error", () => {
      // The close event follows and schedules the next restrained retry.
      socket.close();
    });
  }

  connect();

  return {
    renameFile(oldName, newName) {
      if (socket?.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error("Reconnect before renaming a file."));
      }

      const requestId = nextRequestId++;
      socket.send(JSON.stringify({
        type: "rename-file",
        requestId,
        oldName,
        newName,
      }));
      return new Promise((resolve, reject) => {
        renameRequests.set(requestId, { resolve, reject });
      });
    },
    disconnect() {
      shouldReconnect = false;
      clearTimeout(reconnectTimer);
      awareness.setLocalState(null);
      awareness.off("update", handleAwarenessUpdate);
      document.off("update", handleDocumentUpdate);
      socket?.close();
    },
  };
}
