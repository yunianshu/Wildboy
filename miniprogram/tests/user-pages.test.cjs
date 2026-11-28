const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
let definition, navigations, calls, signedIn, role, response;
const legal = {
  ready: true,
  privacy: {
    kind: "PRIVACY",
    version: 1,
    title: "隐私",
    content: "当前隐私正文",
    publishedAt: "2026-10-26T00:00:00Z",
  },
  terms: {
    kind: "TERMS",
    version: 1,
    title: "条款",
    content: "当前条款正文",
    publishedAt: "2026-10-26T00:00:00Z",
  },
};
global.Page = (d) => (definition = d);
global.wx = {
  navigateTo: (o) => navigations.push(o.url),
  redirectTo: (o) => navigations.push(o.url),
  switchTab: (o) => navigations.push(o.url),
  showModal: async () => ({ confirm: true }),
  stopPullDownRefresh() {},
};
function page(name) {
  const path = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[path];
  require(path);
  const instance = {
    ...definition,
    data: structuredClone(definition.data),
    setData(data) {
      Object.assign(this.data, data);
    },
  };
  for (const k of Object.keys(instance))
    if (typeof instance[k] === "function")
      instance[k] = instance[k].bind(instance);
  return instance;
}
const activity = {
  id: "activity-1",
  title: "真实接口活动",
  category: "WEEKLY",
  coverUrl: "/assets/category-weekly.jpg",
  galleryUrls: [],
  summary: "",
  description: "",
  location: "地点",
  meetingPoint: "集合点",
  startAt: "2099-11-07T06:30:00+08:00",
  endAt: "2099-11-07T12:00:00+08:00",
  registrationDeadline: "2099-11-06T18:00:00+08:00",
  capacity: 20,
  registeredCount: 2,
  status: "PUBLISHED",
  priceCents: 0,
  currency: "CNY",
  version: 1,
  createdAt: "2026-10-26T00:00:00Z",
  updatedAt: "2026-10-26T00:00:00Z",
};
const registration = {
  id: "reg-1",
  activityId: "activity-1",
  activityTitle: activity.title,
  status: "CONFIRMED",
  createdAt: "2026-10-26T00:00:00Z",
  participants: [
    {
      id: "participant-1",
      participantName: "测试",
      idNumber: "11010519491231002X",
      phone: "13800000000",
    },
  ],
};
beforeEach(() => {
  navigations = [];
  calls = [];
  signedIn = true;
  role = "USER";
  response = async () => ({ items: [], page: 0, total: 0, hasMore: false });
  api.request = async (path, method, data) => {
    if (path === "/legal/current") return structuredClone(legal);
    calls.push({ path, method, data });
    return response(path, method, data);
  };
  api.hasSession = () => signedIn;
  api.sessionVersion = () => 1;
  api.isSessionCurrent = () => true;
  api.getCurrentUser = async () => ({ id: "u", nickname: "微信用户", role });
  api.login = async () => {
    signedIn = true;
  };
  api.logout = () => {
    signedIn = false;
  };
  api.requireSession = async () => {};
});
test("normal My page opens the unified activity hub", async () => {
  const p = page("mine");
  await p.load();
  p.registrations();
  assert.deepEqual(navigations, ["/pages/my-activities/index"]);
  p.onHide();
  assert.equal(p.data.user.id, "u");
});
const input = value => ({ detail: { value } });
const allActivities = "/activities?page=0&size=10";
const waitForActivitySearch = () => new Promise(resolve => setImmediate(resolve));

test("activity search debounces typing, searches all categories and keeps the keyword when collapsed", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = page("activities");
  p.setData({ selected: "WEEKLY" });
  p.openSearch();
  p.updateSearchInput(input("海"));
  t.mock.timers.tick(200);
  p.updateSearchInput(input(" 海岸 "));
  assert.equal(p.data.searchInput, " 海岸 ");
  assert.equal(p.data.selected, "");
  p.onReachBottom();
  p.closeSearch();
  t.mock.timers.tick(249);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls.map(x => x.path), [allActivities + "&title=" + encodeURIComponent("海岸")]);
  await waitForActivitySearch();
  p.openSearch();
  assert.equal(p.data.searchInput, " 海岸 ");
});

test("activity search ignores a response that arrives after typing a new keyword and before its debounce", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = page("activities");
  let resolveOld;
  response = () => new Promise(resolve => { resolveOld = resolve; });
  p.updateSearchInput(input("old"));
  t.mock.timers.tick(250);
  p.updateSearchInput(input("new"));
  resolveOld({ items: [activity], page: 0, hasMore: true });
  await waitForActivitySearch();
  assert.deepEqual(p.data.items, []);
  response = async () => ({ items: [{ ...activity, id: "new-activity" }], page: 0, hasMore: true });
  t.mock.timers.tick(250);
  await waitForActivitySearch();
  assert.deepEqual(p.data.items.map(item => item.id), ["new-activity"]);
});

