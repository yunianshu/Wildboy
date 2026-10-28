const fs = require("node:fs");
const path = require("node:path");
const file = path.resolve("dist/config.js");
const { config } = require(file);
config.apiOrigin = process.env.WILDBOY_LOCAL_API || "http://127.0.0.1:8080";
config.apiMode = "request";
config.devLogin = true;
fs.writeFileSync(
  file,
  `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.config = ${JSON.stringify(config, null, 2)};\n`,
);
console.log(`dist configured for ${config.apiOrigin}; source production config unchanged`);
