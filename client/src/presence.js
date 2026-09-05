const participantNameKey = "offgrid-participant-name";

const participantColors = [
  "#6f7bf7",
  "#e16d8f",
  "#20b8a6",
  "#df9348",
  "#9a70e8",
  "#4b9ee8",
  "#d166d1",
  "#73a942",
];

export function getSavedParticipantName() {
  return localStorage.getItem(participantNameKey)?.trim() || "";
}

export function saveParticipantName(name) {
  localStorage.setItem(participantNameKey, name);
}

export function createParticipantIdentity(name, clientId) {
  const color = participantColors[clientId % participantColors.length];

  return {
    name,
    color,
    colorLight: `${color}33`,
  };
}

export function renderParticipantList(awareness, listElement, localClientId) {
  const participants = [...awareness.getStates().entries()]
    .filter(([, state]) => state.user?.name)
    .map(([clientId, state]) => ({
      clientId,
      activeFile: state.activeFile,
      ...state.user,
    }))
    .sort((first, second) => {
      if (first.clientId === localClientId) return -1;
      if (second.clientId === localClientId) return 1;
      return first.name.localeCompare(second.name);
    });

  listElement.replaceChildren();

  for (const participant of participants) {
    const item = document.createElement("li");
    item.className = "participant";

    const colorIndicator = document.createElement("span");
    colorIndicator.className = "participant-color";
    colorIndicator.style.backgroundColor = participant.color;

    const name = document.createElement("span");
    name.className = "participant-name";
    name.textContent = participant.name;

    item.append(colorIndicator, name);

    const activeFile = document.createElement("span");
    activeFile.className = "participant-file";
    activeFile.textContent = participant.activeFile || "No file";
    item.append(activeFile);

    if (participant.clientId === localClientId) {
      const you = document.createElement("span");
      you.className = "participant-you";
      you.textContent = "you";
      item.append(you);
    }

    listElement.append(item);
  }
}