test("keyboard search flushes once, and clear invalidates the result and restores all activities", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = page("activities");
  let resolveSearch;
  response = () => new Promise(resolve => { resolveSearch = resolve; });
  p.updateSearchInput(input(" coast "));
  p.search(input(" coast "));
  t.mock.timers.tick(250);
  assert.deepEqual(calls.map(x => x.path), [allActivities + "&title=coast"]);

  response = async () => ({ items: [activity], page: 0, hasMore: false });
  p.clearSearch();
  assert.equal(p.data.searchTitle, "");
  assert.equal(p.data.searchInput, "");
  assert.equal(calls[1].path, allActivities);
  resolveSearch({ items: [], page: 0, hasMore: false });
  await waitForActivitySearch();
  assert.deepEqual(p.data.items.map(item => item.id), [activity.id]);
});

test("selecting a category clears pending search and unloading cancels it", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const p = page("activities");
  p.updateSearchInput(input("coast"));
  p.select({ currentTarget: { dataset: { code: "WEEKLY" } } });
  t.mock.timers.tick(250);
  assert.equal(p.data.searchTitle, "");
  assert.deepEqual(calls.map(x => x.path), [allActivities + "&category=WEEKLY"]);
  p.updateSearchInput(input("trail"));
  p.onUnload();
  t.mock.timers.tick(250);
  assert.equal(calls.length, 1);
  await waitForActivitySearch();
});

test("detail will not start a new registration during the existing registration check", async () => {
  const p = page("detail");
  p.setData({ id: activity.id, activity: { ...activity, enabled: true } });
  let resolveRegistration;
  response = path => path.endsWith("/registrations/me")
    ? new Promise(resolve => { resolveRegistration = resolve; })
    : Promise.resolve(activity);
  const pending = p.load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.data.registrationSyncing, true);
  p.register();
  assert.deepEqual(navigations, []);
  resolveRegistration(registration);
  await pending;
  assert.equal(p.data.registrationSyncing, false);
  assert.equal(p.data.registration.id, registration.id);
});
test("My failed account load cannot retain identity", async () => {
  role = "USER";
  const p = page("mine");
  await p.load();
  api.getCurrentUser = async () => {
    throw new Error("expired");
  };
  await p.load();
  assert.equal(p.data.user, null);
});
test("registration status is server global query and filtered total", async () => {
  const p = page("registrations");
  p.setData({ status: "CANCELLED" });
  response = async () => ({
    items: [{ ...registration, status: "CANCELLED" }],
    page: 0,
    total: 1,
    hasMore: false,
  });
  await p.load();
  assert.match(calls[0].path, /status=CANCELLED/);
  assert.equal(p.data.total, 1);
});
test("old registration response cannot replace newer filter", async () => {
  const p = page("registrations");
  let finish;
  response = () => new Promise((resolve) => (finish = resolve));
  const old = p.load();
  p.setData({ status: "CANCELLED" });
  response = async () => ({ items: [], page: 0, total: 0, hasMore: false });
  await p.load();
  finish({ items: [registration], page: 0, total: 1, hasMore: false });
  await old;
  assert.deepEqual(p.data.items, []);
});
test("page hide blocks old private registration response", async () => {
  const p = page("registrations");
  let finish;
  response = () => new Promise((resolve) => (finish = resolve));
  const pending = p.load();
  p.onHide();
  finish({ items: [registration], page: 0, total: 1, hasMore: false });
  await pending;
  assert.deepEqual(p.data.items, []);
});
function filled() {
  const p = page("register");
  p.setData({
    id: activity.id,
    activity: { ...activity, enabled: true, available: 20 },
    participants: [
      {
        participantName: "测试",
        idNumber: "11010519491231002X",
        phone: "13800000000",
      },
    ],
    consent: true,
    legal: structuredClone(legal),
    privacyRead: true,
    termsRead: true,
  });
  return p;
}

test("register resumes interrupted loading when returning to the page", async () => {
  const p = page("register");
  p.setData({id: activity.id, loading: true});
  p.onHide();
  response = async () => activity;
  p.onShow();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.data.loading, false);
  assert.equal(p.data.activity.id, activity.id);
});

test("failed native cancel confirmation unlocks the detail without cancelling registration", async () => {
  const p = page("detail");
  p.setData({id: activity.id, activity: {...activity, canCancel: true}, loading: false});
  const originalModal = wx.showModal;
  wx.showModal = async () => { throw new Error("native modal failed"); };
  try {
    await p.cancel();
    assert.equal(p.data.cancelling, false);
    assert.equal(calls.filter(c => c.method === "DELETE").length, 0);
    assert.match(p.data.registrationError, /native modal failed/);
  } finally {
    wx.showModal = originalModal;
  }
});

