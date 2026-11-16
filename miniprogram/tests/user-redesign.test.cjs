const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("../dist/utils/api.js");
const legal = require("../dist/utils/legal.js");
const routes = ["activities", "detail", "register", "signup-success", "registrations", "shop", "product", "checkout", "orders", "addresses", "mine", "profile", "admin-users", "notifications", "login", "privacy"];
const source = path.resolve(__dirname, "../src");
let definition, navigations;
global.Page = d => { definition = d; };
function page(name) {
  const file = require.resolve("../dist/pages/" + name + "/index.js");
  delete require.cache[file];
  require(file);
  const p = { ...definition, data: structuredClone(definition.data), setData(v) { Object.assign(this.data, v); } };
  for (const key of Object.keys(p)) if (typeof p[key] === "function") p[key] = p[key].bind(p);
  return p;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
beforeEach(() => {
  navigations = [];
  global.wx = { navigateTo: o => navigations.push(o.url), navigateBack() {}, switchTab: o => navigations.push(o.url) };
  api.hasSession = () => true;
  api.sessionVersion = () => 1;
  api.isSessionCurrent = n => n === 1;
  api.getCurrentUser = async () => ({ id: "current-user", nickname: "当前用户", role: "USER" });
  api.request = async () => { throw new Error("网络暂不可用"); };
  legal.currentLegal = async () => ({ ready: true, privacy: { version: 1 }, terms: { version: 1 } });
});

test("public administrator entry stays closed unless the strict capability succeeds and never grants a role", async () => {
  for (const name of ["mine", "login"]) {
    const p = page(name);
    const enter = name === "mine" ? p.adminSignIn : p.admin;
    enter();
    assert.deepEqual(navigations, []);
    api.request = async () => ({ adminLoginEnabled: false });
    await p.loadAdminCapability();
    enter();
    assert.equal(p.data.adminLoginEnabled, false);
    assert.deepEqual(navigations, []);
    api.request = async () => ({ adminLoginEnabled: "true" });
    await p.loadAdminCapability();
    assert.equal(p.data.adminLoginEnabled, false);
    assert.ok(p.data.adminCapabilityError);
    api.request = async () => ({ adminLoginEnabled: true });
    await p.loadAdminCapability();
    assert.equal(p.data.adminLoginEnabled, true);
    enter();
    assert.equal(navigations.pop(), "/pages/admin-login/index");
    assert.equal(p.data.user?.role, undefined);
  }
});

test("capability requests are deduplicated and late results cannot reenable hidden pages", async () => {
  for (const name of ["mine", "login"]) {
    let resolve, calls = 0;
    const p = page(name);
    api.request = () => { calls++; return new Promise(r => { resolve = r; }); };
    const pending = p.loadAdminCapability();
    await p.loadAdminCapability();
    assert.equal(calls, 1);
    p.onHide();
    resolve({ adminLoginEnabled: true });
    await pending;
    assert.equal(p.data.adminLoginEnabled, false);
    assert.equal(p.data.adminCapabilityLoading, false);
    api.request = async () => ({ adminLoginEnabled: true });
    await p.loadAdminCapability();
    assert.equal(p.data.adminLoginEnabled, true);
    p.onUnload();
  }
});

test("capability failure preserves ordinary login consent and independent My profile", async () => {
  const login = page("login");
  login.setData({ current: { ready: true }, privacyRead: true, termsRead: true, agreed: true });
  await login.loadAdminCapability();
  assert.equal(login.data.agreed, true);
  assert.equal(login.data.privacyRead, true);
  assert.equal(login.data.termsRead, true);
  const mine = page("mine");
  mine.setData({ user: { id: "u", role: "USER" }, requiresConsent: false });
  await mine.loadAdminCapability();
  assert.equal(mine.data.user.id, "u");
  assert.equal(mine.data.user.role, "USER");
});

test("initial My legal status cannot block a confirmed profile or reset it on independent failure", async () => {
  const p = page("mine");
  let reject;
  api.request = url => {
    assert.equal(url, "/me/consents");
    return new Promise((_, r) => { reject = r; });
  };
  const pending = p.load();
  await flush();
  assert.equal(p.data.user.id, "current-user");
  assert.equal(p.data.loading, false);
  assert.equal(p.data.legalStatusLoading, true);
  reject(new Error("协议暂不可用"));
  await pending;
  assert.equal(p.data.user.id, "current-user");
  assert.equal(p.data.legalStatusRetryable, true);
});

test("refund amount is formatted from the server record and cleared with private dialog state", async () => {
  const p = page("orders");
  p.setData({ loading: false });
  api.request = async url => {
    assert.equal(url, "/orders/order-1/refund");
    return { id: "refund-1", orderId: "order-1", status: "SUCCESS", amountCents: 19905, reason: "原因", decisionNote: "说明", lastError: "" };
  };
  await p.openRefund({ currentTarget: { dataset: { id: "order-1" } } });
  assert.equal(p.data.refundAmountText, "¥199.05");
  assert.equal(p.data.refundRecord.status, "SUCCESS");
  p.closeRefund();
  assert.equal(p.data.refundAmountText, "");
  assert.equal(p.data.refundRecord, null);
  await p.openRefund({ currentTarget: { dataset: { id: "order-1" } } });
  p.onHide();
  assert.equal(p.data.refundAmountText, "");
});

test("redesigned native templates keep real event handlers and use supported call-free expressions", () => {
  for (const name of routes) {
    const base = path.join(source, "pages", name, "index");
    const markup = fs.readFileSync(base + ".wxml", "utf8");
    const instance = page(name);
    for (const match of markup.matchAll(/\b(?:bind|catch):?[a-z-]+="([^"]+)"/g))
      assert.equal(typeof instance[match[1]], "function", name + ": missing " + match[1]);
    for (const expression of markup.match(/{{[\s\S]*?}}/g) || []) assert.doesNotMatch(expression, /\.[a-z_$][\w$]*\s*\(/i, name + ": unsupported native expression");
    assert.doesNotMatch(markup, /=>/, name + ": generated code must not leak into markup");
    assert.doesNotMatch(markup, /\srole="/, name + ": use native aria-role");
    assert.match(fs.readFileSync(base + ".wxss", "utf8"), /@import "\.\.\/\.\.\/styles\/user-flow\.wxss"/, name);
    const stack = [];
    for (const match of markup.matchAll(/<\/?([a-z][\w-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*>/g)) {
      const tag = match[0];
      if (tag.startsWith("</")) assert.equal(stack.pop(), match[1], name + ": mismatched " + tag);
      else if (!tag.endsWith("/>")) stack.push(match[1]);
    }
    assert.deepEqual(stack, [], name + ": unclosed native nodes");
  }
});
