const path = require("node:path");
const AdmZip = require("adm-zip");
const { validateWorkspaceFileName } = require("./workspace");

const archiveLimits = {
  maximumZipBytes: 10 * 1024 * 1024,
  maximumFiles: 100,
  maximumFileBytes: 1024 * 1024,
  maximumTotalBytes: 5 * 1024 * 1024,
};

const supportedExtensions = new Set([
  ".js", ".ts", ".json", ".md", ".txt", ".css", ".html", ".py",
  ".c", ".cpp", ".h", ".java",
]);

function unsafeArchivePath(entryName) {
  return (
    typeof entryName !== "string" ||
    entryName.length === 0 ||
    /[\u0000-\u001f]/.test(entryName) ||
    entryName.includes("\\") ||
    path.posix.isAbsolute(entryName) ||
    path.win32.isAbsolute(entryName) ||
    entryName.split("/").includes("..") ||
    path.posix.normalize(entryName).startsWith("../")
  );
}

function readRawEntryNames(buffer) {
  const endSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const earliestEndOffset = Math.max(0, buffer.length - 65_557);
  let endOffset = -1;

  for (let offset = buffer.length - 22; offset >= earliestEndOffset; offset--) {
    if (buffer.readUInt32LE(offset) === endSignature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error("The selected file is not a valid ZIP archive.");

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const entriesOnDisk = buffer.readUInt16LE(endOffset + 8);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);
  if (
    buffer.readUInt16LE(endOffset + 4) !== 0 ||
    buffer.readUInt16LE(endOffset + 6) !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new Error("Multi-part and ZIP64 archives are not supported by this small-project importer.");
  }
  if (centralOffset + centralSize > buffer.length) {
    throw new Error("The ZIP central directory is malformed.");
  }

  const names = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== centralSignature) {
      throw new Error("The ZIP central directory is malformed.");
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) throw new Error("The ZIP contains a malformed file name.");

    try {
      names.push(
        new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(nameStart, nameEnd),
        ),
      );
    } catch {
      throw new Error("The ZIP contains a malformed file name.");
    }
    offset = nameEnd + extraLength + commentLength;
  }
  return names;
}

function readProjectArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Choose a non-empty ZIP archive.");
  }
  if (buffer.length > archiveLimits.maximumZipBytes) {
    throw new Error("The ZIP is larger than the 10 MB import limit.");
  }

  const rawEntryNames = readRawEntryNames(buffer);
  for (const entryName of rawEntryNames) {
    if (unsafeArchivePath(entryName)) {
      throw new Error(`Unsafe ZIP path rejected: ${entryName || "unnamed entry"}`);
    }
  }

  let archive;
  try {
    archive = new AdmZip(buffer);
  } catch {
    throw new Error("The selected file is not a valid ZIP archive.");
  }

  let entries;
  try {
    entries = archive.getEntries();
  } catch {
    throw new Error("The selected ZIP could not be read safely.");
  }

  const fileEntries = entries.filter((entry) => !entry.isDirectory);
  if (fileEntries.length > archiveLimits.maximumFiles) {
    throw new Error(`The ZIP contains more than ${archiveLimits.maximumFiles} files.`);
  }

  const files = new Map();
  const skipped = [];
  let totalBytes = 0;

  for (const entry of entries) {
    const entryName = entry.entryName;
    if (entry.isDirectory) continue;

    if (entryName.includes("/")) {
      skipped.push(`${entryName} (nested folders are not supported yet)`);
      continue;
    }
    if (!validateWorkspaceFileName(entryName)) {
      throw new Error(`Unsafe file name rejected: ${entryName}`);
    }
    if (!supportedExtensions.has(path.extname(entryName).toLowerCase())) {
      skipped.push(`${entryName} (unsupported file type)`);
      continue;
    }
    if (entry.header.size > archiveLimits.maximumFileBytes) {
      throw new Error(`${entryName} is larger than the 1 MB per-file limit.`);
    }

    totalBytes += entry.header.size;
    if (totalBytes > archiveLimits.maximumTotalBytes) {
      throw new Error("Supported files exceed the 5 MB extracted-size limit.");
    }

    let data;
    try {
      data = entry.getData();
    } catch {
      throw new Error(`Could not safely extract ${entryName}.`);
    }
    if (data.includes(0)) {
      skipped.push(`${entryName} (binary content)`);
      continue;
    }

    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(data);
      if (files.has(entryName)) {
        throw new Error(`The ZIP contains the duplicate file ${entryName}.`);
      }
      files.set(entryName, content);
    } catch {
      skipped.push(`${entryName} (not valid UTF-8 text)`);
    }
  }

  if (files.size === 0) {
    throw new Error("The ZIP contains no supported root-level text files.");
  }

  return { files, skipped };
}

function createProjectArchive(files) {
  const archive = new AdmZip();
  for (const [fileName, content] of files) {
    if (validateWorkspaceFileName(fileName)) {
      archive.addFile(fileName, Buffer.from(content, "utf8"));
    }
  }
  return archive.toBuffer();
}

module.exports = { archiveLimits, createProjectArchive, readProjectArchive };
