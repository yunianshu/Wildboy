const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const automator = require("../../miniprogram/node_modules/miniprogram-automator");
const BASE = "http://127.0.0.1:8080/api/v1";

async function api(pathname, options = {}) {
  const response = await fetch(BASE + pathname, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${options.method || "GET"} ${pathname}: ${response.status} ${JSON.stringify(body)}`);
  return body;
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function date(days) {
  const value = new Date(Date.now() + days * 86400000);
  return value.toISOString().slice(0, 10);
}

(async () => {
  const output = path.resolve(__dirname, "../../test-results/wechat-admin");
  fs.mkdirSync(output, { recursive: true });
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
  if (!miniProgram) {
    child.kill();
    throw new Error("WeChat DevTools automation port did not open");
  }
  const exceptions = [];
  const checks = [];
  miniProgram.on("exception", (error) => exceptions.push(String(error)));
  const screenshot = (name) => miniProgram.screenshot({ path: path.join(output, `${name}.png`) });
  try {
    await miniProgram.reLaunch("/pages/admin-login/index");
    const loginPage = await miniProgram.currentPage();
    await loginPage.setData({ username: "smoke-admin", password: "smoke-only-password-123!" });
    await loginPage.callMethod("submit");
    await loginPage.waitFor(3000);
    const activities = await miniProgram.currentPage();
    assert(activities.path === "pages/admin-activities/index", "Real admin login did not open activity management");
    const activityData = await activities.data();
    assert(activityData.authorized && Array.isArray(activityData.items), "Admin activity list was not authorized by real API");
    checks.push("real admin username/password login and authorized activity list");
    await screenshot("activities");

    await miniProgram.navigateTo("/pages/admin-editor/index");
    await activities.waitFor(1500);
    const editor = await miniProgram.currentPage();
    assert(editor.path === "pages/admin-editor/index", `Create did not open admin editor: ${editor.path}`);
    assert((await editor.data()).authorized, "Admin editor was not authorized");
    const form = {
      title: `原生管理员验收 ${Date.now()}`,
      category: "WEEKLY",
      coverUrl: "/assets/category-weekly.jpg",
      galleryText: "/assets/category-weekly.jpg\n/assets/category-domestic.jpg",
      summary: "微信开发者工具真实接口验收，不是正式活动。",
      description: "线路安排：真实管理员创建并发布。\n装备要求：运动鞋、饮水和防晒。\n注意事项：仅用于隔离环境验收。",
      location: "厦门原生验收山径",
      meetingPoint: "原生验收集合点",
      startDate: date(14),
      startTime: "08:30",
      endDate: date(14),
      endTime: "16:30",
      deadlineDate: date(13),
      deadlineTime: "18:00",
      capacity: "8",
    };
    await editor.setData({ form, cover: form.coverUrl, categoryIndex: 0 });
    console.log("native editor loaded; publishing", await miniProgram.evaluate(() => getCurrentPages().map((page) => ({ route: page.route, session: page._session, authorized: page.data.authorized, busy: page.data.busy, conflict: page.data.conflict, uncertain: page.data.uncertain, error: page.data.error }))));
    await miniProgram.pageScrollTo(10000);
    await editor.waitFor(500);
    const publishButton = await editor.$(".sticky-action .primary");
    await publishButton.tap();
    await editor.waitFor(1200);
    const confirmButton = await editor.$(".confirm-actions .primary");
    await confirmButton.tap();
    console.log("in-page publish confirmation tapped");
    await editor.waitFor(3000);
    const published = await editor.data();
    assert(published.id && published.status === "PUBLISHED", `Admin editor did not publish through real API: ${published.error}`);
    const activityId = published.id;
    checks.push("real create and publish through native admin editor");
    await screenshot("editor-published");

    await editor.setData({ form: { ...form, title: `${form.title}（已编辑）` } });
    const saveButton = await editor.$(".sticky-action .secondary");
    await saveButton.tap();
    await editor.waitFor(1500);
    const edited = await editor.data();
    assert(edited.version > published.version, "Admin edit did not increment real activity version");
    checks.push("real activity edit and optimistic version update");

    const legal = await api("/legal/current");
    const login = await api("/auth/dev-login", {
      method: "POST",
      body: JSON.stringify({ role: "USER", privacyVersion: legal.privacy.version, termsVersion: legal.terms.version }),
    });
    await api(`/activities/${activityId}/registrations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${login.token}` },
      body: JSON.stringify({
        participants: [
          { participantName: "原生成员一", idNumber: "11010519491231002X", phone: "13800000000" },
          { participantName: "原生成员二", idNumber: "110105194912310038", phone: "13800000001" },
        ],
        privacyVersion: legal.privacy.version,
        termsVersion: legal.terms.version,
      }),
    });
    checks.push("real user registration with two participants");

    await miniProgram.reLaunch(`/pages/admin-roster/index?id=${activityId}`);
    const roster = await miniProgram.currentPage();
    const rosterData = await roster.data();
    assert(rosterData.authorized && rosterData.items.length === 1, "Real roster order missing");
    assert(rosterData.items[0].participants.length === 2, "Real roster does not contain two participants");
    assert(!JSON.stringify(rosterData).includes("11010519491231002X"), "Roster exposes unmasked identity in page data");
    checks.push("real roster with two masked participants");
    await screenshot("roster");
    console.log("roster verified; revealing identity");
    void roster.callMethod("reveal", { currentTarget: { dataset: { id: rosterData.items[0].participants[0].id } } });
    await roster.waitFor(500);
    await miniProgram.native().confirmModal();
    console.log("identity modal confirmed");
    checks.push("native roster identity reveal revalidates admin");

    await miniProgram.reLaunch("/pages/admin-activities/index");
    const list = await miniProgram.currentPage();
    console.log("cancelling activity", activityId);
    void list.callMethod("change", { currentTarget: { dataset: { id: activityId, action: "cancel" } } });
    await list.waitFor(600);
    const cancelButton = await list.$(".confirm-actions .primary");
    await cancelButton.tap();
    console.log("in-page cancellation confirmed");
    await list.waitFor(2000);
    const listData = await list.data();
    const cancelled = listData.items.find((item) => item.id === activityId);
    assert(cancelled?.status === "CANCELLED", "Admin cancel did not update real activity status");
    checks.push("real activity cancellation and list refresh");
    await screenshot("activities-cancelled");
    console.log("activity cancellation verified");

    assert(!exceptions.length, exceptions.join("\n"));
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify({ activityId, checks, exceptions }, null, 2));
    console.log(`PASS real WeChat admin flow: ${checks.length} checks, activity ${activityId}`);
  } finally {
    await miniProgram.disconnect();
    child.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
