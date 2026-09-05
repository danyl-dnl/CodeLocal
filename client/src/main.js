import "./styles.css";
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createEditor } from "./editor";
import { createFileAwareness } from "./file-awareness";
import {
  createParticipantIdentity,
  getSavedParticipantName,
  renderParticipantList,
  saveParticipantName,
} from "./presence";
import {
  createFile,
  getFileNames,
  getFileType,
  validateFileName,
} from "./project";
import { connectWebSocket } from "./websocket";

const app = document.querySelector("#app");

app.innerHTML = `
  <div class="workspace">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true">O</span>
        <div><h1>OffGrid Collab</h1><p>Local coding workspace</p></div>
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
      <aside class="sidebar" aria-label="Workspace sidebar">
        <div class="sidebar-heading">FILES</div>
        <div class="file-list" id="file-list" aria-live="polite"></div>
        <button class="new-file-button" id="new-file-button" type="button">+ New File</button>

        <section class="participants-panel" aria-labelledby="participants-heading">
          <div class="sidebar-heading" id="participants-heading">PARTICIPANTS</div>
          <ul class="participant-list" id="participant-list"></ul>
        </section>
        <p class="sidebar-note">Project files are in memory only.</p>
      </aside>

      <section class="editor-panel" aria-label="Code editor">
        <div class="tabbar">
          <div class="tab active">
            <span class="file-icon" id="active-file-icon" aria-hidden="true">—</span>
            <span id="active-file-name">No file</span>
          </div>
          <div class="stage-label">Live collaboration active</div>
        </div>
        <div id="editor" class="editor"><div class="empty-editor">Waiting for project files…</div></div>
        <footer class="statusbar">
          <span id="language-label">Plain text</span>
          <span>Spaces: 2</span>
          <span>Shared in memory</span>
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

  <div class="dialog" id="file-dialog" role="dialog" aria-modal="true" aria-labelledby="file-dialog-title" hidden>
    <form class="dialog-card" id="file-form">
      <p class="section-label">SHARED PROJECT</p>
      <h2 id="file-dialog-title">Create a new file</h2>
      <label for="new-file-name">File name</label>
      <input id="new-file-name" maxlength="80" placeholder="notes.js" required />
      <p class="form-error" id="file-error" role="alert"></p>
      <div class="dialog-actions">
        <button class="secondary-button" id="cancel-new-file" type="button">Cancel</button>
        <button class="primary-button" type="submit">Create file</button>
      </div>
    </form>
  </div>

  <div class="dialog" id="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" hidden>
    <div class="dialog-card">
      <p class="section-label">DELETE SHARED FILE</p>
      <h2 id="delete-dialog-title">Delete file?</h2>
      <p class="dialog-copy" id="delete-message"></p>
      <div class="dialog-actions">
        <button class="secondary-button" id="cancel-delete" type="button">Cancel</button>
        <button class="danger-button" id="confirm-delete" type="button">Delete</button>
      </div>
    </div>
  </div>
`;

const sharedDocument = new Y.Doc();
const files = sharedDocument.getMap("files");
const editorElement = document.querySelector("#editor");
const fileListElement = document.querySelector("#file-list");
let awareness;
let editorView;
let activeFileName = null;
let pendingDeleteFileName = null;
let disconnectSession;
let updateParticipantList = () => {};

function showEmptyEditor() {
  editorView?.destroy();
  editorView = null;
  activeFileName = null;
  awareness?.setLocalStateField("cursor", null);
  awareness?.setLocalStateField("activeFile", null);
  editorElement.innerHTML = '<div class="empty-editor">Create a file to start editing.</div>';
  document.querySelector("#active-file-icon").textContent = "—";
  document.querySelector("#active-file-name").textContent = "No file";
  document.querySelector("#language-label").textContent = "Plain text";
}

function selectFile(fileName) {
  const sharedText = files.get(fileName);

  if (!(sharedText instanceof Y.Text) || fileName === activeFileName) {
    return;
  }

  editorView?.destroy();
  awareness.setLocalStateField("cursor", null);
  activeFileName = fileName;
  awareness.setLocalStateField("activeFile", fileName);
  editorElement.replaceChildren();

  const fileAwareness = createFileAwareness(awareness, fileName);
  editorView = createEditor(
    editorElement,
    sharedText,
    fileAwareness,
    fileName,
  );

  const fileType = getFileType(fileName);
  document.querySelector("#active-file-icon").textContent = fileType.icon;
  document.querySelector("#active-file-name").textContent = fileName;
  document.querySelector("#language-label").textContent = fileType.language;
  renderFileList();
}

