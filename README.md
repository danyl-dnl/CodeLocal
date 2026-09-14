# CodeLocal (OffGrid Collab)

An offline-first, local-network (LAN) collaborative coding platform. Share your code and work with your team in real-time without needing an active internet connection or cloud service.

## Overview

CodeLocal provides a lightweight, real-time collaborative development environment. It uses WebSockets and Yjs for Conflict-free Replicated Data Types (CRDTs), ensuring all peers on the same network stay perfectly in sync. The host machine retains all files locally, ensuring privacy and offline capability.

## Features

- **Real-Time Collaboration**: Instant code sharing and editing across the local network.
- **Offline-First**: Completely functional without an internet connection.
- **ZIP Import/Export**: Import project files (up to 10 MB and 100 archive files) and export workspaces directly.
- **Persistent Workspace**: Host saves file changes to a local `workspace/` directory and restores them on restart.
- **Conflict Resolution**: Powered by Yjs for seamless merging of concurrent edits.

## Tech Stack

- **Frontend/Bundler**: Vite
- **Backend Server**: Node.js, Express.js
- **Real-Time Sync**: WebSockets (ws), Yjs, y-protocols
- **Editor Integration**: CodeMirror 6 (y-codemirror.next)
- **File Management**: adm-zip

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (Node Package Manager)

### Installation

1. Clone the repository and navigate to the project folder:
   ```bash
   git clone https://github.com/danyl-dnl/CodeLocal.git
   cd CodeLocal
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running Locally

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to `http://localhost:3000`.
   - The terminal will display the LAN IP address. 
   - Other users on the same network can join by navigating to that LAN address (e.g., `http://192.168.1.X:3000`).

To run the server on a different port:
```bash
PORT=4000 npm start
```

Press `Ctrl+C` in the terminal to stop the server.

## Usage

- **Collaborate**: Edits are broadcasted to all connected clients instantly.
- **Workspace**: Files are saved to the `workspace/` directory. (Note: Runtime workspace contents are ignored by Git).
- **Import Projects**: You can replace the workspace by importing a ZIP file (supports root-level text/code files up to 1 MB per file).
- **Identities**: A display name is stored locally in your browser for identification during collaboration (no account/auth needed).

## License

*(No license currently specified in the repository)*