test("register discards personal draft and consent after switching accounts", () => {
  const p = filled();
  p.setData({session: 1, loading: false});
  p.onHide();
  api.sessionVersion = () => 2;
  p.onShow();
  assert.equal(p.data.participants[0].participantName, "");
  assert.equal(p.data.participants[0].phone, "");
  assert.equal(p.data.participants[0].idNumber, "");
  assert.equal(p.data.consent, false);
  assert.equal(p.data.privacyRead, false);
});

test("registration keeps a guest draft after the first login", () => {
  const p = filled();
  signedIn = false;
  api.sessionVersion = () => 1;
  p.onLoad({ id: "" });
  p.setData({ loading: false, fieldError: "" });
  const draft = structuredClone(p.data.participants);
  p.onHide();
  signedIn = true;
  api.sessionVersion = () => 2;
  p.onShow();
  assert.deepEqual(p.data.participants, draft);
  assert.equal(p.data.fieldError, "");
});

test("register cannot send an earlier user's draft after identity changes during legal refresh", async () => {
  const p = filled();
  let session = 1;
  api.sessionVersion = () => session;
  api.isSessionCurrent = value => value === session;
  api.request = async (path, method) => {
    calls.push({path, method});
    if (path === "/legal/current") {
      session++;
      return structuredClone(legal);
    }
    return registration;
  };
  await p.submit();
  assert.equal(calls.filter(c => c.method === "POST").length, 0);
  assert.equal(p.data.participants[0].participantName, "");
  assert.equal(p.data.submitting, false);
});
test("signup navigates only after confirmed response", async () => {
  const p = filled();
  response = async () => registration;
  await p.submit();
  assert.equal(p.data.success, true);
  assert.equal(p.data.participants[0].participantName, "");
  assert.equal(
    navigations[0],
    "/pages/signup-success/index?id=activity-1&registrationId=reg-1",
  );
});
test("signup adds a second participant and submits the full group", async () => {
  const p = filled();
  p.addParticipant();
  assert.equal(p.data.participants.length, 1);
  assert.equal(p.data.participantModalOpen, true);
  p.setData({ participantDraft: {
    participantName: "第二位",
    idNumber: "110105194912310038",
    phone: "13800000001",
  } });
  p.confirmParticipant();
  assert.equal(p.data.participantModalOpen, false);
  assert.equal(p.data.participants.length, 2);
  response = async () => ({
    ...registration,
    participants: [
      ...registration.participants,
      {
        id: "participant-2",
        participantName: "第二位",
        idNumber: "110105194912310038",
        phone: "13800000001",
      },
    ],
  });
  await p.submit();
  assert.equal(calls[0].data.participants.length, 2);
  assert.equal(p.data.success, true);
});
test("malformed signup never pretends success", async () => {
  const p = filled();
  response = async () => null;
  await p.submit();
  assert.equal(p.data.success, false);
  assert.equal(navigations.length, 0);
  assert.match(p.data.fieldError, /未确认/);
});
test("double signup makes only one in flight request", async () => {
  const p = filled();
  let finish;
  response = () => new Promise((resolve) => (finish = resolve));
  const pending = p.submit();
  await new Promise((resolve) => setImmediate(resolve));
  await p.submit();
  assert.equal(calls.length, 1);
  finish(registration);
  await pending;
});
test("success deeplink cannot manufacture confirmed registration", async () => {
  const p = page("signup-success");
  p.onLoad({ id: activity.id, registrationId: registration.id });
  response = async (path) =>
    path.endsWith("/registrations/me") ? null : activity;
  await p.load();
  assert.equal(p.data.confirmed, false);
});
test("success uses matching server record and real activity", async () => {
  const p = page("signup-success");
  p.onLoad({ id: activity.id, registrationId: registration.id });
  response = async (path) =>
    path.endsWith("/registrations/me") ? registration : activity;
  await p.load();
  assert.equal(p.data.confirmed, true);
  assert.equal(p.data.activity.title, activity.title);
  p.onHide();
  assert.equal(p.data.activity, null);
});
test("cancelled or another registration is not a success", async () => {
  for (const r of [
    { ...registration, status: "CANCELLED" },
    { ...registration, id: "another" },
  ]) {
    const p = page("signup-success");
    p.onLoad({ id: activity.id, registrationId: registration.id });
    response = async (path) =>
      path.endsWith("/registrations/me") ? r : activity;
    await p.load();
    assert.equal(p.data.confirmed, false);
  }
});
test("category race keeps newest response", async () => {
  const p = page("activities");
  let finish;
  response = () => new Promise((resolve) => (finish = resolve));
  const old = p.load();
  p.setData({ selected: "HOLIDAY" });
  response = async () => ({
    items: [{ ...activity, id: "new" }],
    page: 0,
    total: 1,
    hasMore: false,
  });
  await p.load();
  finish({ items: [activity], page: 0, total: 1, hasMore: false });
  await old;
  assert.equal(p.data.items[0].id, "new");
});
test("My shows published agreement update without blocking old registrations", async () => {
  const p = page("mine");
  response = async () => ({
    ready: true,
    requiresConsent: true,
    current: { privacyVersion: 2, termsVersion: 1 },
  });
  await p.load();
  assert.equal(p.data.requiresConsent, true);
  assert.equal(p.data.user.role, "USER");
  p.registrations();
  p.confirmLegal();
  assert.deepEqual(navigations, [
    "/pages/my-activities/index",
    "/pages/login/index?mode=consent",
  ]);
});

