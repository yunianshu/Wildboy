const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const api = require("../dist/utils/api.js");
const legalTools = require("../dist/utils/legal.js");
const legal = {
  ready: true,
  privacy: {
    kind: "PRIVACY",
    version: 1,
    title: "隐私政策",
    content: "当前隐私内容",
    publishedAt: "2026-10-26T00:00:00Z",
  },
  terms: {
    kind: "TERMS",
    version: 2,
    title: "用户协议",
    content: "当前条款内容",
    publishedAt: "2026-10-26T00:00:00Z",
  },
};
let definition, calls, navigations, response, logins, logged, back, events;
global.Page = (d) => (definition = d);
global.wx = {
  navigateTo: (o) => {
    navigations.push(o.url);
    events = o.events;
  },
  switchTab: (o) => navigations.push(o.url),
  navigateBack: () => {
    back++;
  },
};
function page(name) {
  const path = require.resolve("../dist/pages/" + name + "/index.js");
  delete require.cache[path];
  require(path);
  const p = {
    ...definition,
    data: structuredClone(definition.data),
    setData(v) {
      Object.assign(this.data, v);
    },
  };
  for (const k in p) if (typeof p[k] === "function") p[k] = p[k].bind(p);
  return p;
}
beforeEach(() => {
  calls = [];
  navigations = [];
  logins = [];
  logged = true;
  back = 0;
  events = null;
  response = async () => structuredClone(legal);
  api.request = async (path, method, data) => {
    calls.push({ path, method, data });
    return response(path, method, data);
  };
  api.hasSession = () => logged;
  api.sessionVersion = () => 1;
  api.isSessionCurrent = () => true;
  api.login = async (v, current) => {
    if (!current()) throw new Error("取消");
    logins.push(v);
  };
});
function agree(p) {
  p.setData({
    current: structuredClone(legal),
    loading: false,
    privacyRead: true,
    termsRead: true,
    agreed: true,
  });
}
test("invalid or unpublished legal documents fail closed", () => {
  for (const x of [
    null,
    {},
    { ...legal, ready: false },
    { ...legal, terms: null },
    { ...legal, privacy: { ...legal.privacy, content: "" } },
  ])
    assert.throws(() => legalTools.versionsOf(x), /尚未发布/);
});
test("login loads both current documents with consent unchecked", async () => {
  const p = page("login");
  await p.load();
  assert.equal(p.data.current.privacy.version, 1);
  assert.equal(p.data.agreed, false);
  assert.equal(p.data.privacyRead, false);
  await p.submit();
  assert.equal(logins.length, 0);
});
test("merely opening or failing to load a document cannot mark it read", async () => {
  const p = page("login");
  await p.load();
  p.readPrivacy();
  assert.equal(p.data.privacyRead, false);
  events.legalDocumentLoaded({ kind: "PRIVACY", version: 99 });
  assert.equal(p.data.privacyRead, false);
  events.legalDocumentLoaded({ kind: "PRIVACY", version: 1 });
  assert.equal(p.data.privacyRead, true);
  p.agreement({ detail: { value: ["yes"] } });
  assert.equal(p.data.agreed, false);
});
test("fresh verified versions are sent to explicit login once", async () => {
  const p = page("login");
  agree(p);
  await p.submit();
  assert.deepEqual(logins, [{ privacyVersion: 1, termsVersion: 2 }]);
  assert.equal(back, 1);
  await p.submit();
  assert.equal(logins.length, 1);
});
test("version changes reset viewed flags and consent without authenticating", async () => {
  const p = page("login");
  agree(p);
  response = async () => ({
    ...legal,
    privacy: { ...legal.privacy, version: 2 },
  });
  await p.submit();
  assert.equal(p.data.agreed, false);
  assert.equal(p.data.privacyRead, false);
  assert.equal(logins.length, 0);
  assert.match(p.data.error, /已更新/);
});
test("network failure does not record consent or login", async () => {
  const p = page("login");
  agree(p);
  response = async () => {
    throw new Error("离线");
  };
  await p.submit();
  assert.equal(logins.length, 0);
  assert.equal(p.data.success, false);
  assert.match(p.data.error, /离线/);
});
test("existing user reconfirmation calls consents without creating another identity", async () => {
  const p = page("login");
  agree(p);
  p.setData({ mode: "consent" });
  await p.submit();
  assert.equal(logins.length, 0);
  assert.deepEqual(calls.find((c) => c.path === "/me/consents").data, {
    privacyVersion: 1,
    termsVersion: 2,
  });
  assert.equal(back, 1);
});
test("leaving during version fetch prevents late login", async () => {
  const p = page("login");
  agree(p);
  let finish;
  response = () => new Promise((r) => (finish = r));
  const pending = p.submit();
  p.onHide();
  finish(legal);
  await pending;
  assert.equal(logins.length, 0);
  assert.equal(p.data.success, false);
});
test("public document viewer displays only the requested published version and never accepts it", async () => {
  const p = page("privacy");
  let emitted;
  p.getOpenerEventChannel = () => ({
    emit: (name, data) => {
      emitted = { name, data };
    },
  });
  p.setData({ kind: "TERMS", version: 2 });
  response = async () => legal.terms;
  await p.load();
  assert.equal(p.data.document.content, legal.terms.content);
  assert.deepEqual(emitted, {
    name: "legalDocumentLoaded",
    data: { kind: "TERMS", version: 2 },
  });
  assert.equal(calls.filter((c) => c.method === "POST").length, 0);
});
test("public viewer missing document never emits read acknowledgement", async () => {
  const p = page("privacy");
  let emitted = false;
  p.getOpenerEventChannel = () => ({
    emit: () => {
      emitted = true;
    },
  });
  p.setData({ kind: "TERMS", version: 2 });
  response = async () => null;
  await p.load();
  assert.equal(p.data.document, null);
  assert.equal(emitted, false);
  assert.match(p.data.error, /未发布/);
});
test("browse path never authenticates or records acceptance", () => {
  const p = page("login");
  p.browse();
  assert.deepEqual(navigations, ["/pages/home/index"]);
  assert.equal(calls.length, 0);
  assert.equal(logins.length, 0);
});
test("expired reconfirmation session never silently switches to another WeChat login", async () => {
  const p = page("login");
  agree(p);
  p.setData({ mode: "consent" });
  logged = false;
  await p.submit();
  assert.equal(logins.length, 0);
  assert.equal(calls.filter((c) => c.path === "/me/consents").length, 0);
  assert.match(p.data.error, /登录已失效/);
});