function requestDeleteFile(fileName) {
  pendingDeleteFileName = fileName;
  document.querySelector("#delete-message").textContent =
    `Delete ${fileName} for everyone in this session?`;
  document.querySelector("#delete-dialog").hidden = false;
}

function renderFileList() {
  const fileNames = getFileNames(files);

  if (activeFileName && !files.has(activeFileName)) {
    activeFileName = null;
  }

  if (!activeFileName && fileNames.length > 0 && awareness) {
    selectFile(files.has("main.js") ? "main.js" : fileNames[0]);
    return;
  }

  if (fileNames.length === 0) {
    showEmptyEditor();
  }

  fileListElement.replaceChildren();

  for (const fileName of fileNames) {
    const fileType = getFileType(fileName);
    const row = document.createElement("div");
    row.className = `file-row${fileName === activeFileName ? " active" : ""}`;

    const openButton = document.createElement("button");
    openButton.className = "file-open";
    openButton.type = "button";
    openButton.setAttribute("aria-current", fileName === activeFileName ? "page" : "false");
    openButton.addEventListener("click", () => selectFile(fileName));

    const icon = document.createElement("span");
    icon.className = "file-icon";
    icon.textContent = fileType.icon;

    const label = document.createElement("span");
    label.className = "file-name";
    label.textContent = fileName;
    openButton.append(icon, label);

    const deleteButton = document.createElement("button");
    deleteButton.className = "file-delete";
    deleteButton.type = "button";
    deleteButton.setAttribute("aria-label", `Delete ${fileName}`);
    deleteButton.textContent = "×";
    deleteButton.addEventListener("click", () => requestDeleteFile(fileName));

    row.append(openButton, deleteButton);
    fileListElement.append(row);
  }
}

function startSession(participantName) {
  awareness = new Awareness(sharedDocument);
  const participant = createParticipantIdentity(
    participantName,
    sharedDocument.clientID,
  );
  const participantList = document.querySelector("#participant-list");

  awareness.setLocalStateField("user", participant);
  updateParticipantList = () =>
    renderParticipantList(
      awareness,
      participantList,
      sharedDocument.clientID,
    );

  awareness.on("change", updateParticipantList);
  files.observe(renderFileList);
  updateParticipantList();
  renderFileList();

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
    editorView?.destroy();
    disconnectWebSocket();
    files.unobserve(renderFileList);
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

  if (!participantName) return nameInput.focus();
  saveParticipantName(participantName);
  startSession(participantName);
});

document.querySelector("#new-file-button").addEventListener("click", () => {
  document.querySelector("#file-dialog").hidden = false;
  document.querySelector("#file-error").textContent = "";
  const input = document.querySelector("#new-file-name");
  input.value = "";
  input.focus();
});

document.querySelector("#cancel-new-file").addEventListener("click", () => {
  document.querySelector("#file-dialog").hidden = true;
});

document.querySelector("#file-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#new-file-name");
  const result = validateFileName(files, input.value);

  if (result.error) {
    document.querySelector("#file-error").textContent = result.error;
    input.focus();
    return;
  }

  createFile(files, result.fileName);
  document.querySelector("#file-dialog").hidden = true;
  selectFile(result.fileName);
});

document.querySelector("#cancel-delete").addEventListener("click", () => {
  pendingDeleteFileName = null;
  document.querySelector("#delete-dialog").hidden = true;
});

document.querySelector("#confirm-delete").addEventListener("click", () => {
  if (pendingDeleteFileName && files.has(pendingDeleteFileName)) {
    files.delete(pendingDeleteFileName);
  }

  pendingDeleteFileName = null;
  document.querySelector("#delete-dialog").hidden = true;
});

if (savedParticipantName) startSession(savedParticipantName);
else nameInput.focus();

window.addEventListener("beforeunload", () => disconnectSession?.());

async function showNetworkInformation() {
  const status = document.querySelector("#lan-status");
  const address = document.querySelector("#network-address");

  try {
    const response = await fetch("/api/network-info");
    if (!response.ok) throw new Error("Network information was unavailable.");

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
