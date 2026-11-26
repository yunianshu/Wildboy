/* Browser acceptance for the isolated Wildboy redesign environment.
 * Requires Playwright and a local Chromium or Edge installation.
 * node tests/e2e/admin-redesign-browser.cjs
 * Set WILDBOY_E2E_TARGET=current for the 15176/19082 refreshed QA pair.
 * Set WILDBOY_E2E_WRITE=1 for synthetic, persistent QA-only writes.
 * Set WILDBOY_E2E_ACCOUNT=1 to exercise the LocalSmokeServer bootstrap login.
 * Set CHROMIUM_PATH or PLAYWRIGHT_CHANNEL to select the browser.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");

const target = process.env.WILDBOY_E2E_TARGET || "baseline";
const allowedTargets = { baseline: [15175, 19081], current: [15176, 19082] };
assert.ok(
  Object.hasOwn(allowedTargets, target),
  "choose an isolated target: baseline or current",
);
const [webPort, apiPort] = allowedTargets[target];
const web = `http://127.0.0.1:${webPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const api = `${apiOrigin}/api/v1`;
const mutations = process.env.WILDBOY_E2E_WRITE === "1";
const stamp = `${Date.now()}-${randomUUID().slice(0, 5)}`;
const output = path.resolve(
  __dirname,
  `../../test-results/admin-redesign-browser/${stamp}`,
);
const headingTimeout = { timeout: 6000 };
const report = {
  stamp,
  web,
  api,
  mutations,
  screens: [],
  checks: [],
  skipped: [],
  fixtures: {},
  browserErrors: [],
};
const viewportSizes = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [721, 820],
  [720, 820],
  [390, 844],
  [320, 700],
];
const fixture = {};
const viewportCases = [
  ["/activities", /活动管理/, "/admin/activities"],
  ["/activities/new", /新建活动/, null],
  ["/activities/:id/edit", /编辑活动/, "/admin/activities/:id"],
  [
    "/activities/:id/registrations",
    /报名名单/,
    "/admin/activities/:id/registrations",
  ],
  ["/activity-orders", /活动订单/, "/admin/activity-orders"],
  ["/operations", /运营工作台/, "/admin/dashboard"],
  ["/boarding-points", /上车点设置/, "/admin/activity-boarding-point-locations"],
  ["/shop", /商城运营|商品管理|商城管理/, "/admin/shop/products"],
  ["/shop?tab=orders", /商城管理/, "/admin/orders"],
  ["/shop/categories", /商品分类/, "/admin/shop/categories"],
  ["/refunds", /退款售后|商城退款/, "/admin/refunds"],
  ["/notifications", /活动通知|消息管理/, "/admin/notifications"],
  ["/users", /用户管理/, "/admin/users"],
  ["/memberships", /会员管理/, "/admin/membership/tiers"],
  ["/articles", /文章管理/, "/admin/articles"],
  ["/articles/new", null, null],
  ["/articles/:articleId/edit", null, "/admin/articles/:articleId"],
  ["/shipping-reports", /发货上报/, "/admin/shipping-reports"],
  ["/legal", /协议管理/, "/admin/legal/PRIVACY"],
  ["/settings", /基础配置/, "/admin/wechat-order-center/status"],
  ["/settings/admin-account", /管理员账号/, "/admin/settings/admin-account"],
];

function isResponse(response, endpoint, method = "GET") {
  return (
    new URL(response.url()).pathname === `/api/v1${endpoint}` &&
    response.request().method() === method
  );
}

async function http(method, pathname, { token, body, status = 200 } = {}) {
  const response = await fetch(`${api}${pathname}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  assert.ok(
    [status].flat().includes(response.status),
    `${method} ${pathname} → ${response.status} ${data?.code || ""}`,
  );
  return data;
}

const admin = (method, pathname, args = {}) =>
  http(method, pathname, { ...args, token: fixture.admin });
const owner = (method, pathname, args = {}) =>
  http(method, pathname, { ...args, token: fixture.user });
const button = (root, name) => root.getByRole("button", { name });
const heading = (page, name) => page.getByRole("heading", { name }).first();
const dialog = (page, name) => page.getByRole("dialog", { name });
const qa = (name) => `QA ${name} ${stamp}`;
// 登录跳转会带 ?redirect=，不能按完整 URL 匹配。
const atLogin = (url) => url.hash.startsWith("#/login");

async function route(page, destination, name) {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, destination);
  await page.waitForURL(
    (url) => url.hash === `#${destination}`,
    headingTimeout,
  );
  if (name)
    await heading(page, name).waitFor({ state: "visible", ...headingTimeout });
}

async function navigateAndRead(page, destination, name, endpoint) {
  const response = page.waitForResponse(
    (res) => isResponse(res, endpoint),
    headingTimeout,
  );
  const [reply] = await Promise.all([response, route(page, destination, name)]);
  assert.equal(reply.status(), 200, `${destination} initial request`);
  await reply.finished();
  return reply.json();
}

async function write(page, endpoint, method, action, statuses = [200, 201]) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => isResponse(res, endpoint, method),
      headingTimeout,
    ),
    action(),
  ]);
  assert.ok(
    statuses.includes(response.status()),
    `${method} ${endpoint}: got ${response.status()}`,
  );
  return response.json();
}

async function visible(locator) {
  await locator.waitFor({ state: "visible", ...headingTimeout });
}

async function screenshot(page, name) {
  await page.screenshot({
    path: path.join(output, `${name}.png`),
    animations: "disabled",
    timeout: 5000,
  });
}

async function layout(page) {
  return page.evaluate(async () => {
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const width = document.documentElement.clientWidth;
    const documentWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    return {
      width,
      documentWidth,
      innerWidth: window.innerWidth,
      horizontalOverflow: documentWidth - width,
      overflowing:
        documentWidth > width + 1
          ? [
              ...document.querySelectorAll(
                "main, section, nav, article, .form-modal, .table-scroll",
              ),
            ]
              .map((element) => ({
                selector: `${element.tagName.toLowerCase()}.${element.classList[0] || ""}`,
                right: Math.round(element.getBoundingClientRect().right),
              }))
              .filter((element) => element.right > width + 1)
              .slice(0, 12)
          : [],
    };
  });
}

async function check(name, page, run) {
  const count = report.checks.length + 1;
  try {
    await run();
    report.checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = String(error.message).slice(0, 1500);
    report.checks.push({ name, passed: false, message });
    console.error(`FAIL ${name}: ${message.split("\n")[0]}`);
    if (page && !page.isClosed())
      await screenshot(page, `failure-${count}`).catch(() => {});
  }
}

async function login(page) {
  await page.goto(`${web}/#/login`);
  await visible(heading(page, /管理员登录/));
  const response = await write(page, "/auth/dev-login", "POST", () =>
    button(page, /演示登录/).click(),
  );
  assert.equal(response.user.role, "ADMIN");
  await visible(heading(page, /活动管理/));
}

async function createPage(browser, width = 1440, height = 900) {
  const page = await browser.newPage({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  page.setDefaultTimeout(6000);
  page.on("pageerror", (error) =>
    report.browserErrors.push({
      route: new URL(page.url()).hash,
      message: String(error.message).slice(0, 600),
    }),
  );
  await page.route("**/*", (request) => {
    const url = new URL(request.request().url());
    return url.origin === web || ["data:", "blob:"].includes(url.protocol)
      ? request.continue()
      : request.abort();
  });
  // Prevent Vite reloads from replacing an authenticated page during a run.
  await page.routeWebSocket("**/*", (socket) => socket.close());
  return page;
}

