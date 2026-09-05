# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 7 build
persists the collaborative project as real text files in the host's local
`workspace/` directory.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000` on the host computer. The page and terminal show
the LAN address that another device on the same network can try. All connected
browsers share live edits through Yjs. The host saves file changes to
`workspace/` after a short debounce, and loads those files again after a full
restart. Runtime workspace contents are ignored by Git. A display name is
stored locally in each browser and is not an account or authentication
credential.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