test("activity hub groups both record types and routes without mixing messages", async () => {
  const { readFileSync } = require("node:fs");
  const mine = readFileSync(require.resolve("../dist/pages/mine/index.wxml"), "utf8");
  assert.match(mine, /我的活动/);
  assert.doesNotMatch(mine, /bindtap="(?:notifications|activityOrders)"/);
  const p = page("my-activities");
  p.onLoad({});
  const createdAt = "2026-11-24T15:00:00Z";
  response = async path => path.startsWith("/me/activity-records")
    ? { page: 0, hasMore: false, items: [
        { id: "same", kind: "ORDER", title: "Paid", status: "PENDING_PAYMENT",
          totalCents: 1600, activityId: "activity", createdAt },
        { id: "same", kind: "FREE", title: "Free", status: "CONFIRMED",
          totalCents: null, activityId: "free-activity", createdAt },
      ] }
    : { page: 0, hasMore: false, items: [{ id: "notice", activityId: "activity",
        title: "Notice", detail: "Updated venue", createdAt }] };
  await p.load();
  assert.deepEqual(p.data.items.map(i => i.id), ["ORDER:same", "FREE:same"]);
  for (const id of ["ORDER:same", "FREE:same"]) p.open({ currentTarget: { dataset: { id } } });
  assert.deepEqual(navigations, ["/pages/activity-orders/index?id=same", "/pages/detail/index?id=free-activity"]);
  p.select({ currentTarget: { dataset: { tab: "messages" } } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(p.data.items[0].title, "Notice");
  p.open({ currentTarget: { dataset: { id: "notice" } } });
  assert.equal(navigations.at(-1), "/pages/detail/index?id=activity");
});

test("activity hub discards a late records response after switching or leaving", async () => {
  const p = page("my-activities");
  p.onLoad({});
  let resolveOld;
  response = path => path.startsWith("/me/activity-records")
    ? new Promise(resolve => { resolveOld = resolve; })
    : Promise.resolve({ page: 0, hasMore: false, items: [] });
  const old = p.load();
  p.select({ currentTarget: { dataset: { tab: "messages" } } });
  p.onHide();
  resolveOld({ page: 0, hasMore: true, items: [{ kind: "FREE", id: "private",
    activityId: "activity", title: "Private", createdAt: "2026-11-24T15:00:00Z" }] });
  await old;
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.hasMore, false);
});

test("search opens over both tab strips, closes without clearing and supports clearing", async () => {
  const { readFileSync } = require("node:fs");
  const searchCss = readFileSync(require.resolve("../dist/styles/category-search.wxss"), "utf8");
  assert.match(searchCss, /\.section-tab-panel-search\s*\{[^}]*margin-top: 12px;[^}]*border-top: 0/);
  for (const name of ["activities", "shop"]) {
    const markup = readFileSync(require.resolve(`../dist/pages/${name}/index.wxml`), "utf8");
    assert.match(markup, /category-search-tabs/);
    assert.match(markup, /wx:if="{{searchOpen}}" class="category-search-layer"/);
    assert.match(markup, /focus="{{searchOpen}}"/);
    assert.match(markup, /class="category-search-field"[\s\S]*?class="category-search-input"/);
    assert.match(markup, /searchOpen \? \u0027section-tab-panel-search\u0027/);
    const p = page(name);
    assert.equal(p.data.searchOpen, false);
    if (name === "activities") {
      assert.match(markup, /bindinput="updateSearchInput"/);
      assert.doesNotMatch(markup, /category-search-submit/);
      p.setData({ searchTitle: "hike", searchInput: "hike" });
    }
    else p.applySearch("boots");
    p.openSearch();
    assert.equal(p.data.searchOpen, true);
    p.closeSearch();
    assert.equal(p.data.searchOpen, false);
    assert.equal(p.data.searchInput, name === "activities" ? "hike" : "boots");
    p.clearSearch();
    assert.equal(p.data.searchInput, "");
  }
});
