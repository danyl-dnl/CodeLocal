# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 2 build
provides the LAN server foundation and a single-user CodeMirror editor.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN address that another device on the same network can try. The sample
`main.js` file lives only in browser memory and resets when the page reloads.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
