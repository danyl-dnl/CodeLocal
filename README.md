# OffGrid Collab

An offline-first LAN collaborative coding platform. The current Stage 9 build
adds safe offline ZIP project import and export while keeping live collaboration
and persistence in the host's local `workspace/` directory.

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

ZIP imports replace the single shared workspace. They accept up to 10 MB of ZIP
data, 100 archive files, 1 MB per supported text file, and 5 MB of supported
extracted text. Stage 9 imports root-level text/code files only; nested files and
unsupported binary types are reported and skipped. Unsafe archive paths reject
the entire import before the existing workspace is changed.

To use another port:

```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.
