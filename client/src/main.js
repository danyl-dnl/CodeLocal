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
        <div><h1>OffGrid</h1><p>LAN collaboration</p></div>
      </div>
      <div class="network-summary">
        <span class="status"><span class="dot"></span><span id="lan-status">Checking LAN</span></span>
        <span class="status connection-status disconnected" id="connection-status">
          <span class="dot"></span><span id="connection-label">Waiting</span>
        </span>
        <span class="client-count" id="client-count">0 clients</span>
        <span class="save-status saved" id="save-status"><span class="dot"></span><span>Saved</span></span>
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
        <p class="sidebar-note">Project files are saved on this host.</p>
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
          <span>Saved to host</span>
        </footer>
      </section>
    </main>
  </div>

  <div class="name-dialog" id="name-dialog" role="dialog" aria-modal="true" aria-labelledby="name-title">
    <form class="name-card" id="name-form">
      <span class="brand-mark" aria-hidden="true">O</span>
      <p class="section-label">JOIN LOCAL SESSION</p>
      <h2 id="name-title">Join OffGrid Session</h2>
      <p>You're joining a collaboration session hosted on this local network.</p>
      <label for="participant-name">Your name</label>
      <input id="participant-name" name="participantName" maxlength="40" autocomplete="name" required />
      <button type="submit">Join Session</button>
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
      <p class="dialog-note">This removes it from the shared project and host workspace.</p>
      <div class="dialog-actions">
        <button class="secondary-button" id="cancel-delete" type="button">Cancel</button>
        <button class="danger-button" id="confirm-delete" type="button">Delete</button>
      </div>
    </div>
  </div>

  <div class="dialog" id="rename-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-dialog-title" hidden>
    <form class="dialog-card" id="rename-form">
      <p class="section-label">SHARED PROJECT</p>
      <h2 id="rename-dialog-title">Rename file</h2>
      <label for="rename-file-name">New file name</label>
      <input id="rename-file-name" maxlength="80" required />
      <p class="form-error" id="rename-error" role="alert"></p>
      <div class="dialog-actions">
        <button class="secondary-button" id="cancel-rename" type="button">Cancel</button>
        <button class="primary-button" type="submit">Rename</button>
      </div>
    </form>
  </div>

  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
`;

const sharedDocument = new Y.Doc();
const files = sharedDocument.getMap("files");
const editorElement = document.querySelector("#editor");
const fileListElement = document.querySelector("#file-list");
let awareness;
let editorView;
let activeFileName = null;
let pendingDeleteFileName = null;
let pendingRenameFileName = null;
let pendingActiveRename = null;
let disconnectSession;
let sessionConnection;
let updateParticipantList = () => {};
let toastTimer;

function showToast(message, kind = "error") {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.className = `toast ${kind}`;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4_000);
}

function updateSaveStatus({ state, message }) {
  const status = document.querySelector("#save-status");
  const labels = { saving: "Saving…", saved: "Saved", failed: "Save failed" };
  status.className = `save-status ${state}`;
  status.lastElementChild.textContent = labels[state] || "Saved";
  if (state === "failed") showToast(message || "The host could not save the project.");
}

function showEmptyEditor() {
  editorView?.destroy();
  editorView = null;
  activeFileName = null;
  awareness?.setLocalStateField("cursor", null);
  awareness?.setLocalStateField("activeFile", null);
  editorElement.innerHTML = `
    <div class="empty-editor">
      <div><h2>No files yet</h2><p>Create a file to start collaborating.</p>
      <button class="primary-button" id="empty-new-file" type="button">+ New File</button></div>
    </div>`;
  document.querySelector("#empty-new-file").addEventListener("click", openNewFileDialog);
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
    `Delete “${fileName}”?`;
  document.querySelector("#delete-dialog").hidden = false;
}

function requestRenameFile(fileName) {
  pendingRenameFileName = fileName;
  const input = document.querySelector("#rename-file-name");
  input.value = fileName;
  document.querySelector("#rename-error").textContent = "";
  document.querySelector("#rename-dialog").hidden = false;
  input.focus();
  input.select();
}

function renderFileList() {
  const fileNames = getFileNames(files);

  if (pendingActiveRename && files.has(pendingActiveRename)) {
    const renamedFile = pendingActiveRename;
    pendingActiveRename = null;
    activeFileName = null;
    selectFile(renamedFile);
    return;
  }

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

    const actions = document.createElement("div");
    actions.className = "file-actions";
    const actionsButton = document.createElement("button");
    actionsButton.className = "file-actions-button";
    actionsButton.type = "button";
    actionsButton.setAttribute("aria-label", `Actions for ${fileName}`);
    actionsButton.textContent = "•••";
    const menu = document.createElement("div");
    menu.className = "file-menu";
    menu.hidden = true;

    const renameButton = document.createElement("button");
    renameButton.type = "button";
    renameButton.textContent = "Rename";
    renameButton.addEventListener("click", () => requestRenameFile(fileName));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-action";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => requestDeleteFile(fileName));
    menu.append(renameButton, deleteButton);
    actionsButton.addEventListener("click", (event) => {
      event.stopPropagation();
      for (const otherMenu of document.querySelectorAll(".file-menu")) {
        if (otherMenu !== menu) otherMenu.hidden = true;
      }
      menu.hidden = !menu.hidden;
    });
    actions.append(actionsButton, menu);

    row.append(openButton, actions);
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

  sessionConnection = connectWebSocket({
    document: sharedDocument,
    awareness,
    onStateChange(state) {
      const connectionStatus = document.querySelector("#connection-status");
      connectionStatus.className = `status connection-status ${state.toLowerCase()}`;
      document.querySelector("#connection-label").textContent = state;
      if (state === "Disconnected") showToast("The host disconnected. OffGrid will keep trying to reconnect.");
    },
    onCountChange(count) {
      document.querySelector("#client-count").textContent =
        `${count} ${count === 1 ? "client" : "clients"}`;
    },
    onWorkspaceError(message) {
      showToast(message);
    },
    onSaveStatus: updateSaveStatus,
    onFileRenamed(oldName, newName) {
      if (activeFileName === oldName) pendingActiveRename = newName;
    },
  });

  disconnectSession = () => {
    editorView?.destroy();
    sessionConnection.disconnect();
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

function openNewFileDialog() {
  document.querySelector("#file-dialog").hidden = false;
  document.querySelector("#file-error").textContent = "";
  const input = document.querySelector("#new-file-name");
  input.value = "";
  input.focus();
}

document.querySelector("#new-file-button").addEventListener("click", openNewFileDialog);

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

document.querySelector("#cancel-rename").addEventListener("click", () => {
  pendingRenameFileName = null;
  document.querySelector("#rename-dialog").hidden = true;
});

document.querySelector("#rename-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.querySelector("#rename-file-name");
  const result = validateFileName(files, input.value);

  if (result.error) {
    document.querySelector("#rename-error").textContent = result.error;
    input.focus();
    return;
  }

  const oldName = pendingRenameFileName;
  if (!oldName) return;
  pendingActiveRename = activeFileName === oldName ? result.fileName : null;

  try {
    await sessionConnection.renameFile(oldName, result.fileName);
    pendingRenameFileName = null;
    document.querySelector("#rename-dialog").hidden = true;
    showToast(`Renamed ${oldName} to ${result.fileName}.`, "success");
  } catch (error) {
    pendingActiveRename = null;
    document.querySelector("#rename-error").textContent = error.message;
    showToast(error.message);
  }
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
document.addEventListener("click", () => {
  for (const menu of document.querySelectorAll(".file-menu")) menu.hidden = true;
});

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
