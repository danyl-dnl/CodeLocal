# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 5 build
adds participant names, live presence, and remote cursors/selections to the
shared Yjs CodeMirror document.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN address that another device on the same network can try. All connected
browsers share the sample `main.js` document in real time. The document lives
in server memory and resets when the server restarts. A display name is stored
locally in each browser and is not an account or authentication credential.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
