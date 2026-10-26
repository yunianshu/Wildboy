// dist is generated output; clean it so removed pages/helpers cannot ship stale code.
const fs = require("node:fs");
const path = require("node:path");
fs.rmSync(path.resolve(__dirname, "../dist"), { recursive: true, force: true });
