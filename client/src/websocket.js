const reconnectDelay = 1_500;

export function connectWebSocket({ onStateChange, onCountChange }) {
  let socket;
  let reconnectTimer;
  let shouldReconnect = true;
  let reconnecting = false;

  function connect(isReconnect = false) {
    reconnecting = isReconnect;
    onStateChange(isReconnect ? "Reconnecting" : "Connecting");

    // location.host is whichever host opened the page. A LAN visitor therefore
    // connects back to the LAN host instead of incorrectly using localhost.
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const webSocketUrl = `${protocol}//${window.location.host}/ws`;
    socket = new WebSocket(webSocketUrl);

    socket.addEventListener("open", () => {
      reconnecting = false;
      onStateChange("Connected");
    });

    socket.addEventListener("message", (event) => {
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
    socket?.close();
  };
}
