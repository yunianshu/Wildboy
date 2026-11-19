const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
const legalTools = require("../dist/utils/legal.js");
const policy = { ready: true,
  privacy: { kind: "PRIVACY", version: 1, content: "隐私政策" },
  terms: { kind: "TERMS", version: 1, content: "用户协议" } };
const first = { participantName: "张三", phone: "13800000000", idNumber: "11010519491231002X" };
const activity = { id: "activity", status: "PUBLISHED", priceCents: 0,
  title: "徒步", capacity: 20, registeredCount: 1, startAt: "2099-12-01T08:00:00+08:00",
  registrationDeadline: "2099-11-30T08:00:00+08:00", coverUrl: "/assets/hero-hiking.jpg" };
const record = () => ({ id: "registration", activityId: "activity", status: "CONFIRMED",
  participants: [{ ...first, id: "person", idNumber: "110105********002X" }] });
let definition, session, calls, navigations, handler, actor;
const flush = () => new Promise(resolve => setImmediate(resolve));
function page(name) {
  global.Page = value => { definition = value; };
  const file = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[file]; require(file);
  return { ...definition, data: structuredClone(definition.data),
    setData(values, done) { Object.assign(this.data, values); done?.(); } };
}
function filled() {
  const p = page("register");
  p.setData({ id: "activity", session, loading: false,
    activity: { ...activity, enabled: true, available: 19, identityRequired: true },
    participants: [{ ...first }], legal: structuredClone(policy), consent: true });
  return p;
}
beforeEach(() => {
  session = 1; calls = []; navigations = [];
  actor = { id: "user", role: "USER", profileCompleted: true, realName: "本人", phone: "13900000000" };
  handler = async () => record();
  api.hasSession = () => true;
  api.sessionVersion = () => session;
  api.isSessionCurrent = n => session === n;
  api.requireSession = async () => {};
  api.getCurrentUser = async () => actor;
  api.request = async (url, method = "GET", data) => {
    calls.push({ url, method, data }); return handler(url, method, data);
  };
  legalTools.currentLegal = async () => structuredClone(policy);
  global.wx = { navigateTo: o => navigations.push(o.url), redirectTo: o => navigations.push(o.url),
    navigateBack: () => navigations.push("back"), getStorageSync() {},
    showModal: async () => ({ confirm: true }) };
});

test("a timed-out registration locks edits and retries by reading the saved group, never posting again", async () => {
  const p = filled();
  handler = async (_url, method) => { if (method === "POST") throw Error("网络连接失败"); return record(); };
  await p.submit();
  assert.equal(p.data.recoveryNeeded, true);
  p.inputParticipant({ currentTarget: { dataset: { index: 0, field: "participantName" } }, detail: { value: "李四" } });
  p.addParticipant();
  assert.equal(p.data.participants[0].participantName, "张三");
  assert.equal(p.data.participantModalOpen, false);
  await p.submit();
  assert.deepEqual(calls.map(c => c.method), ["POST", "GET"]);
  assert.match(calls[1].url, /registrations\/me$/);
  assert.equal(p.data.success, true);
  assert.equal(p.data.recoveredRegistration.participants[0].participantName, "张三");
  assert.equal(p.data.recoveryNeeded, false);
  assert.deepEqual(navigations, []);
});

test("an existing registration with different people is shown as the actual saved record", async () => {
  const p = filled();
  handler = async () => ({ ...record(), participants: [{ ...record().participants[0], participantName: "原报名人", phone: "13700000000" }] });
  await p.submit();
  assert.equal(p.data.success, true);
  assert.equal(p.data.recoveredRegistration.participants[0].participantName, "原报名人");
  assert.deepEqual(navigations, []);
});

test("server-masked identity does not turn a normal confirmed registration into a mismatch", async () => {
  const p = filled(); await p.submit();
  assert.equal(p.data.success, true);
  assert.equal(p.data.recoveredRegistration, null);
  assert.deepEqual(navigations, ["/pages/signup-success/index?id=activity&registrationId=registration"]);
});

test("failed recovery remains locked; confirmed absence preserves the draft and allows explicit retry", async () => {
  const p = filled(); handler = async () => { throw Error("offline"); };
  await p.submit(); await p.recoverRegistration();
  assert.equal(p.data.recoveryNeeded, true);
  assert.equal(p.data.success, false);
  assert.equal(calls.filter(c => c.method === "POST").length, 1);
  handler = async () => null; await p.recoverRegistration();
  assert.equal(p.data.recoveryNeeded, false);
  assert.deepEqual(p.data.participants, [first]);
  handler = async () => record(); await p.submit();
  assert.equal(calls.filter(c => c.method === "POST").length, 2);
  assert.equal(p.data.success, true);
});

