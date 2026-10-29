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
test("normal My separate from registrations never routes USER to management", async () => {
  const p = page("mine");
  await p.load();
  p.manage();
  assert.equal(navigations.length, 0);
  p.registrations();
  assert.deepEqual(navigations, ["/pages/registrations/index"]);
});
test("My ADMIN entry relies on server me and hides profile in background", async () => {
  role = "ADMIN";
  const p = page("mine");
  await p.load();
  p.manage();
  assert.equal(navigations[0], "/pages/admin-activities/index");
  p.onHide();
  assert.equal(p.data.user, null);
});
test("My failed role check cannot retain management identity", async () => {
  role = "ADMIN";
  const p = page("mine");
  await p.load();
  api.getCurrentUser = async () => {
    throw new Error("expired");
  };
  await p.load();
  assert.equal(p.data.user, null);
  p.manage();
  assert.deepEqual(navigations, []);
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
    "/pages/registrations/index",
    "/pages/login/index?mode=consent",
  ]);
});
