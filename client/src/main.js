import "./styles.css";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createEditor } from "./editor";
import {
  createParticipantIdentity,
  getSavedParticipantName,
  renderParticipantList,
  saveParticipantName,
} from "./presence";
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
        <span class="status connection-status disconnected" id="connection-status">
          <span class="dot"></span><span id="connection-label">Waiting</span>
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
        <section class="participants-panel" aria-labelledby="participants-heading">
          <div class="sidebar-heading" id="participants-heading">PARTICIPANTS</div>
          <ul class="participant-list" id="participant-list"></ul>
        </section>
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

  <div class="name-dialog" id="name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-title">
    <form class="name-card" id="name-form">
      <span class="brand-mark" aria-hidden="true">O</span>
      <p class="section-label">JOIN LOCAL SESSION</p>
      <h2 id="name-title">What should others call you?</h2>
      <p>Your name is used only for this LAN session and remote cursor label.</p>
      <label for="participant-name">Display name</label>
      <input id="participant-name" name="participantName" maxlength="40" autocomplete="name" required />
      <button type="submit">Join session</button>
    </form>
  </div>
`;

const sharedDocument = new Y.Doc();
const sharedText = sharedDocument.getText("main.js");
let disconnectSession;

function startSession(participantName) {
  const awareness = new Awareness(sharedDocument);
  const participant = createParticipantIdentity(
    participantName,
    sharedDocument.clientID,
  );
  const participantList = document.querySelector("#participant-list");

  awareness.setLocalStateField("user", participant);

  const updateParticipantList = () =>
    renderParticipantList(
      awareness,
      participantList,
      sharedDocument.clientID,
    );

  awareness.on("change", updateParticipantList);
  updateParticipantList();

  createEditor(document.querySelector("#editor"), sharedText, awareness);

  const disconnectWebSocket = connectWebSocket({
    document: sharedDocument,
    awareness,
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

  disconnectSession = () => {
    disconnectWebSocket();
    awareness.off("change", updateParticipantList);
    awareness.destroy();
  };

  document.querySelector("#name-dialog").hidden = true;
}

const nameForm = document.querySelector("#name-form");
const nameInput = document.querySelector("#participant-name");
const savedParticipantName = getSavedParticipantName();

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const participantName = nameInput.value.trim();

  if (!participantName) {
    nameInput.focus();
    return;
  }

  saveParticipantName(participantName);
  startSession(participantName);
});

if (savedParticipantName) {
  startSession(savedParticipantName);
} else {
  nameInput.focus();
}

window.addEventListener("beforeunload", () => disconnectSession?.());

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
