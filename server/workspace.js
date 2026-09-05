const fs = require("node:fs");
const path = require("node:path");
const Y = require("yjs");

const saveDelay = 600;
const initializationMarker = ".offgrid-initialized";
const starterFiles = {
  "main.js": `import { greet } from "./utils.js";

greet("OffGrid");
`,
  "utils.js": `export function greet(name) {
  console.log(\`Hello, \${name}!\`);
}
`,
  "README.md": `# OffGrid Project

Collaborative coding over a local network.
`,
};

function validateWorkspaceFileName(fileName) {
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    fileName.length > 80 ||
    fileName.includes("..") ||
    /[\\/\u0000-\u001f]/.test(fileName) ||
    path.isAbsolute(fileName) ||
    path.basename(fileName) !== fileName
  ) {
    return false;
  }

  return true;
}

function createWorkspacePersistence(
  sharedDocument,
  workspaceDirectory,
  { onError, onStatus, onRename } = {},
) {
  fs.mkdirSync(workspaceDirectory, { recursive: true });
  console.log(`Workspace: ${workspaceDirectory}`);

  let diskEntries = fs
    .readdirSync(workspaceDirectory, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name !== initializationMarker &&
        validateWorkspaceFileName(entry.name),
    );

  const markerPath = path.join(workspaceDirectory, initializationMarker);
  if (diskEntries.length === 0 && !fs.existsSync(markerPath)) {
    for (const [fileName, content] of Object.entries(starterFiles)) {
      fs.writeFileSync(path.join(workspaceDirectory, fileName), content, "utf8");
    }

    fs.writeFileSync(markerPath, "OffGrid workspace initialized\n", "utf8");
    diskEntries = fs
      .readdirSync(workspaceDirectory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name !== initializationMarker &&
          validateWorkspaceFileName(entry.name),
      );
    console.log("Created starter project");
  } else if (!fs.existsSync(markerPath)) {
    fs.writeFileSync(markerPath, "OffGrid workspace initialized\n", "utf8");
  }

  const sharedFiles = sharedDocument.getMap("files");
  const lastSavedContent = new Map();
  const diskFiles = new Set();
  const saveTimers = new Map();
  const pendingFiles = new Set();
  let operationQueue = Promise.resolve();

  sharedDocument.transact(() => {
    for (const entry of diskEntries) {
      const content = fs.readFileSync(
        path.join(workspaceDirectory, entry.name),
        "utf8",
      );
      const sharedText = new Y.Text();
      sharedText.insert(0, content);
      sharedFiles.set(entry.name, sharedText);
      lastSavedContent.set(entry.name, content);
      diskFiles.add(entry.name);
    }
  });

  console.log(`Loaded ${diskEntries.length} files from disk`);

  function reportError(message, error, sourceClient) {
    console.error(`${message}: ${error.message}`);
    onError?.(sourceClient, message);
    onStatus?.({ state: "failed", message });
  }

  function markSaving(fileName) {
    pendingFiles.add(fileName);
    onStatus?.({ state: "saving", fileName });
  }

  function markSaved(fileName) {
    pendingFiles.delete(fileName);
    onStatus?.({
      state: pendingFiles.size > 0 ? "saving" : "saved",
      fileName,
    });
  }

  function enqueue(operation) {
    operationQueue = operationQueue.then(operation, operation);
    return operationQueue;
  }

  function scheduleSave(fileName) {
    clearTimeout(saveTimers.get(fileName));
    markSaving(fileName);
    saveTimers.set(
      fileName,
      setTimeout(() => {
        saveTimers.delete(fileName);
        enqueue(async () => {
          const sharedText = sharedFiles.get(fileName);
          if (!(sharedText instanceof Y.Text)) return;

          const content = sharedText.toString();
          if (lastSavedContent.get(fileName) === content) return;

          const existed = diskFiles.has(fileName);
          try {
            await fs.promises.writeFile(
              path.join(workspaceDirectory, fileName),
              content,
              "utf8",
            );
            lastSavedContent.set(fileName, content);
            diskFiles.add(fileName);
            console.log(`${existed ? "Saved" : "Created"} ${fileName}`);
            markSaved(fileName);
          } catch (error) {
            reportError(`Could not save ${fileName}`, error);
          }
        });
      }, saveDelay),
    );
  }

  function deleteFromDisk(fileName, sourceClient) {
    clearTimeout(saveTimers.get(fileName));
    saveTimers.delete(fileName);
    lastSavedContent.delete(fileName);

    if (!diskFiles.has(fileName)) {
      markSaved(fileName);
      return;
    }
    markSaving(fileName);
    enqueue(async () => {
      try {
        await fs.promises.unlink(path.join(workspaceDirectory, fileName));
        diskFiles.delete(fileName);
        console.log(`Deleted ${fileName}`);
        markSaved(fileName);
      } catch (error) {
        if (error.code === "ENOENT") {
          diskFiles.delete(fileName);
          return;
        }
        reportError(`Could not delete ${fileName}`, error, sourceClient);
      }
    });
  }

  function reconcile(_events, transaction) {
    const invalidNames = [...sharedFiles.keys()].filter(
      (fileName) => !validateWorkspaceFileName(fileName),
    );

    if (invalidNames.length > 0) {
      sharedDocument.transact(() => {
        for (const fileName of invalidNames) sharedFiles.delete(fileName);
      }, "workspace-validation");
      onError?.(
        transaction.origin,
        "Invalid file name. Files must stay flat inside the workspace.",
      );
    }

    const liveNames = new Set();
    for (const [fileName, sharedText] of sharedFiles.entries()) {
      if (!validateWorkspaceFileName(fileName) || !(sharedText instanceof Y.Text)) {
        continue;
      }
      liveNames.add(fileName);
      if (lastSavedContent.get(fileName) !== sharedText.toString()) {
        scheduleSave(fileName);
      }
    }

    for (const fileName of diskFiles) {
      if (!liveNames.has(fileName)) deleteFromDisk(fileName, transaction.origin);
    }
  }

  sharedFiles.observeDeep(reconcile);

  async function renameFile(oldName, newName, sourceClient) {
    if (
      !validateWorkspaceFileName(oldName) ||
      !validateWorkspaceFileName(newName)
    ) {
      return { error: "Use a safe, flat file name without slashes or '..'." };
    }

    return enqueue(async () => {
      const oldText = sharedFiles.get(oldName);
      if (!(oldText instanceof Y.Text)) {
        return { error: "The original file no longer exists." };
      }
      if (sharedFiles.has(newName) || diskFiles.has(newName)) {
        return { error: "A file with that name already exists." };
      }

      clearTimeout(saveTimers.get(oldName));
      saveTimers.delete(oldName);
      markSaving(oldName);

      try {
        const contentBeforeRename = oldText.toString();
        const oldPath = path.join(workspaceDirectory, oldName);
        const newPath = path.join(workspaceDirectory, newName);

        if (lastSavedContent.get(oldName) !== contentBeforeRename) {
          await fs.promises.writeFile(oldPath, contentBeforeRename, "utf8");
        }
        await fs.promises.rename(oldPath, newPath);

        diskFiles.delete(oldName);
        diskFiles.add(newName);
        lastSavedContent.delete(oldName);
        lastSavedContent.set(newName, contentBeforeRename);
        pendingFiles.delete(oldName);

        // Tell clients about the logical rename before the Yjs map changes.
        // WebSocket message ordering lets active editors follow the new name.
        onRename?.({ oldName, newName });
        const contentAtPublish = oldText.toString();
        sharedDocument.transact(() => {
          const renamedText = new Y.Text();
          renamedText.insert(0, contentAtPublish);
          sharedFiles.set(newName, renamedText);
          sharedFiles.delete(oldName);
        }, "workspace-rename");

        console.log(`Renamed ${oldName} to ${newName}`);
        if (contentAtPublish === contentBeforeRename) markSaved(newName);
        return { oldName, newName };
      } catch (error) {
        reportError(`Could not rename ${oldName}`, error, sourceClient);
        return { error: `Could not rename ${oldName}.` };
      }
    });
  }

  return {
    sharedFiles,
    renameFile,
    close() {
      sharedFiles.unobserveDeep(reconcile);
      for (const timer of saveTimers.values()) clearTimeout(timer);
    },
  };
}

module.exports = {
  createWorkspacePersistence,
  validateWorkspaceFileName,
};
