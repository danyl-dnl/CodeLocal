import * as Y from "yjs";

const reconnectDelay = 1_500;
const yjsMessageType = 1;

function createYjsMessage(update) {
  const message = new Uint8Array(update.length + 1);
  message[0] = yjsMessageType;
  message.set(update, 1);
  return message;
}

export function connectWebSocket({ document, onStateChange, onCountChange }) {
  let socket;
  let reconnectTimer;
  let shouldReconnect = true;
  let reconnecting = false;
  const remoteUpdateOrigin = {};

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

  // This listener is registered once, outside reconnect(), so retries cannot
  // accidentally send every local edit more than once.
  document.on("update", handleDocumentUpdate);

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
    });

    socket.addEventListener("message", (event) => {
      if (event.data instanceof ArrayBuffer) {
        const message = new Uint8Array(event.data);

        if (message[0] === yjsMessageType) {
          Y.applyUpdate(document, message.subarray(1), remoteUpdateOrigin);
        }

        return;
      }

      try {
        const message = JSON.parse(event.data);

        if (message.type === "client-count" && Number.isInteger(message.count)) {
          onCountChange(message.count);
        }
      } catch (error) {
        console.warn("Ignored an invalid WebSocket message.", error);
      }
    });

    socket.addEventListener("close", () => {
      onCountChange(0);

      if (!shouldReconnect) {
        onStateChange("Disconnected");
        return;
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

  return function disconnect() {
    shouldReconnect = false;
    clearTimeout(reconnectTimer);
    document.off("update", handleDocumentUpdate);
    socket?.close();
  };
}