async function init() {
  const health = await fetch(`${apiOrigin}/actuator/health`, {
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(
    (await health.json()).status,
    "UP",
    "isolated API must be healthy",
  );
  const qaAdmin = await http("POST", "/auth/dev-login", {
    body: { role: "ADMIN" },
  });
  const vite = await fetch(`${web}/api/v1/auth/dev-login`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(5000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "ADMIN" }),
  });
  assert.equal(vite.status, 200, "Vite must point to the isolated dev API");
  const proxyAdmin = await vite.json();
  assert.equal(qaAdmin.user.role, "ADMIN");
  assert.equal(
    proxyAdmin.user.id,
    qaAdmin.user.id,
    "the Vite proxy and fixture API must share the same isolated database",
  );
  fixture.admin = qaAdmin.token;
  const articles = await admin("GET", "/admin/articles?size=1");
  fixture.routeArticle = articles.items[0]?.id;
  assert.ok(fixture.routeArticle, "isolated API must have an article for its editor route");
  const activities = await admin("GET", "/admin/activities?size=8");
  fixture.routeActivity = activities.items.find(
    (item) =>
      item.priceCents === 0 &&
      item.status === "PUBLISHED" &&
      item.registeredCount + 2 <= item.capacity,
  )?.id;
  assert.ok(
    fixture.routeActivity,
    "isolated API must have a free demonstration activity",
  );
  if (!mutations) return;
  const policies = await http("GET", "/legal/current");
  fixture.legal = {
    privacyVersion: policies.privacy.version,
    termsVersion: policies.terms.version,
  };
  const qaUser = await http("POST", "/auth/dev-login", {
    body: { role: "USER", ...fixture.legal },
  });
  assert.equal(qaUser.user.role, "USER");
  fixture.user = qaUser.token;
  fixture.userId = qaUser.user.id;
  fixture.membershipBefore = await owner("GET", "/me/membership");
  await owner("PUT", "/me/profile", {
    body: {
      ...fixture.legal,
      realName: "浏览器合成联系人",
      phone: "13900008990",
    },
  });
}

async function layouts(browser) {
  for (const [width, height] of viewportSizes) {
    const page = await createPage(browser, width, height);
    try {
      await check(`登录界面 ${width}×${height}`, page, async () => {
        await page.goto(`${web}/#/activity-orders`);
        await page.waitForURL(atLogin, headingTimeout);
        await visible(heading(page, /管理员登录/));
        const dimensions = await layout(page);
        report.screens.push({ route: "/login", width, height, ...dimensions });
        assert.ok(
          dimensions.horizontalOverflow <= 1,
          `${dimensions.documentWidth}px document in ${width}px viewport`,
        );
        await screenshot(page, `login-${width}`);
      });
      await login(page);
      for (const [key, name, endpoint] of viewportCases) {
        if (process.env.WILDBOY_E2E_ROUTE_FILTER && !key.includes(process.env.WILDBOY_E2E_ROUTE_FILTER)) continue;
        const destination = key.replace(":id", fixture.routeActivity).replace(":articleId", fixture.routeArticle);
        const requestPath = endpoint?.replace(":id", fixture.routeActivity).replace(":articleId", fixture.routeArticle);
        await check(`${key} ${width}×${height}`, page, async () => {
          if (key === "/shop?tab=orders")
            await route(page, "/activities", /活动管理/);
          if (
            requestPath &&
            (key !== "/activities" ||
              page.url().split("#")[1] !== "/activities")
          )
            await navigateAndRead(page, destination, name, requestPath);
          else await route(page, destination, name);
          if (key.startsWith('/articles/')) await page.getByLabel('文章标题', {exact:true}).waitFor({state:'visible'});
          const dimensions = await layout(page);
          report.screens.push({ route: key, width, height, ...dimensions });
          assert.ok(
            dimensions.horizontalOverflow <= 1,
            `${dimensions.documentWidth}px document in ${width}px viewport`,
          );
          await screenshot(
            page,
            `${key.replace(/^\//, "").replace(/[^a-z]+/g, "-")}-${width}`,
          );
        });
      }
    } finally {
      await page.context().close();
    }
  }
}

async function errorRecovery(page) {
  const noticePath = "**/api/v1/admin/notifications?**";
  await page.route(
    noticePath,
    async (request) => {
      // Hold a single failing list request so both asynchronous UI states are observable.
      await page.getByText(/正在读取通知|正在加载通知/).waitFor(headingTimeout);
      await request.fulfill({
        status: 503,
        json: { code: "E2E_INJECTED", message: "验收模拟：通知服务暂不可用" },
      });
    },
    { times: 1 },
  );
  await route(page, "/notifications", /活动通知|消息管理/);
  await visible(
    page.getByRole("alert").filter({ hasText: "验收模拟：通知服务暂不可用" }),
  );
  assert.equal(
    await page.getByText("暂无通知", { exact: true }).isVisible(),
    false,
  );
  await screenshot(page, "notification-injected-failure");
  const [fresh] = await Promise.all([
    page.waitForResponse((res) => isResponse(res, "/admin/notifications")),
    button(page, /刷新|重试/)
      .first()
      .click(),
  ]);
  assert.equal(fresh.status(), 200);
  await page
    .getByText("验收模拟：通知服务暂不可用", { exact: true })
    .waitFor({ state: "hidden" });
}

async function operationsWorkflow(page) {
  await navigateAndRead(page, "/operations", /运营工作台/, "/admin/dashboard");
  const select = page.getByLabel(/订单统计/);
  const [newRange] = await Promise.all([
    page.waitForResponse(
      (response) =>
        isResponse(response, "/admin/dashboard") &&
        new URL(response.url()).searchParams.get("days") === "14",
      headingTimeout,
    ),
    select.selectOption("14"),
  ]);
  assert.equal(newRange.status(), 200);
  await page.route(
    "**/api/v1/admin/exceptions?**",
    (route) =>
      route.fulfill({
        status: 503,
        json: {
          code: "E2E_INJECTED",
          message: "验收模拟：暂时无法读取待办",
        },
      }),
    { times: 1 },
  );
  // 精确匹配：页面上另有「查看异常待办」入口。
  await button(page, /^异常待办$/).click();
  await visible(
    page.getByRole("alert").filter({ hasText: "验收模拟：暂时无法读取待办" }),
  );
  assert.equal(
    await page.getByText("暂无待办", { exact: true }).isVisible(),
    false,
  );
  const [retried] = await Promise.all([
    page.waitForResponse(
      (response) => isResponse(response, "/admin/exceptions"),
      headingTimeout,
    ),
    button(page, /刷新|重试/)
      .first()
      .click(),
  ]);
  assert.equal(retried.status(), 200);
  await button(page, /操作历史/).click();
  await page.getByLabel(/记录编号/).fill(fixture.routeActivity);
  const [audit] = await Promise.all([
    page.waitForResponse(
      (response) =>
        isResponse(response, "/admin/audit") &&
        new URL(response.url()).searchParams.get("entityId") ===
          fixture.routeActivity,
      headingTimeout,
    ),
    button(page, /^查询$/).click(),
  ]);
  assert.equal(audit.status(), 200);
  const records = await audit.json();
  assert.ok(
    records.items.every((record) => record.entity_id === fixture.routeActivity),
  );
}

async function accountReadOnly(page) {
  const endpoint = "/admin/settings/admin-account";
  if (new URL(page.url()).hash === "#/notifications")
    await route(page, "/activities", /活动管理/);
  const settings = await navigateAndRead(
    page,
    "/settings/admin-account",
    /管理员账号/,
    endpoint,
  );
  assert.equal(settings.canConfigure, false);
  await visible(page.getByText(/演示身份无法设置管理员账号|演示身份.*只读/));
  assert.equal(
    await button(page, /修改账号|配置管理员/)
      .first()
      .isVisible(),
    false,
  );
  const cap = await http("GET", "/auth/capabilities");
  assert.equal(cap.adminLoginEnabled, settings.configured);
}

