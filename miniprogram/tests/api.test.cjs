const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { config } = require("../dist/config.js");
let store = {},
  requestCount = 0,
  loginCount = 0,
  env = "develop",
  reply;
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => (store[k] = v),
  removeStorageSync: (k) => delete store[k],
  getAccountInfoSync: () => ({ miniProgram: { envVersion: env } }),
  login: (o) => {
    loginCount++;
    o.success({ code: "one-use-code" });
  },
  request: (o) => {
    requestCount++;
    reply(o);
  },
};
const api = require("../dist/utils/api.js");
beforeEach(() => {
  store = {};
  requestCount = 0;
  loginCount = 0;
  env = "develop";
  config.apiOrigin = "https://wildboy.test";
  config.devLogin = false;
  reply = (o) =>
    o.success({
      statusCode: 200,
      data: { token: "session", user: { id: "user", role: "USER" } },
    });
});
test("unconfigured API does not quietly return fake data", async () => {
  config.apiOrigin = "https://api.example.invalid";
  await assert.rejects(api.request("/home"), /尚未配置/);
  assert.equal(requestCount, 0);
});
test("real login exchanges only one use wx code and persists server token", async () => {
  let sent;
  reply = (o) => {
    sent = o.data;
    o.success({
      statusCode: 200,
      data: { token: "session", user: { id: "u" } },
    });
  };
  await api.login();
  assert.deepEqual(sent, { code: "one-use-code" });
  assert.equal(loginCount, 1);
  assert.equal(api.hasSession(), true);
});
test("simultaneous login uses one exchange", async () => {
  await Promise.all([api.login(), api.login()]);
  assert.equal(loginCount, 1);
  assert.equal(requestCount, 1);
});
test("release never uses developer login endpoint", async () => {
  config.devLogin = true;
  env = "release";
  let url;
  reply = (o) => {
    url = o.url;
    o.success({ statusCode: 200, data: { token: "s", user: {} } });
  };
  await api.login();
  assert.match(url, /\/auth\/wechat$/);
  assert.equal(loginCount, 1);
});
test("release rejects HTTP even when dev flag accidentally enabled", async () => {
  config.devLogin = true;
  env = "release";
  config.apiOrigin = "http://localhost:8080";
  await assert.rejects(api.request("/home"), /HTTPS/);
  assert.equal(requestCount, 0);
});
test("developer HTTP opt-in works only in developer build", async () => {
  config.devLogin = true;
  config.apiOrigin = "http://localhost:8080";
  await api.request("/home");
  assert.equal(requestCount, 1);
});
test("401 clears session and surfaces server reason", async () => {
  store["wildboy-session"] = "expired";
  reply = (o) =>
    o.success({
      statusCode: 401,
      data: { message: "请重新登录", code: "UNAUTHORIZED" },
    });
  await assert.rejects(
    api.request("/me"),
    (e) => e.status === 401 && e.message === "请重新登录",
  );
  assert.equal(api.hasSession(), false);
});
test("network failures surface retry message without silently registering", async () => {
  reply = (o) => o.fail({});
  await assert.rejects(
    api.request("/activities/a/registrations", "POST", {}),
    /网络连接失败/,
  );
});
test("public image URLs allow bundled assets and safe HTTPS only", () => {
  assert.equal(api.mediaUrl("/assets/equipment.jpg"), "/assets/equipment.jpg");
  assert.equal(
    api.mediaUrl("/assets/user-cover.jpg"),
    "https://wildboy.test/assets/user-cover.jpg",
  );
  assert.equal(api.mediaUrl("javascript:alert(1)"), "");
  assert.equal(api.mediaUrl("http://insecure/photo.jpg"), "");
});
test("non-JSON error responses reject instead of leaving request pending", async () => {
  for (const data of [null, undefined, "<html>gateway error</html>"]) {
    reply = (o) => o.success({ statusCode: 502, data });
    await assert.rejects(
      api.request("/home"),
      (e) => e.status === 502 && e.message === "请求未完成，请重试",
    );
  }
});
test("late 401 from old session cannot clear newer session", async () => {
  store["wildboy-session"] = "old";
  reply = (o) => {
    store["wildboy-session"] = "new";
    o.success({ statusCode: 401, data: {} });
  };
  await assert.rejects(api.request("/me"));
  assert.equal(store["wildboy-session"], "new");
});
