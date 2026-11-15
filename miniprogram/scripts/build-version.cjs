const fs = require("node:fs");
const path = require("node:path");

const buildVersionPath = path.resolve(__dirname, "../dist/build-version.js");

function writeBuildVersion(version) {
  fs.writeFileSync(buildVersionPath, `exports.buildVersion = ${JSON.stringify(version)};\n`);
}

module.exports = { buildVersionPath, writeBuildVersion };
