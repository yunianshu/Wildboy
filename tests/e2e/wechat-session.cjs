const path = require("node:path");
const { spawn } = require("node:child_process");
const automator = require("../../miniprogram/node_modules/miniprogram-automator");

async function connectWeChat() {
  const port = Number(process.env.WILDBOY_WECHAT_PORT || 9420);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("WILDBOY_WECHAT_PORT must be a valid TCP port");
  const apiOrigin = process.env.WILDBOY_LOCAL_API || "http://127.0.0.1:8080";
  const origin = new URL(apiOrigin);
  if (origin.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(origin.hostname))
    throw new Error("Native fixture tests require an isolated loopback HTTP API");
  let miniProgram;
  try {
    miniProgram = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` });
  } catch {
    const cli = process.env.WILDBOY_WECHAT_CLI || "C:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat";
    const project = path.resolve(__dirname, "../../miniprogram");
    // automator.launch cannot execute a Windows .bat directly on recent Node.
    const child = spawn(`"${cli}" auto --project "${project}" --auto-port ${port} --trust-project`, {
      shell: true, windowsHide: true, stdio: "ignore",
    });
    let launchError;
    child.on("error", (error) => { launchError = error; });
    for (let attempt = 0; attempt < 30; attempt++) {
      if (launchError) throw launchError;
      try {
        miniProgram = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    if (!miniProgram) throw new Error(`WeChat DevTools automation port ${port} did not open`);
    // The automation socket can open before the simulator has initialized.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  try {
    const runtime = await miniProgram.evaluate(() => ({
      apiOrigin: require("config.js").config.apiOrigin,
      mediaOrigin: require("utils/api.js").mediaUrl("/api/v1/media/qa"),
    }));
    if (runtime.apiOrigin !== apiOrigin || runtime.mediaOrigin !== `${apiOrigin}/api/v1/media/qa`)
      throw new Error("DevTools is running a stale API configuration; recompile the project before testing");
    console.log(`Connected WeChat DevTools on ${port}, API ${apiOrigin}`);
    // Recent DevTools versions can complete navigation without the route event
    // awaited by automator 0.13. Use the native API's completion callback instead.
    for (const method of ["reLaunch", "switchTab", "navigateTo", "redirectTo"]) {
      miniProgram[method] = async (url) => {
        await miniProgram.callWxMethod(method, { url });
        return miniProgram.currentPage();
      };
    }
    return miniProgram;
  } catch (error) {
    await miniProgram.disconnect();
    throw error;
  }
}

module.exports = { connectWeChat };
