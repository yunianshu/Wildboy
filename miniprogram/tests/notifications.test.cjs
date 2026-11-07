const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
const notifications = require("../dist/utils/notifications.js");
let definition, session, calls, rows, navigations;
global.Page = d => { definition = d; };
function page() {
  const file = require.resolve("../dist/pages/notifications/index.js");
  delete require.cache[file];
  require(file);
  const p = { ...definition, data: structuredClone(definition.data), setData(v) { Object.assign(this.data, v); } };
  for (const k of Object.keys(p)) if (typeof p[k] === "function") p[k] = p[k].bind(p);
  return p;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  session = 1;
  calls = [];
  navigations = [];
  rows = [{ id: "notice-1", activityId: "activity-1", kind: "ACTIVITY_CHANGED", title: "集合地点已更新", detail: "请查看最新活动安排", status: "SENT", attempts: 1, lastError: "", createdAt: "2026-10-31T10:00:00Z" }];
  api.hasSession = () => true;
  api.sessionVersion = () => session;
  api.isSessionCurrent = value => value === session;
  api.request = async (path, method = "GET", body) => {
    calls.push({ path, method, body });
    return { items: rows, page: 0, hasMore: false };
  };
  global.wx = { navigateTo: o => navigations.push(o.url), showToast() {} };
});

test("ordinary activity messages retain server text, status and the original activity destination", async () => {
  const p = page();
  p.onShow();
  await flush();
  assert.equal(calls[0].path, "/me/notifications?page=0&size=20");
  assert.equal(p.data.items[0].title, rows[0].title);
  assert.equal(p.data.items[0].detail, rows[0].detail);
  assert.equal(p.data.items[0].kind, "ACTIVITY_CHANGED");
  assert.equal(p.data.items[0].statusText, "已发送");
  p.open({ currentTarget: { dataset: { id: rows[0].activityId } } });
  assert.deepEqual(navigations, ["/pages/detail/index?id=activity-1"]);
});

test("late activity messages cannot refill a hidden page or a changed account", async () => {
  for (const leave of [p => p.onHide(), () => { session++; }]) {
    let resolve;
    api.request = () => new Promise(r => { resolve = r; });
    const p = page();
    const loading = p.load();
    leave(p);
    resolve({ items: rows, page: 0, hasMore: false });
    await loading;
    assert.deepEqual(p.data.items, []);
  }
});

test("subscription needs native acceptance and records no permission on denial or native failure", async () => {
  api.request = async (path, method = "GET", body) => {
    calls.push({ path, method, body });
    return { ready: true, templateId: "tpl1" };
  };
  wx.requestSubscribeMessage = o => o.success({ tpl1: "reject" });
  await assert.rejects(notifications.subscribeNotifications(), /未开启/);
  wx.requestSubscribeMessage = o => o.fail(new Error("native subscription failed"));
  await assert.rejects(notifications.subscribeNotifications(), /native subscription failed/);
  assert.equal(calls.filter(c => c.method === "POST").length, 0);
  wx.requestSubscribeMessage = o => o.success({ tpl1: "accept" });
  await notifications.subscribeNotifications();
  assert.deepEqual(calls.find(c => c.method === "POST"), { path: "/me/notifications/subscribe", method: "POST", body: { accepted: true } });
});

test("unconfigured notifications do not invoke the native subscription prompt", async () => {
  api.request = async () => ({ ready: false, templateId: "" });
  wx.requestSubscribeMessage = () => { throw Error("must not call"); };
  await assert.rejects(notifications.subscribeNotifications(), /尚未配置/);
});

test("account changes during the native prompt cannot subscribe the replacement account", async () => {
  api.request = async (path, method = "GET") => {
    calls.push({ path, method });
    return { ready: true, templateId: "tpl1" };
  };
  wx.requestSubscribeMessage = o => { session++; o.success({ tpl1: "accept" }); };
  await notifications.subscribeNotifications();
  assert.equal(calls.filter(c => c.method === "POST").length, 0);
});

test("subscription during list loading does not invalidate the pending response", async () => {
  let resolve;
  api.request = path => {
    calls.push(path);
    return new Promise(r => { resolve = r; });
  };
  const p = page();
  const loading = p.load();
  await p.subscribe();
  resolve({ items: rows, page: 0, hasMore: false });
  await loading;
  assert.equal(p.data.loading, false);
  assert.equal(p.data.items.length, 1);
  assert.deepEqual(calls, ["/me/notifications?page=0&size=20"]);
});
