const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const automator = require("../../miniprogram/node_modules/miniprogram-automator");
(async () => {
  const cli = "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";
  const project = path.resolve(__dirname, "../../miniprogram");
  const child = spawn(`"${cli}" auto --project "${project}" --auto-port 9420 --trust-project`, { shell: true, stdio: "ignore" });
  let miniProgram;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      miniProgram = await automator.connect({ wsEndpoint: "ws://127.0.0.1:9420" });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  if (!miniProgram) throw new Error("Automation unavailable");
  try {
    await miniProgram.reLaunch("/pages/admin-login/index");
    const login = await miniProgram.currentPage();
    await login.setData({ username: "smoke-admin", password: "smoke-only-password-123!" });
    await login.callMethod("submit");
    await login.waitFor(3000);
    await miniProgram.reLaunch("/pages/admin-legal/index");
    const page = await miniProgram.currentPage();
    let data;
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.waitFor(500);
      data = await page.data();
      if (!data.loading && data.authorized && data.published) break;
    }
    if (!data.authorized || !data.published || data.loading) throw new Error(`Legal admin failed: ${JSON.stringify(data)}`);
    const output = path.resolve(__dirname, "../../test-results/wechat-admin");
    fs.mkdirSync(output, { recursive: true });
    await miniProgram.screenshot({ path: path.join(output, "legal.png") });
    console.log("PASS real admin legal management");
  } finally {
    await miniProgram.disconnect();
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