test("a known registration rejection unlocks editing without claiming a pending write", async () => {
  const p = filled(); handler = async () => { throw new api.ApiError("名额不足", 409, "ACTIVITY_FULL"); };
  await p.submit(); assert.equal(p.data.recoveryNeeded, false); assert.equal(p.data.success, false);
  assert.match(p.data.fieldError, /名额不足/);
});

test("LEGAL_NOT_READY is a definite rejection and policy reload cannot invalidate active recovery", async () => {
  const p = filled(); handler = async () => { throw new api.ApiError("协议未发布", 503, "LEGAL_NOT_READY"); };
  await p.submit(); assert.equal(p.data.recoveryNeeded, false); assert.equal(p.data.legal, null);
  p.setData({ recoveryNeeded: true }); let finish;
  handler = () => new Promise(resolve => { finish = resolve; });
  const pending = p.recoverRegistration(); await flush(); const count = calls.length;
  p.retry(); await p.load(); assert.equal(calls.length, count);
  finish(record()); await pending;
  assert.equal(p.data.success, true); assert.equal(p.data.submitting, false);
});

test("returning after hiding during submission recovers the real registration instead of resubmitting", async () => {
  const p = filled(); let finish;
  handler = (_url, method) => method === "POST" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(record());
  const pending = p.submit(); await flush(); p.onHide(); finish(record()); await pending;
  assert.equal(p.data.success, false); assert.equal(p.data.recoveryNeeded, true);
  p.onShow(); await flush();
  assert.equal(p.data.recoveredRegistration.id, "registration");
  assert.equal(calls.filter(c => c.method === "POST").length, 1);
});

test("late recovery cannot refill a hidden page or a different account", async () => {
  for (const change of ["hide", "session"]) {
    const p = filled(); p.setData({ recoveryNeeded: true }); let finish;
    handler = () => new Promise(resolve => { finish = resolve; });
    const pending = p.recoverRegistration(); await flush();
    if (change === "hide") p.onHide(); else session++;
    finish(record()); await pending;
    assert.equal(p.data.success, false); assert.equal(p.data.recoveredRegistration, null);
    if (change === "session") assert.equal(p.data.participants[0].phone, "");
  }
});

test("registration shows saved contact on entry and preserves manual fields on return", async () => {
  const p = filled(); p.setData({ participants: [{ participantName: "", phone: "", idNumber: "" }] });
  p.onShow(); await flush();
  assert.equal(p.data.participants[0].participantName, "本人");
  assert.equal(p.data.participants[0].phone, "13900000000");
  p.onHide(); p.data.participants[0].participantName = "手填姓名"; p.onShow(); await flush();
  assert.equal(p.data.participants[0].participantName, "手填姓名");
  assert.equal(p.data.consent, true);
});

test("a first-time user can complete their contact before being asked to enter participants twice", async () => {
  const p = filled(); actor = { ...actor, profileCompleted: false };
  p.setData({ participants: [{ participantName: "", phone: "", idNumber: "" }], consent: false });
  await p.submit();
  assert.deepEqual(navigations, ["/pages/profile/index?from=register"]);
  assert.equal(calls.length, 0);
  assert.equal(p.data.fieldError, "");
});

test("saving an explicitly opened registration contact editor returns directly to registration", async () => {
  const p = page("profile"); p.onLoad({ from: "register" }); await p.load();
  p.setData({ draft: { realName: "张三", phone: "13800000000" }, consent: true });
  handler = async (_url, _method, data) => ({ ...actor, ...data, profileCompleted: true });
  await p.save(); assert.deepEqual(navigations, ["back"]); assert.equal(p.data.editing, false);
});

test("load-more after an initial activity failure retries page zero, then advances only after success", async () => {
  const p = page("activities"); handler = async () => { throw Error("offline"); };
  await p.load(true);
  handler = async url => ({ items: [{ ...activity, id: url.includes("page=1") ? "second" : "first" }],
    page: url.includes("page=1") ? 1 : 0, hasMore: true, total: 12 });
  p.onReachBottom(); await flush();
  assert.match(calls[1].url, /page=0&/); assert.equal(p.data.items[0].id, "first");
  p.onReachBottom(); await flush();
  assert.match(calls[2].url, /page=1&/); assert.deepEqual(p.data.items.map(x => x.id), ["first", "second"]);
});
