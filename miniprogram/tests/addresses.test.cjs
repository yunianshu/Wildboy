const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const api = require("../dist/utils/api.js");
let definition, session, calls, list, nav, events;
global.Page = (value) => (definition = value);
const address = {
  id: "a1",
  recipientName: "收货人",
  phone: "13800000000",
  address: "厦门市测试街道12号",
  isDefault: true,
};
const event = (id) => ({ currentTarget: { dataset: { id } } });
const input = (field, value) => ({
  currentTarget: { dataset: { field } },
  detail: { value },
});
const flush = () => new Promise((resolve) => setImmediate(resolve));
function page(name) {
  const file = require.resolve(`../dist/pages/${name}/index.js`);
  delete require.cache[file];
  require(file);
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(values) {
      Object.assign(this.data, values);
    },
    getOpenerEventChannel() {
      return { emit: (name, value) => events.push({ name, value }) };
    },
  };
  for (const key of Object.keys(p))
    if (typeof p[key] === "function") p[key] = p[key].bind(p);
  return p;
}
beforeEach(() => {
  session = 1;
  calls = [];
  nav = [];
  events = [];
  list = [{ ...address }];
  global.wx = {
    navigateTo: (o) => nav.push(o),
    navigateBack: () => nav.push("back"),
    showModal: async () => ({ confirm: true }),
  };
  api.hasSession = () => true;
  api.sessionVersion = () => session;
  api.isSessionCurrent = (v) => v === session;
  api.request = async (path, method = "GET", data) => {
    calls.push({ path, method, data });
    return method === "GET" ? { items: list } : data;
  };
});
test("saved addresses load per session, edit is isolated, cancel sends no mutation", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  assert.deepEqual(p.data.items, list);
  p.edit(event("a1"));
  p.input(input("address", "修改的地址地址"));
  assert.equal(p.data.items[0].address, address.address);
  p.cancel();
  assert.equal(p.data.editing, false);
  assert.equal(p.data.draft.address, "");
  assert.equal(calls.filter((x) => x.method !== "GET").length, 0);
});
test("invalid address blocked, valid save uses owned API and double tap cannot duplicate", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  p.add();
  await p.save();
  assert.match(p.data.error, /姓名/);
  p.input(input("recipientName", "  新收货人 "));
  p.input(input("phone", "13900000000"));
  p.input(input("address", "厦门市新街道地址"));
  let release;
  api.request = async (path, method, data) => {
    calls.push({ path, method, data });
    if (method === "POST") return new Promise((r) => (release = r));
    return { items: list };
  };
  const pending = p.save();
  await p.save();
  assert.equal(calls.filter((x) => x.method === "POST").length, 1);
  release(address);
  await pending;
  assert.equal(
    calls.find((x) => x.method === "POST").data.recipientName,
    "新收货人",
  );
  assert.equal(p.data.editing, false);
  assert.equal(p.data.busy, false);
});
test("save on edit uses PUT and returns to list without selecting implicitly", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  p.edit(event("a1"));
  await p.save();
  assert.equal(calls.find((x) => x.method === "PUT").path, "/me/addresses/a1");
  assert.equal(events.length, 0);
});
test("selection emits only an existing address ID, not another user or shipping data", async () => {
  const p = page("addresses");
  p.onLoad({ select: "1" });
  p.onShow();
  await flush();
  p.select(event("unknown"));
  assert.equal(events.length, 0);
  p.select(event("a1"));
  assert.deepEqual(events, [{ name: "addressSelected", value: { id: "a1" } }]);
  assert.equal(nav.at(-1), "back");
  session++;
  p.select(event("a1"));
  assert.equal(events.length, 1);
});
test("cancelled deletion and confirmation after account change send no delete", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  wx.showModal = async () => ({ confirm: false });
  await p.remove(event("a1"));
  let release;
  wx.showModal = () => new Promise((r) => (release = r));
  const pending = p.remove(event("a1"));
  session++;
  release({ confirm: true });
  await pending;
  assert.equal(calls.filter((x) => x.method === "DELETE").length, 0);
});
test("hide clears draft and private entries, late fetch cannot repopulate", async () => {
  const p = page("addresses");
  let release;
  api.request = () => new Promise((r) => (release = r));
  p.onShow();
  p.add();
  p.input(input("recipientName", "私人名字"));
  p.onHide();
  release({ items: list });
  await flush();
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.draft.recipientName, "");
});
test("account switch ignores previous user address response", async () => {
  const p = page("addresses");
  let release;
  api.request = () => new Promise((r) => (release = r));
  p.onShow();
  session++;
  release({ items: list });
  await flush();
  assert.deepEqual(p.data.items, []);
});
test("checkout refresh selects default and preserves legal read and consent flags", async () => {
  const p = page("checkout");
  Object.assign(p.data, {
    session,
    loading: false,
    consent: true,
    privacyRead: true,
    termsRead: true,
  });
  p.onShow();
  await flush();
  assert.equal(p.data.selectedAddressId, "a1");
  assert.equal(p.data.address, address.address);
  assert.equal(p.data.consent, true);
  assert.equal(p.data.privacyRead, true);
  assert.equal(p.data.termsRead, true);
  p.chooseAddress();
  nav[0].events.addressSelected({ id: "a2" });
  list = [
    address,
    { ...address, id: "a2", isDefault: false, address: "第二个地址街道" },
  ];
  p.onShow();
  await flush();
  assert.equal(p.data.selectedAddressId, "a2");
  assert.equal(p.data.address, "第二个地址街道");
});
test("deleted address clears checkout, existing order snapshot never refreshes", async () => {
  const p = page("checkout");
  Object.assign(p.data, {
    session,
    loading: false,
    selectedAddressId: "a1",
    address: address.address,
  });
  list = [];
  await p.refreshAddress();
  assert.equal(p.data.selectedAddressId, "");
  assert.equal(p.data.address, "");
  p.data.order = { id: "o1", address: "原订单地址" };
  p.onShow();
  await flush();
  assert.equal(p.data.order.address, "原订单地址");
  assert.equal(calls.length, 1);
});
test("checkout hides late address response and blocks submission while unselected/loading", async () => {
  const p = page("checkout");
  let release;
  api.request = () => new Promise((r) => (release = r));
  const pending = p.refreshAddress();
  p.onHide();
  release({ items: list });
  await pending;
  assert.equal(p.data.selectedAddressId, "");
  assert.match(p.validate(), /正在加载|选择/);
});
test("product and checkout no longer expose shipping fields; dedicated page registered and reachable", () => {
  const checkout = fs.readFileSync("src/pages/checkout/index.wxml", "utf8");
  assert.doesNotMatch(checkout, /<input|<textarea/);
  assert.match(checkout, /bindtap="chooseAddress"/);
  assert.ok(
    JSON.parse(fs.readFileSync("src/app.json")).pages.includes(
      "pages/addresses/index",
    ),
  );
  assert.match(
    fs.readFileSync("src/pages/mine/index.wxml", "utf8"),
    /bindtap="addresses"/,
  );
  assert.match(
    fs.readFileSync("src/pages/addresses/index.wxml", "utf8"),
    /保存地址/,
  );
});

