const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const api = require("../dist/utils/api.js");
const legal = require("../dist/utils/legal.js");
const routes = ["activities", "detail", "register", "signup-success", "registrations", "shop", "product", "checkout", "orders", "addresses", "mine", "profile", "notifications", "login", "privacy"];
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