test("inline policy links open exact versions without changing consent, including after return", async () => {
  for (const name of ["login", "register", "checkout"]) {
    const p = page(name);
    const loginPage = name === "login";
    const consentKey = loginPage ? "agreed" : "consent";
    p.setData({ [loginPage ? "current" : "legal"]: structuredClone(legal), loading: false });
    const privacy = loginPage ? "readPrivacy" : "privacy";
    const terms = loginPage ? "readTerms" : "terms";
    const change = loginPage ? "agreement" : "consentChange";
    p[change]({ detail: { value: ["yes"] } });
    assert.equal(p.data[consentKey], false, name + " blocks unread consent");
    p[privacy]();
    assert.equal(navigations.at(-1), "/pages/privacy/index?kind=PRIVACY&version=1");
    p.onHide();
    events.legalDocumentLoaded({ kind: "PRIVACY", version: 1 });
    assert.equal(p.data[consentKey], false, name + " never accepts on read");
    p[terms]();
    assert.equal(navigations.at(-1), "/pages/privacy/index?kind=TERMS&version=2");
    p.onHide();
    events.legalDocumentLoaded({ kind: "TERMS", version: 2 });
    p[change]({ detail: { value: ["yes"] } });
    assert.equal(p.data[consentKey], true, name + " accepts only explicit checkbox");
    p[privacy]();
    p[terms]();
    assert.equal(p.data[consentKey], true, name + " preserves explicit choice");
    p[change]({ detail: { value: [] } });
    assert.equal(p.data[consentKey], false);
    assert.equal(calls.length, 0);
    assert.equal(logins.length, 0);
  }
});

test("stale inline document callbacks cannot mark a replacement policy version read", () => {
  for (const name of ["login", "register", "checkout"]) {
    const p = page(name);
    const legalKey = name === "login" ? "current" : "legal";
    p.setData({ [legalKey]: structuredClone(legal), loading: false });
    p[name === "login" ? "readPrivacy" : "privacy"]();
    const oldCallback = events.legalDocumentLoaded;
    p.setData({ [legalKey]: { ...legal, privacy: { ...legal.privacy, version: 3 } } });
    oldCallback({ kind: "PRIVACY", version: 1 });
    assert.equal(p.data.privacyRead, false, name);
  }
});
