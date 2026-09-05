const os = require("node:os");

function isPrivateIPv4(address) {
  const parts = address.split(".").map(Number);

  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function getLanAddresses() {
  // Node reports every network interface. Keep only active, non-loopback,
  // private IPv4 addresses that are likely to be usable on a local network.
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [interfaceName, addresses] of Object.entries(interfaces)) {
    for (const network of addresses || []) {
      const isIPv4 = network.family === "IPv4" || network.family === 4;

      if (isIPv4 && !network.internal && isPrivateIPv4(network.address)) {
        candidates.push({
          interfaceName,
          address: network.address,
        });
      }
    }
  }

  return candidates.sort((first, second) =>
    first.interfaceName.localeCompare(second.interfaceName),
  );
}

module.exports = { getLanAddresses };
