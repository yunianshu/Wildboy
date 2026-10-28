const fs = require("node:fs");
const path = require("node:path");
const file = path.resolve("dist/config.js");
const { config } = require(file);
// Trial builds ship the AnyService transport: wx.cloud.callContainer against
// the CloudBase env, so no filed HTTPS domain is needed. Source config stays
// on the fail-closed "request" default; only dist is patched.
config.apiMode = "anyservice";
config.anyServiceEnvId = process.env.WILDBOY_ANY_ENV || "magic-stoat-d0gklwuq0d9881bc5";
config.anyServiceName = process.env.WILDBOY_ANY_NAME || "wildboyapi";
fs.writeFileSync(
  file,
  `"use strict";\nObject.defineProperty(exports, "__esModule", { value: true });\nexports.config = ${JSON.stringify(config, null, 2)};\n`,
);
console.log(`dist configured for AnyService env ${config.anyServiceEnvId} / service ${config.anyServiceName}`);
