// Independent native Page/transport verification. Run after miniprogram build.
// Uses only synthetic accounts and mocked wx; NOT a WeChat-device test.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const DIST = path.resolve(__dirname, "../../miniprogram/dist");
let store, requests, navigations, modalAnswer, transport, api, config;
function fresh() {
  for (const key of Object.keys(require.cache))
    if (key.startsWith(DIST + path.sep)) delete require.cache[key];
  store = {};
  requests = [];
  navigations = [];
  modalAnswer = { confirm: true, cancel: false };
  transport = (o) =>
    o.success({
      statusCode: 404,
      data: { message: "Unmatched synthetic endpoint" },
    });
  global.wx = {
    getStorageSync: (k) => store[k],
    setStorageSync: (k, v) => (store[k] = v),
    removeStorageSync: (k) => delete store[k],
    getAccountInfoSync: () => ({ miniProgram: { envVersion: "develop" } }),
    login: (o) => o.success({ code: "synthetic-once" }),
    request: (o) => {
      requests.push(o);
      transport(o);
    },
    navigateTo: (o) => navigations.push(o.url),
    redirectTo: (o) => navigations.push(o.url),
    switchTab: (o) => navigations.push(o.url),
    navigateBack: (o) => navigations.push("BACK"),
    showToast: () => {},
    showModal: async () => modalAnswer,
    stopPullDownRefresh: () => {},
    setNavigationBarTitle: () => {},
    enableAlertBeforeUnload: () => {},
    disableAlertBeforeUnload: () => {},
    getWindowInfo: () => ({ statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 28, bottom: 60 }),
  };
  config = require(path.join(DIST, "config.js")).config;
  // This isolated transport harness mocks wx.request; native runtime checks run separately.
  config.apiMode = "request";
  config.apiOrigin = "https://wildboy.test";
  config.devLogin = false;
  api = require(path.join(DIST, "utils/api.js"));
}
function respond(o, data, statusCode = 200) {
  o.success({ statusCode, data });
}
function page(name) {
  let def;
  global.Page = (x) => (def = x);
  const file = path.join(DIST, "pages", name, "index.js");
  delete require.cache[require.resolve(file)];
  require(file);
  assert.ok(def, `Page ${name} registered`);
  const p = {
    ...def,
    data: structuredClone(def.data),
    setData(update) {
      for (const [k, v] of Object.entries(update)) {
        const parts = k.split(".");
        let node = this.data;
        for (const part of parts.slice(0, -1)) node = node[part] ??= {};
        node[parts.at(-1)] = v;
      }
    },
  };
  for (const [k, v] of Object.entries(p))
    if (typeof v === "function") p[k] = v.bind(p);
  return p;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(fresh);
const legalFixture = { ready: true, privacy: { kind: "PRIVACY", version: 1, title: "Test privacy", content: "Synthetic policy content" }, terms: { kind: "TERMS", version: 1, title: "Test terms", content: "Synthetic agreement content" } };
test("admin authentication validates role and never persists the submitted password", async () => {
  transport = (o) =>
    respond(o, {
      token: "admin-session",
      user: { id: "admin", role: "ADMIN", nickname: "Synthetic admin" },
    });
  await api.adminLogin("operator", "only-this-test-password");
  assert.equal(store["wildboy-session"], "admin-session");
  assert.equal(
    JSON.stringify(store).includes("only-this-test-password"),
    false,
  );
  assert.equal(requests[0].url, "https://wildboy.test/api/v1/auth/admin");
});
test("non-admin authentication result does not create an administrator session", async () => {
  transport = (o) =>
    respond(o, { token: "ordinary-session", user: { id: "u", role: "USER" } });
  await assert.rejects(
    api.adminLogin("operator", "test-password"),
    (e) => e.status === 403,
  );
  assert.equal(api.hasSession(), false);
});
test("logout while administrator login is pending cannot resurrect the session", async () => {
  let pending;
  transport = (o) => (pending = o);
  const result = api.adminLogin("operator", "test-password");
  api.logout();
  respond(pending, { token: "late-admin", user: { id: "a", role: "ADMIN" } });
  await assert.rejects(result);
  assert.equal(api.hasSession(), false);
});
test("late response from old account is rejected and cannot clear the new account", async () => {
  store["wildboy-session"] = "old";
  let pending;
  transport = (o) => (pending = o);
  const result = api.request("/admin/activities");
  api.logout();
  store["wildboy-session"] = "new";
  respond(pending, { items: [{ title: "Old confidential activity" }] });
  await assert.rejects(result, (e) => e.code === "SESSION_CHANGED");
  assert.equal(store["wildboy-session"], "new");
});
test("invalid current-user identity is rejected rather than treated as an administrator", async () => {
  store["wildboy-session"] = "session";
  transport = (o) => respond(o, { id: "a", role: "SUPERUSER" });
  await assert.rejects(api.getCurrentUser());
});
function event(data) {
  return { currentTarget: { dataset: data }, detail: {} };
}
function fixtureActivity(overrides = {}) {
  return {
    id: "activity-1",
    title: "Synthetic forest hike",
    category: "WEEKLY",
    coverUrl: "/assets/category-weekly.jpg",
    galleryUrls: [],
    summary: "Synthetic summary",
    description: "Synthetic description",
    location: "Synthetic mountain",
    meetingPoint: "Synthetic meeting point",
    startAt: "2099-11-07T06:30:00+08:00",
    endAt: "2099-11-07T12:00:00+08:00",
    registrationDeadline: "2099-11-06T18:00:00+08:00",
    capacity: 20,
    registeredCount: 0,
    status: "DRAFT",
    priceCents: 0,
    currency: "CNY",
    version: 3,
    ...overrides,
  };
}
function pageResult(items) {
  return { items, total: items.length, page: 0, size: 20, hasMore: false };
}
test("My management entry uses verified server ADMIN, not token presence alone", async () => {
  store["wildboy-session"] = "ordinary-token";
  transport = (o) =>
    respond(o, { id: "ordinary", nickname: "User", role: "USER" });
  const p = page("mine");
  await p.load();
  p.manage();
  assert.equal(navigations.length, 0);
  transport = (o) =>
    respond(o, { id: "admin", nickname: "Operator", role: "ADMIN" });
  await p.load();
  p.manage();
  assert.deepEqual(navigations, ["/pages/admin-activities/index"]);
  p.onHide();
  assert.equal(p.data.user, null);
});
test("direct admin list opening by USER stops before requesting private list", async () => {
  store["wildboy-session"] = "user-token";
  transport = (o) => respond(o, { id: "u", role: "USER" });
  const p = page("admin-activities");
  await p.load(true);
  assert.equal(p.data.authorized, false);
  assert.deepEqual(p.data.items, []);
  assert.equal(
    requests.filter((o) => o.url.includes("/admin/activities")).length,
    0,
  );
  p.create();
  assert.equal(navigations.length, 0);
});
test("admin list can navigate create/edit/roster only after role verification", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/me")
        ? { id: "a", role: "ADMIN" }
        : pageResult([fixtureActivity()]),
    );
  const p = page("admin-activities");
  await p.load(true);
  p.create();
  p.edit(event({ id: "activity-1" }));
  p.roster(event({ id: "activity-1" }));
  assert.deepEqual(navigations, [
    "/pages/admin-editor/index",
    "/pages/admin-editor/index?id=activity-1",
    "/pages/admin-roster/index?id=activity-1",
  ]);
  api.logout();
  p.create();
  assert.equal(navigations.length, 3);
});
test("canceling in-page publish confirmation sends no mutation", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/me")
        ? { id: "a", role: "ADMIN" }
        : pageResult([fixtureActivity()]),
    );
  const p = page("admin-activities");
  await p.load(true);
  await p.change(event({ id: "activity-1", action: "publish" }));
  await p.change(event({ id: "activity-1", action: "publish" }));
  assert.equal(p.data.pendingId, "activity-1");
  p.cancelChange();
  assert.equal(requests.filter((o) => o.method === "POST").length, 0);
  assert.equal(p.data.pendingId, "");
});
test("in-page confirmation executes the confirmed admin mutation", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/me")
        ? { id: "a", role: "ADMIN" }
        : o.method === "POST"
          ? respond(o, fixtureActivity({ status: "CANCELLED" }))
          : pageResult([fixtureActivity()]),
    );
  const p = page("admin-activities");
  await p.load(true);
  await p.change(event({ id: "activity-1", action: "cancel" }));
  await p.confirmChange();
  assert.equal(requests.filter((o) => o.method === "POST").length, 1);
});
test("switching accounts during confirmation blocks the old admin mutation", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/me")
        ? { id: "a", role: "ADMIN" }
        : pageResult([fixtureActivity()]),
    );
  const p = page("admin-activities");
  await p.load(true);
  await p.change(event({ id: "activity-1", action: "cancel" }));
  api.logout();
  store["wildboy-session"] = "user-token";
  await p.confirmChange();
  assert.equal(requests.filter((o) => o.method === "POST").length, 0);
});
test("publish includes exact current version and conflict is not shown as success", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) => {
    if (o.url.endsWith("/me")) respond(o, { id: "a", role: "ADMIN" });
    else if (o.method === "POST")
      respond(o, { message: "Version changed", code: "STALE" }, 409);
    else respond(o, pageResult([fixtureActivity({ version: 7 })]));
  };
  const p = page("admin-activities");
  await p.load(true);
  await p.change(event({ id: "activity-1", action: "publish" }));
  await p.confirmChange();
  const mutation = requests.find((o) => o.method === "POST");
  assert.equal(
    mutation.url,
    "https://wildboy.test/api/v1/admin/activities/activity-1/publish",
  );
  assert.deepEqual(mutation.data, { version: 7 });
  assert.match(p.data.error, /刷新|变化/);
  assert.equal(p.data.items[0].status, "DRAFT");
});
const registration = {
  id: "registration-1",
  activityId: "activity-1",
  activityTitle: "Synthetic forest hike",
  status: "CONFIRMED",
  createdAt: "2099-10-25T08:00:00+08:00",
  participants: [
    {
      id: "participant-1",
      participantName: "Synthetic participant",
      idNumber: "11010519491231002X",
      phone: "13800000000",
    },
  ],
};
test("signup success refuses forged registration IDs and cancelled records", async () => {
  store["wildboy-session"] = "user-token";
  const p = page("signup-success");
  p.onLoad({ id: "activity-1", registrationId: "forged-id" });
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/registrations/me")
        ? registration
        : fixtureActivity({ status: "PUBLISHED" }),
    );
  await p.load();
  assert.equal(p.data.confirmed, false);
  assert.match(p.data.error, /有效报名/);
  p.onLoad({ id: "activity-1", registrationId: "registration-1" });
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/registrations/me")
        ? { ...registration, status: "CANCELLED" }
        : fixtureActivity({ status: "PUBLISHED" }),
    );
  await p.load();
  assert.equal(p.data.confirmed, false);
});
test("signup success displays only verified own confirmed registration and clears on hide", async () => {
  store["wildboy-session"] = "user-token";
  const p = page("signup-success");
  p.onLoad({ id: "activity-1", registrationId: "registration-1" });
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/registrations/me")
        ? registration
        : fixtureActivity({ status: "PUBLISHED" }),
    );
  await p.load();
  assert.equal(p.data.confirmed, true);
  assert.equal(p.data.activity.id, "activity-1");
  p.onHide();
  assert.equal(p.data.confirmed, false);
  assert.equal(p.data.activity, null);
});
test("registration does not claim success for malformed successful HTTP response", async () => {
  store["wildboy-session"] = "user-token";
  const p = page("register");
  p.setData({
    id: "activity-1",
    activity: { enabled: true, available: 20 },
    participants: [
      {
        participantName: "Synthetic participant",
        idNumber: "11010519491231002X",
        phone: "13800000000",
      },
    ],
    consent: true,
    legal: legalFixture,
    privacyRead: true,
    termsRead: true,
  });
  transport = (o) => respond(o, o.url.endsWith("/legal/current") ? legalFixture : { notARegistration: true });
  await p.submit();
  assert.equal(p.data.success, false);
  assert.equal(navigations.length, 0);
  assert.match(p.data.fieldError, /未确认/);
});
test("registration submits once and links returned receipt without participant PII", async () => {
  store["wildboy-session"] = "user-token";
  const p = page("register");
  p.setData({
    id: "activity-1",
    activity: { enabled: true, available: 20 },
    participants: [
      {
        participantName: "Synthetic participant",
        idNumber: "11010519491231002X",
        phone: "13800000000",
      },
    ],
    consent: true,
    legal: legalFixture,
    privacyRead: true,
    termsRead: true,
  });
  let pending;
  transport = (o) => o.url.endsWith("/legal/current") ? respond(o, legalFixture) : (pending = o);
  const first = p.submit();
  await tick();
  await p.submit();
  assert.equal(requests.filter((o) => o.method === "POST").length, 1);
  respond(pending, registration, 201);
  await first;
  assert.equal(p.data.success, true);
  assert.equal(p.data.participants[0].participantName, "");
  assert.equal(p.data.participants.length, 1);
  assert.deepEqual(navigations, [
    "/pages/signup-success/index?id=activity-1&registrationId=registration-1",
  ]);
});
test("my-registration filter is sent to server and private rows clear on hide", async () => {
  store["wildboy-session"] = "user-token";
  transport = (o) => respond(o, pageResult([registration]));
  const p = page("registrations");
  await p.load(true);
  assert.equal(p.data.items.length, 1);
  p.select(event({ status: "CANCELLED" }));
  await tick();
  assert.match(requests.at(-1).url, /&status=CANCELLED$/);
  p.onHide();
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.total, 0);
});
function validForm() {
  return {
    title: "Synthetic forest hike",
    category: "WEEKLY",
    coverUrl: "/assets/category-weekly.jpg",
    galleryText: "",
    summary: "Synthetic summary",
    description: "Synthetic description",
    location: "Synthetic mountain",
    meetingPoint: "Synthetic meeting point",
    startDate: "2099-11-07",
    startTime: "06:30",
    endDate: "2099-11-07",
    endTime: "12:00",
    deadlineDate: "2099-11-06",
    deadlineTime: "18:00",
    capacity: "20",
  };
}
test("abandoning administrator-login page clears password and refuses late authentication", async () => {
  const p = page("admin-login");
  p.setData({ username: "operator", password: "only-this-test-password" });
  let pending;
  transport = (o) => (pending = o);
  const login = p.submit();
  p.onHide();
  assert.equal(p.data.password, "");
  respond(pending, { token: "late-admin", user: { id: "a", role: "ADMIN" } });
  await login;
  assert.equal(api.hasSession(), false);
  assert.equal(navigations.length, 0);
});
test("invalid edit identifier is not silently treated as create", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) => respond(o, { id: "a", role: "ADMIN" });
  const p = page("admin-editor");
  p.onLoad({ id: "../invalid" });
  p.onShow();
  await tick();
  assert.equal(p.data.authorized, false);
  assert.match(p.data.error, /编号无效/);
  assert.equal(requests.length, 0);
});
test("editor creates draft then publishes using the returned server ID and version", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) => {
    if (o.url.endsWith("/me")) return respond(o, { id: "a", role: "ADMIN" });
    if (o.url.endsWith("/publish"))
      return respond(
        o,
        fixtureActivity({
          id: "new-activity",
          status: "PUBLISHED",
          version: 2,
        }),
      );
    return respond(o, fixtureActivity({ id: "new-activity", version: 1 }), 201);
  };
  const p = page("admin-editor");
  p.onLoad({});
  await p.load();
  p.setData({ form: validForm() });
  await p.save(event({ action: "publish" }));
  await p.confirmPublish();
  const writes = requests.filter((o) => o.method === "POST");
  assert.equal(writes.length, 2);
  assert.equal(writes[0].url, "https://wildboy.test/api/v1/admin/activities");
  assert.equal(writes[0].data.priceCents, 0);
  assert.equal(writes[0].data.startAt, "2099-11-07T06:30:00+08:00");
  assert.equal(
    writes[1].url,
    "https://wildboy.test/api/v1/admin/activities/new-activity/publish",
  );
  assert.deepEqual(writes[1].data, { version: 1 });
  assert.equal(p.data.status, "PUBLISHED");
  assert.equal(p.data.id, "new-activity");
});
test("editor cancelled publish confirmation performs neither create nor publish", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) => respond(o, { id: "a", role: "ADMIN" });
  const p = page("admin-editor");
  p.onLoad({});
  await p.load();
  p.setData({ form: validForm() });
  await p.save(event({ action: "publish" }));
  p.cancelPublish();
  assert.equal(requests.filter((o) => o.method === "POST").length, 0);
  assert.equal(p.data.busy, false);
});
test("editor uncertain create failure prevents blind duplicate retries", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    o.url.endsWith("/me") ? respond(o, { id: "a", role: "ADMIN" }) : o.fail({});
  const p = page("admin-editor");
  p.onLoad({});
  await p.load();
  p.setData({ form: validForm() });
  await p.save(event({ action: "draft" }));
  await p.save(event({ action: "draft" }));
  assert.equal(p.data.uncertain, true);
  assert.equal(requests.filter((o) => o.method === "POST").length, 1);
});
test("editor PUT includes optimistic version and conflict disables retry until reload", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    o.url.endsWith("/me")
      ? respond(o, { id: "a", role: "ADMIN" })
      : o.method === "PUT"
        ? respond(o, { message: "Conflict" }, 409)
        : respond(o, fixtureActivity({ version: 9 }));
  const p = page("admin-editor");
  p.onLoad({ id: "activity-1" });
  await p.load();
  await p.save(event({ action: "draft" }));
  await p.save(event({ action: "draft" }));
  const writes = requests.filter((o) => o.method === "PUT");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].data.version, 9);
  assert.equal(p.data.conflict, true);
});
test("roster private fields are masked in data and cleared when leaving", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/me")
        ? { id: "a", role: "ADMIN" }
        : o.url.includes("/registrations?")
          ? pageResult([registration])
          : fixtureActivity(),
    );
  const p = page("admin-roster");
  p.onLoad({ id: "activity-1" });
  await p.load(true);
  assert.equal(p.data.items[0].participants[0].maskedPhone, "138 **** 0000");
  assert.equal(p.data.items[0].participants[0].maskedId, "110105********002X");
  assert.equal(JSON.stringify(p.data).includes("13800000000"), false);
  assert.equal(JSON.stringify(p.data).includes("11010519491231002X"), false);
  p.onHide();
  assert.deepEqual(p.data.items, []);
  assert.deepEqual(p._phones, {});
  assert.deepEqual(p._idNumbers, {});
  assert.equal(p.data.authorized, false);
});
test("roster reveal revalidates role and clears cached participants when access is lost", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    respond(
      o,
      o.url.endsWith("/me")
        ? { id: "a", role: "ADMIN" }
        : o.url.includes("/registrations?")
          ? pageResult([registration])
          : fixtureActivity(),
    );
  const p = page("admin-roster");
  p.onLoad({ id: "activity-1" });
  await p.load(true);
  let dialogs = 0;
  wx.showModal = async () => {
    dialogs++;
    return { confirm: true };
  };
  transport = (o) => respond(o, { id: "a", role: "USER" });
  await p.reveal(event({ id: "participant-1" }));
  assert.equal(dialogs, 0);
  assert.equal(p.data.authorized, false);
  assert.deepEqual(p.data.items, []);
  assert.deepEqual(p._phones, {});
  assert.deepEqual(p._idNumbers, {});
});
test("all configured native pages and WXML handlers exist in final artifact", () => {
  const app = JSON.parse(fs.readFileSync(path.join(DIST, "app.json"), "utf8"));
  const required = [
    "admin-login",
    "admin-activities",
    "admin-editor",
    "admin-roster",
    "mine",
    "registrations",
    "signup-success",
  ];
  for (const name of required) {
    assert.ok(app.pages.includes(`pages/${name}/index`), name);
    const p = page(name),
      wxml = fs.readFileSync(
        path.join(DIST, `pages/${name}/index.wxml`),
        "utf8",
      );
    for (const match of wxml.matchAll(
      /(?:bind|catch)(?::)?[a-zA-Z]+="([a-zA-Z_][\w]*)"/g,
    ))
      assert.equal(
        typeof p[match[1]],
        "function",
        `${name} handler ${match[1]}`,
      );
  }
});
test("definite server validation failure stays editable instead of falsely claiming uncertain creation", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    o.url.endsWith("/me")
      ? respond(o, { id: "a", role: "ADMIN" })
      : respond(o, { message: "Invalid activity", code: "VALIDATION" }, 400);
  const p = page("admin-editor");
  p.onLoad({});
  await p.load();
  p.setData({ form: validForm() });
  await p.save(event({ action: "draft" }));
  assert.equal(p.data.uncertain, false);
  assert.equal(p.data.conflict, false);
  assert.equal(p.data.id, "");
  assert.match(p.data.error, /Invalid/);
});
test("repeated draft save while create is pending sends exactly one create", async () => {
  store["wildboy-session"] = "admin-token";
  let pending;
  transport = (o) =>
    o.url.endsWith("/me")
      ? respond(o, { id: "a", role: "ADMIN" })
      : (pending = o);
  const p = page("admin-editor");
  p.onLoad({});
  await p.load();
  p.setData({ form: validForm() });
  const first = p.save(event({ action: "draft" }));
  await tick();
  await p.save(event({ action: "draft" }));
  assert.equal(requests.filter((o) => o.method === "POST").length, 1);
  respond(pending, fixtureActivity({ id: "created-once", version: 1 }), 201);
  await first;
  assert.equal(p.data.id, "created-once");
});
test("expired administrator editor mutation clears sensitive form and authorization", async () => {
  store["wildboy-session"] = "admin-token";
  transport = (o) =>
    o.url.endsWith("/me")
      ? respond(o, { id: "a", role: "ADMIN" })
      : respond(o, { message: "Expired", code: "UNAUTHENTICATED" }, 401);
  const p = page("admin-editor");
  p.onLoad({});
  await p.load();
  p.setData({ form: validForm() });
  await p.save(event({ action: "draft" }));
  assert.equal(p.data.authorized, false);
  assert.equal(p.data.form.title, "");
  assert.equal(api.hasSession(), false);
});
