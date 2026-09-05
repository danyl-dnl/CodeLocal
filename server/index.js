const path = require("node:path");
const http = require("node:http");
const express = require("express");
const { getLanAddresses } = require("./network");
const { setupWebSocketServer } = require("./websocket");
const {
  archiveLimits,
  createProjectArchive,
  readProjectArchive,
} = require("./projectArchive");

const app = express();
const port = Number.parseInt(process.env.PORT, 10) || 3000;
const clientDirectory = path.join(__dirname, "..", "dist");
const httpServer = http.createServer(app);

const collaboration = setupWebSocketServer(httpServer);

app.post(
  "/api/project/import",
  express.raw({ type: "application/zip", limit: archiveLimits.maximumZipBytes }),
  async (request, response) => {
    let project;
    try {
      project = readProjectArchive(request.body);
    } catch (error) {
      console.error(`Project import rejected: ${error.message}`);
      response.status(400).json({ error: error.message });
      return;
    }

    try {
      await collaboration.workspace.replaceProject(project.files);
      collaboration.broadcastControl({
        type: "project-imported",
        fileCount: project.files.size,
        skipped: project.skipped,
      });
      response.json({ fileCount: project.files.size, skipped: project.skipped });
    } catch (error) {
      console.error(`Project import failed: ${error.message}`);
      response.status(500).json({ error: "The host could not replace the workspace." });
    }
  },
);

app.get("/api/project/export", async (_request, response) => {
  try {
    const files = await collaboration.workspace.getProjectSnapshot();
    const archive = createProjectArchive(files);
    response.set({
      "Content-Disposition": 'attachment; filename="offgrid-project.zip"',
      "Content-Type": "application/zip",
    });
    response.send(archive);
    console.log(`Exported ${files.size} project files`);
  } catch (error) {
    console.error(`Project export failed: ${error.message}`);
    response.status(500).json({ error: "Could not export the current project." });
  }
});

app.use((error, _request, response, next) => {
  if (error?.type === "entity.too.large") {
    response.status(413).json({ error: "The ZIP is larger than the 10 MB import limit." });
    return;
  }
  next(error);
});

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
httpServer.on("error", (error) => {
  console.error(`\nCould not start OffGrid Collab: ${error.message}\n`);
  process.exitCode = 1;
});

httpServer.listen(port, "0.0.0.0", () => {
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
