# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 3 build
adds a local WebSocket connection and live connected-client count to the LAN
server foundation and single-user CodeMirror editor.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN address that another device on the same network can try. The sample
`main.js` file lives only in browser memory and resets when the page reloads.
Editors do not synchronize yet; WebSockets currently carry connection counts only.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