async function passwordAccount(browser) {
  const source = await fs.readFile(
    path.resolve(
      __dirname,
      "../../server/src/test/java/com/wildboy/LocalSmokeServer.java",
    ),
    "utf8",
  );
  const username = source.match(
    /setProperty\("wildboy\.admin\.username", "([^"]+)"\)/,
  )?.[1];
  const password = source.match(/\.encode\("([^"]+)"\)/)?.[1];
  assert.ok(
    username && password,
    "fixture bootstrap credentials are unavailable",
  );
  const page = await createPage(browser, 390, 844);
  try {
    const capBefore = await http("GET", "/auth/capabilities");
    await page.goto(`${web}/#/login`);
    const usernameField = page.getByLabel(/^管理员账号$/);
    const passwordField = page.getByLabel(/^登录密码$/);
    const submit = button(page, /^登录$|^进入工作台/);
    await usernameField.fill(username);
    await passwordField.fill(`wrong-${stamp}`);
    await write(page, "/auth/admin", "POST", () => submit.click(), [401]);
    await visible(page.getByRole("alert"));
    assert.equal(await passwordField.inputValue(), "");
    await passwordField.fill(password);
    const auth = await write(page, "/auth/admin", "POST", () => submit.click());
    assert.equal(auth.user.role, "ADMIN");
    await visible(heading(page, /活动管理/));
    const endpoint = "/admin/settings/admin-account";
    const account = await navigateAndRead(
      page,
      "/settings/admin-account",
      /管理员账号/,
      endpoint,
    );
    assert.equal(account.canConfigure, true);
    await button(page, /修改账号/)
      .first()
      .click();
    const editor = dialog(page, /修改管理员账号/);
    await editor.getByLabel(/新管理员用户名/).fill(username);
    await editor.getByLabel(/当前管理员密码/).fill(`wrong-${stamp}`);
    await editor.getByLabel(/^新密码/).fill(`SyntheticPassword-${stamp}`);
    await editor.getByLabel(/^确认新密码/).fill(`SyntheticPassword-${stamp}`);
    const rejected = await write(
      page,
      endpoint,
      "PUT",
      () => button(editor, /验证并保存/).click(),
      [400],
    );
    assert.equal(rejected.code, "CURRENT_PASSWORD_INVALID");
    await visible(editor.getByRole("alert"));
    await useConfirmation(page, button(editor, /^取消$/), /.*放弃.*/, true);
    await editor.waitFor({ state: "hidden" });
    assert.equal(await page.locator('input[type="password"]').count(), 0);
    assert.equal(
      (await http("GET", "/auth/capabilities")).adminLoginEnabled,
      capBefore.adminLoginEnabled,
    );
    await screenshot(page, "admin-account-password-390");
  } finally {
    await page.context().close();
  }
}

async function notificationRecovery(browser) {
  const page = await createPage(browser, 390, 844);
  let ready = false,
    sent = 0;
  try {
    await login(page);
    await page.route("**/api/v1/admin/notifications?**", (route) =>
      route.fulfill({
        json: {
          items: [
            {
              id: "qa-notice",
              title: "合成通知 · 仅浏览器状态验收",
              status: sent ? "PENDING" : "NO_PERMISSION",
              attempts: 0,
            },
          ],
          page: 0,
          hasMore: false,
        },
      }),
    );
    await page.route("**/api/v1/notifications/config", (route) =>
      route.fulfill({ json: { ready } }),
    );
    await page.route(
      "**/api/v1/admin/notifications/qa-notice/retry",
      async (route) => {
        assert.equal(route.request().method(), "POST");
        sent++;
        await route.fulfill({ status: 204 });
      },
    );
    await route(page, "/notifications", /活动通知|消息管理/);
    const row = page.getByRole("row").filter({ hasText: "合成通知" });
    await visible(row);
    // 配置未就绪时不提供重试入口，就绪后才出现「确认授权」。
    assert.equal(
      await row.getByRole("button", { name: /确认授权|重新发送|重新排队/ }).count(),
      0,
    );
    ready = true;
    await route(page, "/operations", /运营工作台/);
    await route(page, "/notifications", /活动通知|消息管理/);
    const retry = button(row, /确认授权/);
    await retry.click();
    const confirmation = dialog(page, /确认用户已重新授权/);
    await button(confirmation, /返回检查|取消/).click();
    assert.equal(sent, 0);
    await retry.click();
    await button(confirmation, /确认.*(?:重新排队|重试)|确认重试/).click();
    await visible(row.getByText(/待发送/));
    assert.equal(sent, 1);
    assert.equal(
      await row.getByText("已发送", { exact: true }).isVisible(),
      false,
    );
    await screenshot(page, "notification-recovered-synthetic");
  } finally {
    await page.context().close();
  }
}

async function activityRefundReplacement(browser) {
  const page = await createPage(browser, 390, 844);
  const order = {
    id: "qa-activity-order",
    orderNo: "QA-REFUND-ORDER",
    activityId: "qa-activity",
    activityTitle: "合成退款订单，仅浏览器状态验收",
    userId: "qa-user",
    status: "REFUND_PENDING",
    partySize: 2,
    originalTotalCents: 4000,
    totalCents: 2000,
    currency: "CNY",
    paymentTransactionId: "qa-transaction",
    version: 5,
  };
  const original = {
    id: "qa-refund-original",
    amount_cents: 2000,
    status: "REQUESTED",
    reason: "合成第一份申请",
    version: 0,
  };
  const replacement = {
    ...original,
    id: "qa-refund-replacement",
    reason: "合成替换申请",
  };
  let selected = original;
  const writes = [];
  try {
    await login(page);
    await page.route("**/api/v1/admin/activity-orders?**", (route) =>
      route.fulfill({ json: { items: [order], page: 0, hasMore: false } }),
    );
    await page.route(
      `**/api/v1/admin/activity-orders/${order.id}/refund`,
      (route) => route.fulfill({ json: selected }),
    );
    await page.route(
      `**/api/v1/admin/activity-orders/${order.id}/refund/approve`,
      async (route) => {
        const payload = route.request().postDataJSON();
        writes.push(payload);
        if (
          payload.refundId !== selected.id ||
          payload.version !== selected.version
        ) {
          await route.fulfill({
            status: 409,
            json: { code: "STALE_REFUND", message: "原退款申请已被替换" },
          });
        } else {
          selected = { ...replacement, status: "PROCESSING", version: 1 };
          await route.fulfill({ json: selected });
        }
      },
    );
    await route(
      page,
      `/activity-orders?activityId=${order.activityId}&orderId=${order.id}`,
      /活动订单/,
    );
    await button(
      page.getByRole("row").filter({ hasText: order.orderNo }),
      /查看订单|退款/,
    ).click();
    const editor = dialog(page, /合成退款订单|活动订单|订单详情/).last();
    await visible(editor.getByText(/合成第一份申请/));
    const approve = button(editor, /批准全额退款|批准退款/);
    const prompt = /批准.*退款|确认.*退款/;
    await useConfirmation(page, approve, prompt, false);
    assert.equal(writes.length, 0);
    selected = replacement;
    await write(
      page,
      `/admin/activity-orders/${order.id}/refund/approve`,
      "POST",
      () => useConfirmation(page, approve, prompt, true),
      [409],
    );
    // 冲突后界面自动重新加载最新申请，并说明刚才的批准没有提交。
    const conflictNotice = editor.getByRole("alert");
    await visible(conflictNotice);
    assert.match(await conflictNotice.textContent(), /没有提交/);
    assert.match(await conflictNotice.textContent(), /原退款申请已被替换/);
    assert.deepEqual(writes, [{ refundId: original.id, version: 0 }]);
    await visible(editor.getByText(/合成替换申请/));
    await write(
      page,
      `/admin/activity-orders/${order.id}/refund/approve`,
      "POST",
      () => useConfirmation(page, approve, prompt, true),
    );
    await visible(editor.getByText(/退款中/));
    assert.deepEqual(writes[1], { refundId: replacement.id, version: 0 });
    assert.equal(
      await editor.getByText("已退款", { exact: true }).isVisible(),
      false,
    );
    await screenshot(page, "activity-refund-replacement-synthetic");
  } finally {
    await page.context().close();
  }
}

