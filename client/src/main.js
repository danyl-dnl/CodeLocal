import "./styles.css";
import * as Y from "yjs";
import { createEditor } from "./editor";
import { connectWebSocket } from "./websocket";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="workspace">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">O</span>
        <div>
          <h1>OffGrid Collab</h1>
          <p>Local coding workspace</p>
        </div>
      </div>
      <div class="network-summary">
        <span class="status"><span class="dot"></span><span id="lan-status">Checking LAN</span></span>
        <span class="status connection-status connecting" id="connection-status">
          <span class="dot"></span><span id="connection-label">Connecting</span>
        </span>
        <span class="client-count" id="client-count">0 connected</span>
        <span class="network-address" id="network-address">Checking LAN…</span>
      </div>
    </header>

    <main class="editor-layout">
      <aside class="sidebar" aria-label="Files">
        <div class="sidebar-heading">FILES</div>
        <button class="file active" type="button" aria-current="page">
          <span class="js-icon" aria-hidden="true">JS</span>
          <span>main.js</span>
        </button>
        <p class="sidebar-note">Files are temporary in this stage.</p>
      </aside>

      <section class="editor-panel" aria-label="Code editor">
        <div class="tabbar">
          <div class="tab active"><span class="js-icon" aria-hidden="true">JS</span>main.js</div>
          <div class="stage-label">Live collaboration active</div>
        </div>
        <div id="editor" class="editor"></div>
        <footer class="statusbar">
          <span>JavaScript</span>
          <span>Spaces: 2</span>
          <span>Shared document</span>
        </footer>
      </section>
    </main>
  </div>
`;

const sharedDocument = new Y.Doc();
const sharedText = sharedDocument.getText("main.js");

createEditor(document.querySelector("#editor"), sharedText);

const disconnectWebSocket = connectWebSocket({
  document: sharedDocument,
  onStateChange(state) {
    const connectionStatus = document.querySelector("#connection-status");
    connectionStatus.className = `status connection-status ${state.toLowerCase()}`;
    document.querySelector("#connection-label").textContent = state;
  },
  onCountChange(count) {
    document.querySelector("#client-count").textContent =
      `${count} ${count === 1 ? "client" : "clients"}`;
  },
});

window.addEventListener("beforeunload", disconnectWebSocket);

async function showNetworkInformation() {
  const status = document.querySelector("#lan-status");
  const address = document.querySelector("#network-address");

  try {
    const response = await fetch("/api/network-info");

    if (!response.ok) {
      throw new Error("Network information was unavailable.");
    }

    const information = await response.json();
    const firstLanAddress = information.lanAddresses[0];

    status.textContent = firstLanAddress ? "LAN ready" : "Local only";
    address.textContent = firstLanAddress
      ? `http://${firstLanAddress.address}:${information.port}`
      : information.localhostUrl;
  } catch (error) {
    status.textContent = "LAN unavailable";
    address.textContent = window.location.origin;
    console.error(error);
  }
}

showNetworkInformation();
