// Upload dist/ to WeChat as a development version via miniprogram-ci.
// Requires the code upload key: WILDBOY_UPLOAD_KEY or
// %USERPROFILE%/.wechat-keys/private.wxa62bfca387e6809b.key.
// The uploaded package must already be built: npm run build first
// (src/config.ts already carries the AnyService trial values).
const path = require("node:path");
const ci = require("miniprogram-ci");

const keyPath =
  process.env.WILDBOY_UPLOAD_KEY ||
  path.join(process.env.USERPROFILE || "", ".wechat-keys", "private.wxa62bfca387e6809b.key");

(async () => {
  const project = new ci.Project({
    appid: "wxa62bfca387e6809b",
    type: "miniProgram",
    projectPath: path.resolve(__dirname, ".."),
    privateKeyPath: keyPath,
    ignores: ["node_modules/**/*"],
  });
  const result = await ci.upload({
    project,
    version: process.env.WILDBOY_VERSION || "0.2.0",
    desc: process.env.WILDBOY_DESC || "AnyService 体验版：探索页数据走 AnyService 通道，首页改为野小子品牌",
    setting: {
      es6: true,
      minified: true,
      minifyWXSS: true,
      minifyWXML: true,
      autoPrefixWXSS: false,
    },
    robot: 1,
    onProgressUpdate: (task) => {
      if (task && task._status === "done") console.log("progress:", task._msg);
    },
  });
  console.log("UPLOAD OK");
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => {
  console.error("UPLOAD FAILED:", (error && error.message) || error);
  process.exit(1);
});
