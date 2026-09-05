const path = require("node:path");
const express = require("express");
const { getLanAddresses } = require("./network");

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const clientDirectory = path.join(__dirname, "..", "dist");

app.get("/api/network-info", (_request, response) => {
  response.json({
    port,
    localhostUrl: `http://localhost:${port}`,
    lanAddresses: getLanAddresses(),
  });
});

app.use(express.static(clientDirectory));

// Listening on 0.0.0.0 makes the server reachable through the host's LAN
// address. Listening only on localhost would restrict it to this computer.
app.listen(port, "0.0.0.0", (error) => {
  if (error) {
    console.error(`\nCould not start OffGrid Collab: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const lanAddresses = getLanAddresses();

  console.log("\nOffGrid Collab is running\n");
  console.log("Local:");
  console.log(`http://localhost:${port}\n`);
  console.log("LAN:");

  if (lanAddresses.length === 0) {
    console.log("No private LAN IPv4 address was detected.");
    console.log("Connect to a local network and restart the server.\n");
  } else {
    for (const candidate of lanAddresses) {
      console.log(`http://${candidate.address}:${port} (${candidate.interfaceName})`);
    }
    console.log();
  }

  console.log(
    "Connect another device to the same local network and open a LAN address.\n",
  );
});
