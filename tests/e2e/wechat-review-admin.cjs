// Native regression against LocalSmokeServer's disposable database only.
// Run after the normal mini program build has been configured for port 18080.
// Sharing is intercepted: this script never sends a file to a WeChat contact.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { connectWeChat } = require("./wechat-session.cjs");

process.env.WILDBOY_LOCAL_API ||= "http://127.0.0.1:18080";
process.env.WILDBOY_WECHAT_PORT ||= "9422";
const origin = new URL(process.env.WILDBOY_LOCAL_API);
assert(origin.protocol === "http:" && ["127.0.0.1", "localhost"].includes(origin.hostname)
  && origin.port === "18080" && origin.pathname === "/" && !origin.search && !origin.hash
  && !origin.username && !origin.password, "Admin review requires the loopback smoke API on port 18080");
assert.equal(process.env.WILDBOY_WECHAT_PORT, "9422", "Admin review uses the dedicated automation port 9422");

const output = path.resolve(__dirname, "../../test-results/review-2026-11-11");
const secrets = ["smoke-only-password-123!"];
const checks = [];
const exceptions = [];
const fixtures = {};
const sanitize = (value) => secrets.reduce((text, secret) => secret ? text.split(secret).join("[redacted]") : text,
  String(value)).replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function api(route, { method = "GET", token, body } = {}) {
  assert(route.startsWith("/") && !route.startsWith("//"), "Fixture route must be API-relative");
  const response = await fetch(`${origin.origin}/api/v1${route}`, {
    method, redirect: "error", signal: AbortSignal.timeout(15000),
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status}, code ${result?.code || "unknown"}`);
  return result;
}

async function waitData(page, predicate, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const data = await page.data();
    if (predicate(data)) return data;
    await delay(250);
  }
  throw new Error(`Timed out: ${description}`);
}

async function waitRoute(miniProgram, route) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const page = await miniProgram.currentPage();
    if (page.path === route) return page;
    await delay(250);
  }
  throw new Error(`Timed out opening ${route}`);
}

async function waitElement(page, selector) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const element = await page.$(selector);
    if (element) return element;
    await delay(250);
  }
  throw new Error(`Timed out rendering element: ${selector}`);
}

async function scrollTo(miniProgram, scrollTop) {
  await miniProgram.callWxMethod("pageScrollTo", { scrollTop, duration: 0 });
  // The native callback can precede the render layer's final scroll position.
  // Wait for consecutive viewport measurements before tapping a real control.
  await delay(250);
  const page = await miniProgram.currentPage();
  let previous, stable = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    const position = Number(await page.scrollTop());
    if (Number.isFinite(position) && position === previous) stable++;
    else stable = 0;
    if (stable >= 2) return;
    previous = position;
    await delay(150);
  }
  throw new Error("Native viewport scroll position did not settle");
}

async function button(page, label) {
  for (let attempt = 0; attempt < 60; attempt++) {
    for (const item of await page.$$("button")) {
      if ((await item.text()).trim() === label) return item;
    }
    await delay(250);
  }
  throw new Error(`Timed out rendering button: ${label}`);
}

async function createFixtures() {
  const envPath = path.join(os.tmpdir(), "wildboy-smoke-env");
  const smokeEnv = Object.fromEntries(fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    .filter(line => line.includes("=")).map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  const secondToken = smokeEnv.USER_TOKEN_2;
  assert(secondToken, "The active LocalSmokeServer must provide USER_TOKEN_2 in its temp env file");
  secrets.push(secondToken);
  const legal = await api("/legal/current");
  const versions = { privacyVersion: legal.privacy.version, termsVersion: legal.terms.version };
  // Dev login succeeding and the smoke env token being valid prove this is the
  // intended disposable development server before any fixture mutations occur.
  const first = await api("/auth/dev-login", { method: "POST", body: { role: "USER", ...versions } });
  secrets.push(first.token);
  const second = await api("/me", { token: secondToken });
  assert.equal(second.role, "USER");
  assert.notEqual(first.user.id, second.id, "The two fixture registrations need distinct users");
  let admin = await api("/auth/admin", {
    method: "POST", body: { username: "smoke-admin", password: "smoke-only-password-123!" },
  });
  secrets.push(admin.token);
  assert.equal(admin.user.role, "ADMIN");
  const settings = await api("/admin/settings/admin-account", { token: admin.token });
  if (!settings.configured) {
    assert.equal(settings.canConfigure, true, "The smoke bootstrap administrator must be allowed to configure the local account");
    await api("/admin/settings/admin-account", {
      method: "PUT", token: admin.token, body: {
        username: "smoke-admin", currentPassword: "smoke-only-password-123!",
        newPassword: "smoke-only-password-123!", version: settings.version,
      },
    });
    // Account configuration invalidates other admin sessions. Always obtain a
    // fresh session before subsequent fixture requests and native password login.
    admin = await api("/auth/admin", {
      method: "POST", body: { username: "smoke-admin", password: "smoke-only-password-123!" },
    });
    secrets.push(admin.token);
  }
  const capabilities = await api("/auth/capabilities");
  assert.equal(capabilities.adminLoginEnabled, true, "The local admin account must advertise the native login entry");
  const suffix = Date.now().toString(36);
  const categoryA = await api("/admin/shop/categories", {
    method: "POST", token: admin.token, body: { name: `验收甲${suffix}`, sortOrder: 410 },
  });
  const categoryB = await api("/admin/shop/categories", {
    method: "POST", token: admin.token, body: { name: `验收乙${suffix}`, sortOrder: 420 },
  });
  const product = await api("/admin/shop/products", {
    method: "POST", token: admin.token, body: {
      name: `管理回归商品 ${suffix}`, description: "仅用于隔离数据库原生回归，不是真实商品。",
      imageUrl: "/assets/equipment.jpg", categoryId: categoryA.id,
      priceCents: 1299, originalPriceCents: 1599, stock: 3, status: "OFF_SHELF",
    },
  });
  let activity = await api("/admin/activities", {
    method: "POST", token: admin.token, body: {
      title: `名单回归 ${suffix}`, category: "WEEKLY", coverUrl: "/assets/category-weekly.jpg",
      galleryUrls: [], summary: "隔离测试活动", description: "仅用于名单筛选与CSV导出回归。",
      location: "本地测试地点", meetingPoint: "本地测试集合点", capacity: 8, priceCents: 0,
      identityRequired: false,
      startAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      endAt: new Date(Date.now() + 14 * 86400000 + 3600000).toISOString(),
      registrationDeadline: new Date(Date.now() + 13 * 86400000).toISOString(),
    },
  });
  activity = await api(`/admin/activities/${activity.id}/publish`, {
    method: "POST", token: admin.token, body: { version: activity.version },
  });
  await api(`/activities/${activity.id}/registrations`, {
    method: "POST", token: first.token, body: { ...versions, participants: [
      { participantName: "验收已报名", phone: "13800000011", idNumber: "" },
      { participantName: "=1+1", phone: "13800000012", idNumber: "" },
    ] },
  });
  await api(`/activities/${activity.id}/registrations`, {
    method: "POST", token: secondToken, body: { ...versions, participants: [
      { participantName: "验收已取消", phone: "13800000013", idNumber: "" },
    ] },
  });
  await api(`/activities/${activity.id}/registrations/me`, { method: "DELETE", token: secondToken });
  Object.assign(fixtures, { productId: product.id, categoryIds: [categoryA.id, categoryB.id], activityId: activity.id });
  return { adminToken: admin.token, product, categoryA, categoryB, activity };
}

async function main() {
  fs.mkdirSync(output, { recursive: true });
  let miniProgram, modalMocked = false, shareMocked = false, failure;
  try {
    // Connection checks the runtime API origin before fixtures are created.
    miniProgram = await connectWeChat();
    miniProgram.on("exception", error => exceptions.push(sanitize(error?.message || JSON.stringify(error))));
    const fixture = await createFixtures();
    checks.push("Only loopback LocalSmokeServer fixtures were created; product remains off shelf");
    const screenshot = async name => {
      await delay(300);
      await miniProgram.screenshot({ path: path.join(output, `admin-${name}.png`) });
    };

    await miniProgram.reLaunch("/pages/admin-login/index");
    const login = await waitRoute(miniProgram, "pages/admin-login/index");
    await waitData(login, data => data.adminLoginEnabled && data.capabilityState === "ready", "admin login capability");
    await login.setData({ username: "smoke-admin", password: "smoke-only-password-123!" });
    await login.callMethod("submit");
    const activities = await waitRoute(miniProgram, "pages/admin-activities/index");
    await waitData(activities, data => data.authorized && !data.loading, "real administrator login");
    const nativeToken = await miniProgram.callWxMethod("getStorageSync", "wildboy-session");
    if (typeof nativeToken === "string" && nativeToken) secrets.push(nativeToken);
    checks.push("Native administrator login validates the real smoke password");

    const productsBefore = await api("/admin/shop/products", { token: fixture.adminToken });
    await miniProgram.reLaunch(`/pages/admin-product/index?id=${fixture.product.id}`);
    const editor = await waitRoute(miniProgram, "pages/admin-product/index");
    await waitData(editor, data => data.authorized && !data.loading && data.categories.some(c => c.id === fixture.categoryB.id), "product and category load");
    const original = await waitElement(editor, 'input[data-field="originalPrice"]');
    await original.input("");
    await waitData(editor, data => data.form.originalPrice === "", "clearing optional original price");
    await scrollTo(miniProgram, 10000);
    await (await button(editor, "确认并保存")).tap();
    await waitData(editor, data => data.pendingSave, "product save confirmation");
    await waitElement(editor, ".confirmation");
    await scrollTo(miniProgram, 10000);
    await (await button(editor, "确认保存")).tap();
    const saved = await waitData(editor, data => !data.saving && data.version > fixture.product.version, "saving blank original price");
    assert.equal(saved.id, fixture.product.id);
    assert.equal(saved.form.originalPrice, "12.99");
    const productsAfter = await api("/admin/shop/products", { token: fixture.adminToken });
    assert.equal(productsAfter.length, productsBefore.length, "Editing must not create another product");
    const persisted = productsAfter.find(p => p.id === fixture.product.id);
    assert.equal(persisted.originalPriceCents, 1299);
    assert.equal(persisted.status, "OFF_SHELF");
    checks.push("Clearing original price updates the existing off-shelf product to the current price");
    await screenshot("product-empty-original-saved");

    await (await button(editor, "编辑当前分类")).tap();
    let categoryData = await waitData(editor, data => data.categoryManagerOpen && data.categoryMode === "edit", "direct category edit entry");
    assert.equal(categoryData.categoryForm.name, fixture.categoryA.name);
    assert.equal(categoryData.categoryVersion, fixture.categoryA.version);
    const targetIndex = categoryData.categories.findIndex(c => c.id === fixture.categoryB.id);
    const picker = await waitElement(editor, ".category-panel picker");
    await picker.trigger("change", { value: String(targetIndex) });
    categoryData = await waitData(editor, data => data.managedCategoryName === fixture.categoryB.name, "picker automatically loads selected category");
    assert.equal(categoryData.categoryForm.name, fixture.categoryB.name);
    assert.equal(categoryData.categoryForm.sortOrder, String(fixture.categoryB.sortOrder));
    assert.equal(categoryData.categoryVersion, fixture.categoryB.version);
    assert.equal(categoryData.form.categoryId, fixture.categoryA.id, "Editing another category must not reassign the product");
    await scrollTo(miniProgram, 10000);
    await screenshot("category-picker-loaded");
    checks.push("A visible edit button opens the category form and picker changes load the matching version immediately");

    await miniProgram.mockWxMethod("showModal", { confirm: true, cancel: false });
    modalMocked = true;
    await miniProgram.mockWxMethod("shareFileMessage", { errMsg: "shareFileMessage:ok" });
    shareMocked = true;
    await miniProgram.reLaunch(`/pages/admin-roster/index?id=${fixture.activity.id}`);
    const roster = await waitRoute(miniProgram, "pages/admin-roster/index");
    await waitData(roster, data => data.authorized && !data.loading && data.total === 2, "complete roster");
    for (const [status, title, included, excluded, rowCount] of [
      ["CONFIRMED", "已报名", "验收已报名", "验收已取消", 3],
      ["CANCELLED", "已取消", "验收已取消", "验收已报名", 2],
    ]) {
      const tab = await waitElement(roster, `.tab[data-status="${status}"]`);
      await tab.tap();
      const rows = await waitData(roster, data => !data.loading && data.status === status && data.total === 1, `${title} roster filter`);
      assert.equal(rows.items.length, 1);
      assert.equal(rows.items[0].statusText, title);
      await scrollTo(miniProgram, 0);
      await screenshot(`roster-${status.toLowerCase()}`);
      // Delete only this run's prior export so the second check cannot read stale bytes.
      await miniProgram.evaluate((id) => {
        const file = `${wx.env.USER_DATA_PATH}/roster-${id}.csv`;
        try { wx.getFileSystemManager().unlinkSync(file); } catch (_) { /* not created yet */ }
      }, fixture.activity.id);
      await (await button(roster, "导出到微信")).tap();
      let csv;
      for (let attempt = 0; attempt < 60; attempt++) {
        csv = await miniProgram.evaluate((id) => {
          try { return wx.getFileSystemManager().readFileSync(`${wx.env.USER_DATA_PATH}/roster-${id}.csv`, "utf8"); }
          catch (_) { return null; }
        }, fixture.activity.id);
        if (csv && !(await roster.data()).exporting) break;
        await delay(250);
      }
      assert.equal(typeof csv, "string", `The ${title} export must generate a real CSV`);
      const exportState = await roster.data();
      assert.equal(exportState.exporting, false);
      assert.equal(exportState.error, "");
      assert(csv.startsWith("\uFEFF"), "CSV should retain the UTF-8 BOM");
      assert(csv.includes(included) && !csv.includes(excluded), "CSV must match the active status filter");
      assert.equal(csv.split("\r\n").length, rowCount);
      if (status === "CONFIRMED") assert(csv.includes('"\'=1+1"'), "Formula-like names must export as text");
      fs.writeFileSync(path.join(output, `admin-roster-${status.toLowerCase()}.csv`), csv, "utf8");
      checks.push(`${title} roster filter and real CSV contents verified; WeChat sending intercepted`);
    }
    assert.equal(exceptions.length, 0, "Native runtime emitted an exception; inspect the sanitized report");
  } catch (error) {
    failure = sanitize(error?.message || error);
    if (miniProgram) {
      try { await miniProgram.screenshot({ path: path.join(output, "admin-failure.png") }); } catch (_) { /* original error remains */ }
    }
  } finally {
    if (miniProgram) {
      if (shareMocked) await miniProgram.restoreWxMethod("shareFileMessage").catch(() => {});
      if (modalMocked) await miniProgram.restoreWxMethod("showModal").catch(() => {});
      await miniProgram.disconnect().catch(() => {});
    }
    fs.writeFileSync(path.join(output, "admin-report.json"), JSON.stringify({
      status: failure ? "failed" : "passed", apiOrigin: origin.origin,
      fixtures, checks, exceptions: exceptions.map(sanitize), ...(failure ? { failure: sanitize(failure) } : {}),
      boundaries: "Disposable loopback database; no live payment; file sharing intercepted; no tokens recorded",
    }, null, 2));
  }
  if (failure) throw new Error(failure);
  console.log(`PASS native admin review: ${checks.length} checks; report: ${path.join(output, "admin-report.json")}`);
}

main().catch(error => {
  console.error(sanitize(error?.message || error));
  process.exitCode = 1;
});