test("failed delete confirmation leaves address untouched and reports error", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  wx.showModal = async () => {
    throw new Error("弹窗未打开");
  };
  await p.remove(event("a1"));
  assert.equal(calls.filter((x) => x.method === "DELETE").length, 0);
  assert.match(p.data.error, /弹窗未打开/);
});
test("current default cannot appear to turn off while another address can become default", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  p.edit(event("a1"));
  assert.equal(p.data.currentDefault, true);
  p.defaultChange({ detail: { value: false } });
  assert.equal(p.data.draft.isDefault, true);
  p.cancel();
  p.add();
  p.defaultChange({ detail: { value: true } });
  assert.equal(p.data.draft.isDefault, true);
  const markup = fs.readFileSync("src/pages/addresses/index.wxml", "utf8");
  assert.match(markup, /disabled="{{busy \|\| currentDefault}}"/);
  assert.match(markup, /当前默认地址/);
});
test("401 while loading resets to login and discards private addresses", async () => {
  const p = page("addresses");
  api.request = async () => {
    session++;
    api.hasSession = () => false;
    throw new api.ApiError("请重新登录", 401, "UNAUTHORIZED");
  };
  p.onShow();
  await flush();
  assert.equal(p.data.loggedIn, false);
  assert.deepEqual(p.data.items, []);
  assert.match(p.data.error, /重新登录/);
});
test("401 while saving clears editor and exposes login without requiring page reentry", async () => {
  const p = page("addresses");
  p.onShow();
  await flush();
  p.edit(event("a1"));
  api.request = async () => {
    session++;
    api.hasSession = () => false;
    throw new api.ApiError("请重新登录", 401, "UNAUTHORIZED");
  };
  await p.save();
  assert.equal(p.data.loggedIn, false);
  assert.equal(p.data.editing, false);
  assert.equal(p.data.draft.address, "");
  assert.deepEqual(p.data.items, []);
  assert.equal(p.data.busy, false);
});
test("checkout 401 clears stale address and address action opens login", async () => {
  const p = page("checkout");
  Object.assign(p.data, {
    session,
    selectedAddressId: "a1",
    address: address.address,
  });
  api.request = async () => {
    session++;
    api.hasSession = () => false;
    throw new api.ApiError("请重新登录", 401, "UNAUTHORIZED");
  };
  await p.refreshAddress();
  assert.equal(p.data.selectedAddressId, "");
  assert.equal(p.data.address, "");
  p.chooseAddress();
  assert.equal(nav[0].url, "/pages/login/index");
});