function datetimeLocal(delta) {
  return new Date(Date.now() + (8 + delta) * 3600000)
    .toISOString()
    .slice(0, 16);
}

async function fillEventually(page, label, value, section) {
  const control = page.getByLabel(label).first();
  if (!(await control.isVisible()) && section) {
    const trigger = button(page, section).first();
    if (await trigger.isVisible()) await trigger.click();
  }
  if ((await control.getAttribute('type')) === 'date' && await control.getAttribute('readonly') !== null) {
    const id = await control.getAttribute('id');
    // 只读日期框通过同一个弹窗选择日期和时间，点「应用」后才写回输入框。
    await control.click();
    const picker = page.getByRole('dialog');
    await picker.waitFor({ state: 'visible', ...headingTimeout });
    const date = value.slice(0, 10);
    for (let month = 0; month < 18; month++) {
      const day = page.getByRole('button', { name: date, exact: true });
      if (await day.count()) {
        await day.click();
        break;
      }
      await picker.getByRole('button', { name: '下个月', exact: true }).click();
    }
    await picker.getByLabel('选择小时').selectOption(value.slice(11, 13));
    await picker.getByLabel('选择分钟').selectOption(value.slice(14, 16));
    await picker.getByRole('button', { name: /^应用$/ }).click();
    await picker.waitFor({ state: 'hidden', ...headingTimeout });
    assert.equal(
      await control.inputValue(),
      date,
      'calendar chooses the requested day',
    );
    assert.equal(
      await page.locator(`#${id}-time`).inputValue(),
      value.slice(11, 16),
      'dialog applies the requested time',
    );
  } else {
    await control.fill(value);
  }
}

const uploadPng = {
  name: "upload.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
};
async function uploadFirstImage(scope, marker = 'img[src*="/assets/uploads/"]') {
  const input = scope.locator('input[type="file"]').first();
  await input.setInputFiles(uploadPng);
  await scope
    .locator(marker)
    .first()
    .waitFor({ state: "visible", ...headingTimeout });
}

async function activityCreate(page, name) {
  await route(page, "/activities/new", /新建活动/);
  await fillEventually(page, /活动标题/, name, /基本信息/);
  await fillEventually(
    page,
    /活动摘要/,
    "隔离浏览器验收合成活动。",
    /基本信息/,
  );
  await uploadFirstImage(
    page.locator(".form-section", { hasText: "活动标题" }).first(),
  );
  await fillEventually(page, /人数上限/, "8", /基本信息/);
  await fillEventually(page, /^开始时间/, datetimeLocal(14 * 24), /时间与地点/);
  await fillEventually(
    page,
    /^结束时间/,
    datetimeLocal(14 * 24 + 3),
    /时间与地点/,
  );
  await fillEventually(
    page,
    /报名截止时间/,
    datetimeLocal(13 * 24),
    /时间与地点/,
  );
  await fillEventually(page, /活动目的地/, "隔离验收目的地", /时间与地点/);
  await fillEventually(page, /具体集合地点/, "隔离验收集合点", /时间与地点/);
  await fillEventually(
    page,
    // 标题锚定：「核验身份证」的帮助文字里也出现了“活动说明”。
    /^活动说明/,
    "仅用于浏览器验收。合成行程与安全说明。",
    /活动详情/,
  );
  const result = await write(page, "/admin/activities", "POST", () =>
    button(page, /保存草稿/).click(),
  );
  report.fixtures.activity = result.id;
  await page.waitForURL(`**/#/activities/${result.id}/edit`, headingTimeout);
  assert.equal(
    (await admin("GET", `/admin/activities/${result.id}`)).status,
    "DRAFT",
  );
  return result;
}

async function priceActivity(page, activity) {
  const endpoint = `/admin/activities/${activity.id}`;
  const editor = page.getByLabel(/活动报名原价|报名原价/).first();
  const openPrice = button(page, /^(报名价格|定价)$/).first();
  if (!(await editor.isVisible()) && (await openPrice.isVisible()))
    await openPrice.click();
  await visible(editor);
  await editor.fill("18.50");
  await write(page, `${endpoint}/price`, "POST", () =>
    button(page, /保存报名价格|保存价格/).click(),
  );
  assert.equal((await admin("GET", endpoint)).priceCents, 1850);
}

async function publishActivity(page, activity) {
  const endpoint = `/admin/activities/${activity.id}`;
  const go = button(page, /发布活动/).first();
  await go.click();
  const confirm = dialog(page, /发布.*活动/).last();
  await visible(confirm);
  await button(confirm, /返回检查|取消/).click();
  await confirm.waitFor({ state: "hidden" });
  assert.equal((await admin("GET", endpoint)).status, "DRAFT");
  await go.click();
  await write(page, `${endpoint}/publish`, "POST", () =>
    button(confirm, /确认发布/).click(),
  );
  assert.equal(
    (await http("GET", `/activities/${activity.id}`)).status,
    "PUBLISHED",
  );
}

async function filterActivity(page, activity) {
  await route(page, "/activities", /活动管理/);
  const title = page.getByLabel(/搜索标题|活动名称/).first();
  const [response] = await Promise.all([
    page.waitForResponse(
      (res) =>
        isResponse(res, "/admin/activities") &&
        new URL(res.url()).searchParams.get("title") === activity.title,
      headingTimeout,
    ),
    (async () => {
      // 活动列表输入后自动防抖查询，没有单独的「筛选」按钮。
      await title.fill(activity.title);
    })(),
  ]);
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.equal(data.total, 1);
  assert.equal(data.items[0].id, activity.id);
  const matched = page.getByRole("link", { name: activity.title, exact: true });
  await matched.click();
  // 标题链接会带上返回列表的 ?list= 参数，不能按完整地址匹配。
  await page.waitForURL(
    (url) => url.hash.startsWith(`#/activities/${activity.id}/edit`),
    headingTimeout,
  );
  await visible(heading(page, /编辑活动/));
}

