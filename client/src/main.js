import "./styles.css";
import { createEditor } from "./editor";

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
        <span class="status"><span class="dot"></span><span id="server-status">Server connected</span></span>
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
          <div class="stage-label">Single-user mode</div>
        </div>
        <div id="editor" class="editor"></div>
        <footer class="statusbar">
          <span>JavaScript</span>
          <span>Spaces: 2</span>
          <span>Local memory only</span>
        </footer>
      </section>
    </main>
  </div>
`;

createEditor(document.querySelector("#editor"));

async function showNetworkInformation() {
  const status = document.querySelector("#server-status");
  const address = document.querySelector("#network-address");

  try {
    const response = await fetch("/api/network-info");

    if (!response.ok) {
      throw new Error("Network information was unavailable.");
    }

    const information = await response.json();
    const firstLanAddress = information.lanAddresses[0];

    status.textContent = firstLanAddress ? "LAN ready" : "Local server running";
    address.textContent = firstLanAddress
      ? `http://${firstLanAddress.address}:${information.port}`
      : information.localhostUrl;
  } catch (error) {
    status.textContent = "Connection unavailable";
    address.textContent = window.location.origin;
    console.error(error);
  }
}

showNetworkInformation();
