// Upload dist/ to WeChat as a development version via miniprogram-ci.
// Requires the code upload key: WILDBOY_UPLOAD_KEY or
// %USERPROFILE%/.wechat-keys/private.wxa62bfca387e6809b.key.
// Run with --check-config to validate the built package without uploading.
const path = require("node:path");
const projectPath = path.resolve(__dirname, "..");
const publicApiOrigin = "https://api.wildboy.com.cn";

(async () => {
  let config;
  try {
    ({ config } = require(path.join(projectPath, "dist", "config.js")));
  } catch {
    throw new Error("无法读取 dist/config.js，请先运行 npm run build");
  }
  if (config?.apiOrigin !== publicApiOrigin || config.devLogin !== false)
    throw new Error(`上传包必须使用 ${publicApiOrigin} 且关闭开发登录，请运行 npm run build`);

  if (process.argv.includes("--check-config")) {
    console.log(`上传配置校验通过：${publicApiOrigin}，开发登录已关闭`);
    return;
  }

  const ci = require("miniprogram-ci");
  const keyPath =
    process.env.WILDBOY_UPLOAD_KEY ||
    path.join(process.env.USERPROFILE || "", ".wechat-keys", "private.wxa62bfca387e6809b.key");
  const project = new ci.Project({
    appid: "wxa62bfca387e6809b",
    type: "miniProgram",
    projectPath,
    privateKeyPath: keyPath,
    ignores: ["node_modules/**/*"],
  });
  const result = await ci.upload({
    project,
    version: process.env.WILDBOY_VERSION || "0.2.0",
    desc: process.env.WILDBOY_DESC || "Wildboy 小程序体验版",
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
