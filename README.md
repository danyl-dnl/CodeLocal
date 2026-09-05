# OffGrid Collab

An offline-first LAN collaborative coding platform. Stage 1 provides the local
server foundation and a connection screen for devices on the same network.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN addresses that another device on the same network can try.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
