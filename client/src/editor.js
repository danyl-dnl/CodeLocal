import { basicSetup, EditorView } from "codemirror";
import { EditorState, Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import * as Y from "yjs";
import { yCollab, yUndoManagerKeymap } from "y-codemirror.next";

const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "#d8dee9",
      backgroundColor: "#0c101a",
      fontSize: "14px",
    },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily:
        '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
      lineHeight: "1.75",
    },
    ".cm-content": {
      padding: "20px 0",
      caretColor: "#a8b3ff",
    },
    ".cm-gutters": {
      paddingTop: "20px",
      color: "#50596f",
      backgroundColor: "#0c101a",
      borderRight: "1px solid #1d2434",
    },
    ".cm-activeLine": { backgroundColor: "#111726" },
    ".cm-activeLineGutter": {
      color: "#a8b3ff",
      backgroundColor: "#111726",
    },
    "&.cm-focused": { outline: "none" },
    "&.cm-focused .cm-selectionBackground, ::selection": {
      backgroundColor: "#31416c !important",
    },
    ".cm-cursor": { borderLeftColor: "#a8b3ff" },
  },
  { dark: true },
);

export function createEditor(parent, sharedText, awareness) {
  const undoManager = new Y.UndoManager(sharedText);
  const state = EditorState.create({
    doc: sharedText.toString(),
    extensions: [
      basicSetup,
      javascript(),
      editorTheme,
      yCollab(sharedText, awareness, { undoManager }),
      Prec.high(keymap.of(yUndoManagerKeymap)),
    ],
  });

  return new EditorView({ state, parent });
}