async function createTier(page) {
  await route(page, "/memberships", /会员管理/);
  await button(page, /新建等级/).click();
  const editor = dialog(page, /新建会员等级|新建等级/);
  await editor.getByLabel("等级名称", { exact: true }).fill(qa("等级"));
  await editor.getByLabel("SHOP启用优惠", { exact: true }).check();
  await editor
    .getByLabel("SHOP定价方式", { exact: true })
    .selectOption("FIXED");
  await editor.getByLabel("SHOP定价值", { exact: true }).fill("0");
  await editor.getByLabel("ACTIVITY启用优惠", { exact: true }).check();
  await editor
    .getByLabel("活动多人优惠范围", { exact: true })
    .selectOption("ACCOUNT_ALL");
  await editor
    .getByLabel("ACTIVITY定价方式", { exact: true })
    .selectOption("FIXED");
  await editor.getByLabel("ACTIVITY定价值", { exact: true }).fill("0");
  const tier = await write(page, "/admin/membership/tiers", "POST", () =>
    (async () => {
      await button(editor, /^保存(?:等级)?$/).click();
      // 两项固定价都是 0 时界面会先确认“设为免费？”。
      const free = dialog(page, /设为免费/).last();
      await free.waitFor({ state: "visible", timeout: 1500 }).catch(() => {});
      if (await free.isVisible()) await button(free, /确认设为免费/).click();
    })(),
  );
  report.fixtures.tier = tier.id;
  assert.equal(tier.rules.length, 2);
  const savedTier = dialog(page, /会员等级|新建等级/).last();
  await visible(savedTier.getByRole("status").filter({ hasText: "已保存" }));
  await button(savedTier, /^(关闭|取消)$/).click();
  await savedTier.waitFor({ state: "hidden" });
  const users = button(page, /^用户业务身份$/);
  if (await users.isVisible()) await users.click();
  const lookup = page.getByLabel(/搜索用户/);
  await lookup.fill(fixture.userId);
  await button(page, /^查询$/).click();
  const row = page.getByRole("row").filter({ hasText: fixture.userId });
  await button(row, /编辑身份/).click();
  const profile = dialog(page, /编辑用户身份/);
  await profile.getByLabel("用户身份", { exact: true }).selectOption("MEMBER");
  await profile.getByLabel("会员等级", { exact: true }).selectOption(tier.id);
  await write(page, `/admin/membership/users/${fixture.userId}`, "PUT", () =>
    button(profile, /^保存(?:身份)?$/).click(),
  );
  assert.equal((await owner("GET", "/me/membership")).tierId, tier.id);
  assert.equal((await owner("GET", "/me")).role, "USER");
  await visible(profile.getByRole("status").filter({ hasText: "已保存" }));
  await button(profile, /^(关闭|取消)$/).click();
  return tier;
}

async function createCategory(page) {
  await route(page, "/shop/categories", /商品分类/);
  await button(page, /^(新分类|新建分类)$/).click();
  const editor = dialog(page, /创建商品分类|新建商品分类/);
  await editor.getByLabel(/分类名称/).fill(qa("分类"));
  await editor.getByLabel(/排序/).fill("0");
  const category = await write(page, "/admin/shop/categories", "POST", () =>
    button(editor, /保存分类/).click(),
  );
  report.fixtures.category = category.id;
  await editor.waitFor({ state: "hidden", ...headingTimeout });
  return category;
}

async function createProduct(page, category) {
  await route(page, "/shop", /商城运营|商品管理|商城管理/);
  await button(page, /新商品|新建商品/).click();
  const editor = dialog(page, /创建商品|新建商品/);
  await editor.getByLabel(/商品名称/).fill(qa("装备"));
  await uploadFirstImage(editor);
  await editor.getByLabel(/商品分类/).selectOption(category.id);
  await editor.getByLabel(/原价/).fill("25.00");
  await editor.getByLabel(/现价/).fill("19.50");
  await editor.getByLabel(/库存/).fill("5");
  await editor.getByLabel(/销售状态/).selectOption("ON_SALE");
  await editor.getByLabel(/商品说明/).fill("隔离验收商品，不配送。");
  const save = button(editor, /保存商品|确认并保存|下一步/);
  const product = await write(
    page,
    "/admin/shop/products",
    "POST",
    async () => {
      await save.click();
      const confirmation = dialog(page, /确认保存商品/);
      if (await confirmation.isVisible())
        await button(confirmation, /确认保存/).click();
    },
  );
  report.fixtures.product = product.id;
  const publicProduct = await http("GET", `/shop/products/${product.id}`);
  assert.equal(publicProduct.originalPriceCents, 2500);
  assert.equal(publicProduct.priceCents, 1950);
  assert.equal(publicProduct.categoryId, category.id);
  return product;
}

async function editProduct(page, product) {
  const row = page.getByRole("row").filter({ hasText: product.name });
  await button(row, /^编辑商品信息$/).click();
  const editor = dialog(page, /编辑商品/);
  const price = editor.getByLabel(/现价/);
  const endpoint = `/admin/shop/products/${product.id}`;
  await price.fill("20.30");
  await button(editor, /保存商品|确认并保存|下一步/).click();
  const confirmation = dialog(page, /确认保存商品/);
  await visible(confirmation.getByText(/20\.30/));
  await button(confirmation, /返回检查|返回|取消/).click();
  assert.equal(
    (await http("GET", `/shop/products/${product.id}`)).priceCents,
    1950,
  );
  assert.equal(await price.inputValue(), "20.30");
  await button(editor, /保存商品|确认并保存|下一步/).click();
  await write(page, endpoint, "PUT", () =>
    button(confirmation, /确认保存/).click(),
  );
  assert.equal(
    (await http("GET", `/shop/products/${product.id}`)).priceCents,
    2030,
  );
}

async function orderShipping(page, product) {
  const quote = await owner(
    "GET",
    `/shop/products/${product.id}/quote?quantity=1`,
  );
  assert.equal(quote.totalCents, 0);
  const order = await owner("POST", "/orders", {
    status: 201,
    body: {
      ...fixture.legal,
      items: [{ productId: product.id, quantity: 1 }],
      recipientName: "浏览器合成收货人",
      phone: "13900008991",
      address: "仅隔离验收合成地址，无物流",
      requestId: `web-${randomUUID()}`,
      expectedTotalCents: 0,
    },
  });
  report.fixtures.shopOrder = order.id;
  assert.equal(order.status, "CONFIRMED_FREE");
  await route(page, "/activities", /活动管理/);
  await route(page, "/shop?tab=orders", /商城管理/);
  const summary = page.getByText(order.orderNo, { exact: false }).first();
  await visible(summary);
  const card = page
    .locator("article, tr")
    .filter({ hasText: order.orderNo })
    .first();
  assert.equal(
    await card.getByText("13900008991", { exact: false }).isVisible(),
    false,
  );
  await button(card, /确认发货/).click();
  const confirmation = dialog(page, /确认订单已发货|确认发货/);
  await button(confirmation, /返回检查|返回|取消/).click();
  assert.equal(
    (await owner("GET", `/orders/${order.id}`)).status,
    "CONFIRMED_FREE",
  );
  await button(card, /确认发货/).click();
  await write(page, `/admin/orders/${order.id}/ship`, "POST", () =>
    button(confirmation, /确认发货/).click(),
  );
  assert.equal((await owner("GET", `/orders/${order.id}`)).status, "SHIPPED");
  return order;
}

async function useConfirmation(page, trigger, title, accept, observe) {
  let nativeConfirmation;
  function onPrompt(prompt) {
    nativeConfirmation = accept ? prompt.accept() : prompt.dismiss();
  }
  page.on("dialog", onPrompt);
  try {
    await trigger.click();
  } finally {
    page.off("dialog", onPrompt);
  }
  if (nativeConfirmation) {
    await nativeConfirmation;
    return;
  }
  const named = dialog(page, title).last();
  const confirm = await named.isVisible() ? named : page.locator('.dialog[role="dialog"]').last();
  assert.ok(await confirm.isVisible(), "敏感操作应先显示确认用途或影响");
  if (observe) await observe(confirm);
  await button(confirm, accept ? /确认|继续|放弃修改|批准退款/ : /返回检查|取消/)
    .last()
    .click();
}

