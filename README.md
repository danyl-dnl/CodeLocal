# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 4 build
uses Yjs to synchronize one shared CodeMirror document between browsers over
the local WebSocket server.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN address that another device on the same network can try. All connected
browsers share the sample `main.js` document in real time. The document lives
in server memory and resets when the server restarts.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
