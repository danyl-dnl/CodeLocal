// The standard CodeMirror binding reads awareness through this small wrapper.
// It exposes only participants whose activeFile matches the editor being shown.
export function createFileAwareness(awareness, fileName) {
  const listenerWrappers = new Map();

  return {
    doc: awareness.doc,

    getLocalState() {
      return awareness.getLocalState();
    },

    setLocalStateField(field, value) {
      awareness.setLocalStateField(field, value);
    },

    getStates() {
      return new Map(
        [...awareness.getStates()].filter(
          ([, state]) => state.activeFile === fileName,
        ),
      );
    },

    on(eventName, listener) {
      const wrappedListener = (changes, origin) =>
        listener(changes, awareness, origin);
      listenerWrappers.set(listener, wrappedListener);
      awareness.on(eventName, wrappedListener);
    },

    off(eventName, listener) {
      const wrappedListener = listenerWrappers.get(listener);

      if (wrappedListener) {
        awareness.off(eventName, wrappedListener);
        listenerWrappers.delete(listener);
      }
    },
  };
}