async function shopPrivacy(page, order) {
  const card = page
    .locator("article, tr")
    .filter({ hasText: order.orderNo })
    .first();
  const phone = "13900008991";
  const reveal = button(card, /查看收货信息|查看收货资料/);
  assert.equal(
    await page.getByText(phone, { exact: false }).isVisible(),
    false,
  );
  await useConfirmation(page, reveal, /查看.*收货/, false);
  assert.equal(
    await page.getByText(phone, { exact: false }).isVisible(),
    false,
  );
  await useConfirmation(page, reveal, /查看.*收货/, true);
  await visible(page.getByText(phone, { exact: false }));
  await page.getByRole("button", { name: /隐藏收货信息|隐藏收货资料/ }).click();
  assert.equal(
    await page.getByText(phone, { exact: false }).isVisible(),
    false,
  );
  await route(page, "/activity-orders", /活动订单/);
  assert.equal(
    await page.getByText(phone, { exact: false }).isVisible(),
    false,
  );
}

async function freeActivityOrder(page, activity) {
  const quote = await owner(
    "GET",
    `/activities/${activity.id}/quote?participants=2`,
  );
  assert.equal(quote.totalCents, 0);
  assert.equal(quote.originalTotalCents, activity.priceCents * 2);
  const participantPhone = "13900008992";
  const order = await owner("POST", `/activities/${activity.id}/orders`, {
    body: {
      requestKey: `web-${randomUUID()}`,
      expectedTotalCents: 0,
      registration: {
        ...fixture.legal,
        participants: [
          { participantName: "浏览器合成参与甲", phone: participantPhone },
          { participantName: "浏览器合成参与乙", phone: "13900008993" },
        ],
      },
    },
  });
  report.fixtures.activityOrder = order.id;
  assert.equal(order.status, "CONFIRMED_FREE");
  const endpoint = `/admin/activity-orders/${order.id}`;
  await route(
    page,
    `/activity-orders?activityId=${activity.id}&orderId=${order.id}`,
    /活动订单/,
  );
  const row = page.getByRole("row").filter({ hasText: order.orderNo });
  await button(row, /查看订单|退款/).click();
  const editor = dialog(page, new RegExp(`${activity.title}|订单详情`)).last();
  await visible(editor.getByText(/免支付订单/));
  // 打开订单详情时参加者会自动加载，只有仍显示「加载参加者」时才手动触发。
  const people = editor.getByRole("heading", { name: /参加者/ });
  const loadPeople = editor.getByRole("button", { name: /^加载参加者$/ });
  await loadPeople.waitFor({ state: "hidden", ...headingTimeout }).catch(() => {});
  if (await loadPeople.isVisible())
    await loadPeople.click({ timeout: 2000 }).catch(() => {});
  await visible(people);
  assert.equal(
    await editor.getByText(participantPhone, { exact: false }).isVisible(),
    false,
  );
  let reveals = 0;
  const countReveal = (request) => {
    if (
      new URL(request.url()).pathname ===
      `/api/v1${endpoint}/participants/reveal`
    )
      reveals++;
  };
  page.on("request", countReveal);
  await useConfirmation(page, button(editor, /查看姓名电话/), /确认查看/, false);
  assert.equal(reveals, 0);
  await write(page, `${endpoint}/participants/reveal`, "POST", () =>
    useConfirmation(page, button(editor, /查看姓名电话/), /确认查看/, true),
  );
  page.off("request", countReveal);
  await visible(editor.getByText(participantPhone, { exact: false }));
  await button(editor, /隐藏姓名电话/).click();
  assert.equal(
    await editor.getByText(participantPhone, { exact: false }).isVisible(),
    false,
  );
  const audit = await admin("GET", `/admin/audit?entityId=${order.id}&size=20`);
  assert.equal(
    audit.items.filter((item) => item.action === "ACTIVITY_CONTACTS_VIEW")
      .length,
    1,
  );
  await write(page, `${endpoint}/cancel`, "POST", () =>
    useConfirmation(page, button(editor, /取消免费报名/), /确认取消/, true),
  );
  assert.equal(
    (await owner("GET", `/activity-orders/${order.id}`)).status,
    "CLOSED",
  );
  assert.equal(
    (await http("GET", `/activities/${activity.id}`)).registeredCount,
    0,
  );
  return order;
}

async function userOrderHistory(page, activity, order) {
  await route(page, "/users", /用户管理/);
  // 用户管理页的筛选是页内表单，不再有「筛选用户」弹窗。
  await page.getByLabel(/昵称、姓名、用户编号/).fill(fixture.userId);
  await button(page, /^查询$/).click();
  const person = page.getByRole("row").filter({ hasText: fixture.userId });
  await visible(person);
  assert.equal(
    await person.getByText("13900008990", { exact: false }).isVisible(),
    false,
  );
  await button(person, /查看用户/).click();
  const detail = dialog(page, /用户详情/);
  await button(detail, /报名历史/).click();
  const record = detail
    .locator("article, tr")
    .filter({ hasText: activity.title })
    .first();
  await visible(record);
  assert.equal(
    await record.getByText("13900008992", { exact: false }).isVisible(),
    false,
  );
  const link = record.getByRole("link", { name: /查看此活动订单|查看订单/ });
  await link.click();
  await page.waitForURL((url) => {
    const [location, query] = url.hash.split("?");
    const values = new URLSearchParams(query);
    return (
      location === "#/activity-orders" &&
      values.get("orderId") === order.id &&
      values.get("activityId") === activity.id
    );
  }, headingTimeout);
  const linked = page.getByRole("row").filter({ hasText: order.orderNo });
  await visible(linked);
}

async function copyActivityWorkflow(page, activity) {
  await route(page, `/activities/${activity.id}/edit`, /编辑活动/);
  await button(page, /换时间重开一期/).click();
  const editor = dialog(page, /复制活动/);
  assert.ok(await editor.locator("#reopen-start-at").inputValue());
  await editor.getByRole("checkbox").uncheck();
  const copied = await write(page, `/admin/activities/${activity.id}/copy`, "POST", () =>
    button(editor, /保存草稿并编辑/).click(),
  );
  const actual = await admin("GET", `/admin/activities/${copied.id}`);
  assert.notEqual(actual.id, activity.id);
  assert.equal(actual.status, "DRAFT");
  assert.equal(actual.registeredCount, 0);
  assert.equal(actual.priceCents, activity.priceCents);
  report.fixtures.copiedActivity = actual.id;
}

