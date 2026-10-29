const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const api = require("../dist/utils/api.js"),
  legal = require("../dist/utils/legal.js");
let definition, session, calls, rows;
global.Page = (d) => (definition = d);
function page(name) {
  const file = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[file];
  require(file);
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  for (const k of Object.keys(p))
    if (typeof p[k] === "function") p[k] = p[k].bind(p);
  return p;
}
const flush = () => new Promise((r) => setImmediate(r));
beforeEach(() => {
  session = 1;
  calls = [];
  rows = [
    {
      id: "w1",
      activityId: "a1",
      activityTitle: "路线",
      status: "OFFERED",
      partySize: 2,
      offerExpiresAt: "2026-12-31T10:00:00Z",
    },
  ];
  api.hasSession = () => true;
  api.sessionVersion = () => session;
  api.isSessionCurrent = (s) => s === session;
  api.request = async (path, method = "GET", body) => {
    calls.push({ path, method, body });
    return { items: rows, page: 0, hasMore: false };
  };
  global.wx = {
    navigateTo: () => {},
    showToast: () => {},
    showModal: (o) => o.success({ confirm: true }),
  };
  legal.currentLegal = async () => ({
    ready: true,
    privacy: { version: 1 },
    terms: { version: 1 },
  });
});
test("waitlist reads own paginated endpoint, displays whole party and expires deadline", async () => {
  const p = page("waitlist");
  p.onShow();
  await flush();
  assert.equal(calls[0].path, "/me/waitlist?page=0&size=20");
  assert.equal(p.data.items[0].partySize, 2);
  assert.equal(p.data.items[0].statusText, "待确认名额");
});
test("confirmation requires explicit current-document consent; cancellation never confirms", async () => {
  const p = page("waitlist");
  await p.choose({ currentTarget: { dataset: { id: "w1" } } });
  assert.equal(p.data.consent, false);
  await p.confirm();
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  p.close();
  assert.equal(p.data.confirmId, "");
});
test("session switch discards old offer confirmation and legal state", async () => {
  const p = page("waitlist");
  p.onShow();
  await flush();
  p.setData({
    confirmId: "w1",
    legal: { privacy: { version: 1 }, terms: { version: 1 } },
    consent: true,
  });
  session++;
  p.onShow();
  assert.equal(p.data.confirmId, "");
  assert.equal(p.data.consent, false);
  assert.equal(p.data.legal, null);
});
test("late waitlist response after page hide cannot populate list", async () => {
  let release;
  api.request = () => new Promise((r) => (release = r));
  const p = page("waitlist");
  p.onShow();
  p.onHide();
  release({ items: rows, page: 0, hasMore: false });
  await flush();
  assert.deepEqual(p.data.items, []);
});
test("notification subscription rejects denied/native failure and never records implicit consent", async () => {
  const notifications = require("../dist/utils/notifications.js");
  api.request = async (path, method = "GET", body) => {
    calls.push({ path, method, body });
    return { ready: true, templateId: "tpl1" };
  };
  global.wx.requestSubscribeMessage = (o) => o.success({ tpl1: "reject" });
  await assert.rejects(notifications.subscribeNotifications(), /未开启/);
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
  global.wx.requestSubscribeMessage = (o) => o.success({ tpl1: "accept" });
  await notifications.subscribeNotifications();
  assert.deepEqual(calls.find((c) => c.method === "POST").body, {
    accepted: true,
  });
});
test("unconfigured notifications stay explicit and do not call WeChat", async () => {
  const notifications = require("../dist/utils/notifications.js");
  api.request = async () => ({ ready: false, templateId: "" });
  global.wx.requestSubscribeMessage = () => {
    throw Error("must not call");
  };
  await assert.rejects(notifications.subscribeNotifications(), /尚未配置/);
});
test("waitlist join preserves modal input flow and uses separate explicit action", () => {
  const p = page("register");
  p.data.activity = {
    canCancel: true,
    enabled: false,
    capacity: 10,
    available: 0,
  };
  p.joinWaitlist();
  assert.equal(p.data.waitlistMode, true);
  p.addParticipant();
  assert.equal(p.data.participantModalOpen, true);
  assert.equal(p.data.participants.length, 1);
  const src = fs.readFileSync("src/pages/register/index.wxml", "utf8");
  assert.match(src, /整组加入候补/);
});
