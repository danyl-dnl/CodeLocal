const path = require("node:path");
const { defineConfig } = require("vite");

module.exports = defineConfig({
  root: path.join(__dirname, "client"),
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
  },
});
