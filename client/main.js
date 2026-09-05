const localhostAddress = document.querySelector("#localhost-address");
const lanAddresses = document.querySelector("#lan-addresses");
const lanStatus = document.querySelector("#lan-status");

function createAddress(address, port, interfaceName) {
  const element = document.createElement("code");
  element.append(`http://${address}:${port} `);

  const label = document.createElement("span");
  label.className = "interface-name";
  label.textContent = `(${interfaceName})`;
  element.append(label);

  return element;
}

async function showNetworkInformation() {
  try {
    const response = await fetch("/api/network-info");

    if (!response.ok) {
      throw new Error("The server returned an unexpected response.");
    }

    const information = await response.json();
    localhostAddress.textContent = information.localhostUrl;
    lanAddresses.replaceChildren();

    if (information.lanAddresses.length === 0) {
      lanAddresses.textContent =
        "No private LAN IPv4 address was detected. Connect to a local network, then restart the server.";
      lanStatus.lastChild.textContent = "LAN Address Not Found";
      return;
    }

    for (const candidate of information.lanAddresses) {
      lanAddresses.append(
        createAddress(candidate.address, information.port, candidate.interfaceName),
      );
    }

    lanStatus.lastChild.textContent = "LAN Ready";
  } catch (error) {
    localhostAddress.textContent = window.location.origin;
    lanAddresses.textContent =
      "Could not load network information. Check that the local server is running.";
    lanStatus.lastChild.textContent = "LAN Status Unavailable";
    console.error(error);
  }
}

showNetworkInformation();