async function articleWorkflow(page) {
  // 文章编辑已是独立页面 /articles/new 与 /articles/:id/edit（双布局）。
  await route(page, "/articles", /文章管理/);
  await button(page, /新建文章/).click();
  await page.waitForURL("**/articles/new", headingTimeout);
  await page.getByLabel(/文章标题/).fill(qa("文章"));
  await page.getByLabel(/文章摘要/).fill("只用于隔离浏览器验收。");
  // 正文编辑器里也有图片上传入口，封面要限定在发布设置卡片内。
  await uploadFirstImage(page.locator(".cover-setting"));
  const article = await write(page, "/admin/articles", "POST", () =>
    button(page, /保存草稿/).click(),
  );
  report.fixtures.article = article.id;
  const endpoint = `/admin/articles/${article.id}`;
  await page.waitForURL("**/articles/*/edit", headingTimeout);
  const md = page
    .locator(
      '[aria-label="图文正文（Markdown 编辑器）"] .vditor-wysiwyg pre[contenteditable="true"]',
    )
    .first();
  await page
    .locator('[aria-label="图文正文（Markdown 编辑器）"][data-vditor-ready="1"]')
    .waitFor({ state: "visible", ...headingTimeout });
  await md.click();
  await md.fill("合成文章正文，仅隔离环境。");
  // Vditor 的 input 处理带防抖：轮询等待"未保存图文"禁用发布按钮生效
  let publishLocked = false;
  for (let i = 0; i < 20 && !publishLocked; i++) {
    publishLocked = await button(page, /^发布$/).isDisabled();
    if (!publishLocked) await page.waitForTimeout(250);
  }
  assert.equal(publishLocked, true);
  assert.equal(await md.textContent(), "合成文章正文，仅隔离环境。");
  // 统一保存：先存图文（推进版本），再存基本资料
  await write(page, `${endpoint}/content`, "PUT", () =>
    button(page, /^保存$/).click(),
  );
  const publish = button(page, /^发布$/);
  await useConfirmation(page, publish, /发布文章/, false, async () => {
    await screenshot(page, "article-publish-confirm-desktop");
  });
  assert.equal((await admin("GET", endpoint)).status, "DRAFT");
  await page.setViewportSize({ width: 390, height: 844 });
  await useConfirmation(page, publish, /发布文章/, false, async () => {
    assert.ok((await layout(page)).horizontalOverflow <= 1);
    await screenshot(page, "article-publish-confirm-mobile");
  });
  await write(page, `${endpoint}/publish`, "POST", () =>
    useConfirmation(page, publish, /发布文章/, true),
  );
  assert.equal(
    (await http("GET", `/articles/${article.id}`)).status,
    "PUBLISHED",
  );
  const previousOfficial = await http("GET", "/articles/official", {
    status: [200, 404],
  });
  fixture.previousOfficial = previousOfficial?.id;
  const official = button(page, /设为官方介绍/);
  await useConfirmation(page, official, /设为官方介绍/, false, async () => {
    assert.ok((await layout(page)).horizontalOverflow <= 1);
    await screenshot(page, "article-official-confirm-mobile");
  });
  assert.equal((await admin("GET", endpoint)).isOfficial, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  await write(page, `${endpoint}/official`, "POST", () =>
    useConfirmation(page, official, /设为官方介绍/, true, async () => {
      await screenshot(page, "article-official-confirm-desktop");
    }),
  );
  assert.equal((await http("GET", "/articles/official")).id, article.id);
  await visible(button(page, /当前官方介绍/));
  return article;
}

async function shortcutWorkflow(page, article) {
  // 首页入口现在只在「首页配置」里维护；/home/shortcuts 是给小程序的兼容读取接口。
  const endpoint = "/admin/home/layout";
  fixture.shortcutsBefore = await admin("GET", endpoint);
  await route(page, "/home-layout", /首页配置/);
  await page
    .locator(".module-select")
    .filter({ hasText: "快捷入口" })
    .click();
  await page.locator(".shortcut-chip").first().click();
  await page.getByLabel(/点击后执行动作/).selectOption("ARTICLE");
  await page.getByLabel(/选择小程序内置文章/).selectOption(article.id);
  await page.getByLabel(/入口名称/).fill("隔离文章验收");
  await write(page, endpoint, "PUT", () =>
    button(page, /^保存首页配置$/).first().click(),
  );
  const live = await http("GET", "/home/shortcuts");
  assert.equal(live.items.length, 4);
  assert.equal(
    live.items.find((item) => item.slot === 1).articleId,
    article.id,
  );
  assert.equal(live.items.find((item) => item.slot === 1).name, "隔离文章验收");
}

async function policyWorkflow(page) {
  const endpoint = "/admin/legal/PRIVACY";
  const before = await admin("GET", endpoint);
  fixture.privacyDraft = before.draft;
  await navigateAndRead(page, "/legal", /协议管理/, endpoint);
  const title = qa("隐私草稿");
  await page.getByLabel(/协议标题/).fill(title);
  await page
    .getByLabel(/协议正文/)
    .fill(`${title}\n隔离验收草稿，仅供检查预览与版本边界。`);
  await button(page, /预览草稿/).click();
  await visible(heading(page, new RegExp(title)));
  // 草稿预览是弹窗，先关闭再保存。
  await page.keyboard.press("Escape");
  await page
    .locator(".form-modal-backdrop")
    .waitFor({ state: "hidden", ...headingTimeout });
  const saved = await write(page, `${endpoint}/draft`, "PUT", () =>
    button(page, /保存草稿/).click(),
  );
  assert.equal(saved.draft.title, title);
  assert.equal(saved.draft.revision, before.draft.revision + 1);
  assert.equal(saved.published.version, before.published.version);
  await button(page, /发布新版本/).click();
  const confirmation = dialog(page, /确认发布协议新版本/);
  await button(confirmation, /返回检查|取消/).click();
  assert.equal(
    (await http("GET", "/legal/current")).privacy.version,
    before.published.version,
  );
  const versions = await admin("GET", `${endpoint}/versions`);
  await button(page, new RegExp(`v${versions[0].version}.*`))
    .first()
    .click();
  await visible(page.getByText(/只读历史/));
  await screenshot(page, "legal-draft-and-published-history");
}

async function ordinaryRoster(page) {
  const destination = `/activities/${fixture.routeActivity}/registrations`;
  const activityPath = `/activities/${fixture.routeActivity}`;
  const name = "浏览器合成名单甲";
  const phone = "13900008994";
  const existing = await owner("GET", `${activityPath}/registrations/me`);
  if (existing) throw new Error("示例活动已有报名，使用干净隔离数据库后重跑");
  const signup = await owner("POST", `${activityPath}/registrations`, {
    status: [200, 201],
    body: {
      ...fixture.legal,
      participants: [
        { participantName: name, phone },
        { participantName: "浏览器合成名单乙", phone: "13900008995" },
      ],
    },
  });
  fixture.freeRegistration = fixture.routeActivity;
  const endpoint = `/admin${activityPath}/participants/${signup.participants[0].id}/reveal`;
  await navigateAndRead(
    page,
    destination,
    /报名名单/,
    `/admin${activityPath}/registrations`,
  );
  const person = page.getByRole("row").filter({ hasText: name });
  await visible(person);
  assert.equal(
    await person.getByText(phone, { exact: false }).isVisible(),
    false,
  );
  await visible(page.getByRole("row").filter({ hasText: "浏览器合成名单乙" }));
  const reveal = button(person, /查看/);
  const title = /查看.*(?:资料|联系方式|证件|信息)/;
  await useConfirmation(page, reveal, title, false);
  assert.equal(
    await person.getByText(phone, { exact: false }).isVisible(),
    false,
  );
  await write(page, endpoint, "POST", () =>
    useConfirmation(page, reveal, title, true),
  );
  await visible(person.getByText(phone, { exact: false }));
  await button(person, /隐藏/).click();
  assert.equal(
    await person.getByText(phone, { exact: false }).isVisible(),
    false,
  );
}

async function functions(browser) {
  const page = await createPage(browser);
  try {
    await login(page);
    await check("通知加载、模拟失败与真实重试", page, () =>
      errorRecovery(page),
    );
    await check("通知配置及重新授权后的原通知重排（合成响应）", null, () =>
      notificationRecovery(browser),
    );
    await check("同版本退款申请替换后的重新读取与确认（合成响应）", null, () =>
      activityRefundReplacement(browser),
    );
    await check("运营范围、待办错误恢复与审计筛选", page, () =>
      operationsWorkflow(page),
    );
    await check("管理员账号演示身份只读及公开能力状态一致", page, () =>
      accountReadOnly(page),
    );
    if (process.env.WILDBOY_E2E_ACCOUNT === "1")
      await check("管理员真实密码登录、错误重验证及取消设置", null, () =>
        passwordAccount(browser),
      );
    await check("未经授权和退出后的活动订单深链", page, async () => {
      // 退出登录先弹确认框，确认后才回到登录页。
      await button(page, /退出登录/).click();
      await button(dialog(page, /退出登录/).last(), /^退出登录$/).click();
      await page.waitForURL(atLogin, headingTimeout);
      await page.goto(`${web}/#/activity-orders`);
      await page.waitForURL(atLogin, headingTimeout);
      await login(page);
    });
    if (!mutations) return;
    let activity, tier, category, product, shopOrder;
    await check("浏览器创建活动草稿并由 API 读取", page, async () => {
      activity = await activityCreate(page, qa("活动"));
    });
    if (activity) {
      await check("390px 草稿定价控件可用", page, async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await priceActivity(page, activity);
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await check("收费活动显式发布", page, async () => {
        if (
          (await admin("GET", `/admin/activities/${activity.id}`))
            .priceCents === 0
        )
          await priceActivity(page, activity);
        await publishActivity(page, activity);
        activity = await http("GET", `/activities/${activity.id}`);
      });
      await check("活动名称全局查询并返回对应编辑页", page, () =>
        filterActivity(page, activity),
      );
    }
    await check("浏览器创建双业务优惠并分配会员", page, async () => {
      tier = await createTier(page);
    });
    await check("浏览器创建商品分类", page, async () => {
      category = await createCategory(page);
    });
    if (category)
      await check("浏览器创建双价商品并核对公开数据", page, async () => {
        product = await createProduct(page, category);
      });
    if (product)
      await check("商品商业字段变更撤回及确认保存", page, () =>
        editProduct(page, product),
      );
    if (tier && product) {
      await check("免支付商城订单获取与发货确认/取消", page, async () => {
        shopOrder = await orderShipping(page, product);
      });
      if (shopOrder)
        await check("商城收货资料确认、隐藏及离页清除", page, () =>
          shopPrivacy(page, shopOrder),
        );
    }
    if (tier && activity?.status === "PUBLISHED" && activity.priceCents > 0) {
      let activityOrder;
      await check(
        "收费活动免支付报名、隐私揭示和取消释放名额",
        page,
        async () => {
          activityOrder = await freeActivityOrder(page, activity);
        },
      );
      if (activityOrder)
        await check("用户脱敏报名历史可定位本笔收费活动订单", page, () =>
          userOrderHistory(page, activity, activityOrder),
        );
    }
    if (activity)
      await check("复制旧活动为继承价格的新草稿", page, () =>
        copyActivityWorkflow(page, activity),
      );
    let article;
    await check("文章草稿、图文、取消发布与真实公开发布", page, async () => {
      article = await articleWorkflow(page);
    });
    if (article)
      await check("首页入口关联公开文章并验证小程序公开 API", page, () =>
        shortcutWorkflow(page, article),
      );
    const independent = await createPage(browser);
    try {
      await login(independent);
      await check("保存并预览协议草稿，不发布且可读历史", independent, () =>
        policyWorkflow(independent),
      );
      await check("普通报名名单两位参与者、确认揭示与隐藏", independent, () =>
        ordinaryRoster(independent),
      );
    } finally {
      await independent.context().close();
    }
    if (!category) report.skipped.push("商品创建：缺少已通过的分类前置数据");
    if (!product || !tier)
      report.skipped.push("商品免支付发货：缺少已通过的商品或会员前置数据");
    if (!tier || activity?.status !== "PUBLISHED")
      report.skipped.push("收费活动免支付：缺少已通过的活动或会员前置数据");
    if (!article) report.skipped.push("首页入口联动：缺少已通过的文章前置数据");
  } finally {
    await page.context().close();
  }
}

async function cleanup() {
  if (fixture.freeRegistration)
    await owner(
      "DELETE",
      `/activities/${fixture.freeRegistration}/registrations/me`,
      { status: [200, 204] },
    );
  if (fixture.privacyDraft) {
    const endpoint = "/admin/legal/PRIVACY";
    const current = await admin("GET", endpoint);
    if (current.draft.title === qa("隐私草稿")) {
      const { title, content } = fixture.privacyDraft;
      await admin("PUT", `${endpoint}/draft`, {
        body: { title, content, revision: current.draft.revision },
      });
      report.fixtures.privacyDraftRestored = true;
    }
  }
  if (fixture.shortcutsBefore) {
    const now = await admin("GET", "/admin/home/layout");
    if (
      now.shortcuts?.items?.some(
        (item) => item.articleId === report.fixtures.article,
      )
    )
      await admin("PUT", "/admin/home/layout", {
        body: { ...fixture.shortcutsBefore, version: now.version },
      });
  }
  if (report.fixtures.article) {
    const endpoint = `/admin/articles/${report.fixtures.article}`;
    const article = await admin("GET", endpoint);
    if (article.status === "PUBLISHED")
      await admin("POST", `${endpoint}/unpublish`, {
        body: { version: article.version },
      });
    if (article.isOfficial && fixture.previousOfficial) {
      const previous = `/admin/articles/${fixture.previousOfficial}`;
      const old = await admin("GET", previous);
      await admin("POST", `${previous}/official`, {
        body: { version: old.version },
      });
    }
  }
  if (fixture.membershipBefore) {
    const before = fixture.membershipBefore;
    const current = await owner("GET", "/me/membership");
    if (
      before.customerType !== current.customerType ||
      before.tierId !== current.tierId
    )
      await admin("PUT", `/admin/membership/users/${fixture.userId}`, {
        body: {
          customerType: before.customerType,
          tierId: before.tierId,
          version: current.version,
        },
      });
  }
  // Catalog, order and audit history is retained in the disposable QA database.
  // Withdraw any published fixture and stop selling any synthetic product.
  if (report.fixtures.activityOrder) {
    const id = report.fixtures.activityOrder;
    const order = await owner("GET", `/activity-orders/${id}`);
    if (order.status === "CONFIRMED_FREE")
      await owner("POST", `/activity-orders/${id}/cancel`, { body: {} });
  }
  if (report.fixtures.activity) {
    const id = report.fixtures.activity;
    const a = await admin("GET", `/admin/activities/${id}`);
    if (a.status === "PUBLISHED")
      await admin("POST", `/admin/activities/${id}/cancel`, {
        body: { version: a.version },
      });
  }
  if (report.fixtures.product) {
    const id = report.fixtures.product;
    const products = await admin("GET", "/admin/shop/products");
    const p = products.find((item) => item.id === id);
    if (p?.status === "ON_SALE")
      await admin("PUT", `/admin/shop/products/${id}`, {
        body: {
          name: p.name,
          description: p.description,
          imageUrl: p.imageUrl,
          categoryId: p.categoryId,
          originalPriceCents: p.originalPriceCents,
          priceCents: p.priceCents,
          stock: p.stock,
          status: "OFF_SHELF",
          version: p.version,
        },
      });
  }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  let browser;
  try {
    await init();
    const launch = process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {
          channel:
            process.env.PLAYWRIGHT_CHANNEL ||
            (process.platform === "win32" ? "msedge" : undefined),
        };
    browser = await chromium.launch({ ...launch, headless: true });
    report.engine = browser.version();
    if (process.env.WILDBOY_E2E_SKIP_LAYOUT !== "1") await layouts(browser);
    await functions(browser);
  } catch (error) {
    report.fatal = String(error.message).slice(0, 1500);
    console.error(report.fatal);
  } finally {
    if (mutations)
      await check("清理合成活动、下架商品、恢复配置与用户身份", null, cleanup);
    await browser?.close();
    report.passed =
      !report.fatal &&
      !report.browserErrors.length &&
      report.checks.every((entry) => entry.passed);
    await fs.writeFile(
      path.join(output, "report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log(
      `${report.checks.filter((item) => item.passed).length}/${report.checks.length} passed. ${output}`,
    );
    process.exitCode = report.passed ? 0 : 1;
  }
}

void main();
