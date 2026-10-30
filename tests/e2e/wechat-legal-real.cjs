const path = require("node:path");
const fs = require("node:fs");
const { connectWeChat } = require("./wechat-session.cjs");
(async () => {
  const miniProgram = await connectWeChat();
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
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
