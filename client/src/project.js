import * as Y from "yjs";

export function getFileNames(files) {
  return [...files.keys()].sort((first, second) =>
    first.localeCompare(second, undefined, { sensitivity: "base" }),
  );
}

export function validateFileName(files, value) {
  const fileName = value.trim();

  if (!fileName) {
    return { error: "Enter a file name." };
  }

  if (fileName.length > 80) {
    return { error: "File names must be 80 characters or fewer." };
  }

  if (fileName.includes("..") || /[\\/\u0000-\u001f]/.test(fileName)) {
    return { error: "Use a flat file name without slashes, '..', or control characters." };
  }

  if (files.has(fileName)) {
    return { error: "A file with that name already exists." };
  }

  return { fileName };
}

export function createFile(files, fileName) {
  files.set(fileName, new Y.Text());
}

export function getFileType(fileName) {
  if (fileName.toLowerCase().endsWith(".js")) {
    return { icon: "JS", language: "JavaScript" };
  }

  if (fileName.toLowerCase().endsWith(".md")) {
    return { icon: "MD", language: "Markdown" };
  }

  return { icon: "TXT", language: "Plain text" };
}
