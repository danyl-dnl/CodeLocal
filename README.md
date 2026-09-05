# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 6 build
adds a shared in-memory file list, multiple independently collaborative files,
file creation/deletion, and file-aware participant cursors.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN address that another device on the same network can try. All connected
browsers share the same in-memory files through Yjs. Files are not saved to the
host filesystem yet. A display name is stored locally in each browser and is
not an account or authentication credential.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
