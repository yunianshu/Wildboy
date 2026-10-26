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
const versions = { privacyVersion: 1, termsVersion: 1 };
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
  await api.login(versions);
  assert.deepEqual(sent, { code: "one-use-code", ...versions });
  assert.equal(loginCount, 1);
  assert.equal(api.hasSession(), true);
});
test("simultaneous login uses one exchange", async () => {
  await Promise.all([api.login(versions), api.login(versions)]);
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
  await api.login(versions);
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
test("admin login only persists a server-confirmed ADMIN and never a password", async () => {
  let sent;
  reply = (o) => {
    sent = o;
    o.success({
      statusCode: 200,
      data: { token: "admin-token", user: { id: "admin", role: "ADMIN" } },
    });
  };
  await api.adminLogin(" operator ", "local-password");
  assert.deepEqual(sent.data, {
    username: "operator",
    password: "local-password",
  });
  assert.equal(store["wildboy-session"], "admin-token");
  assert.deepEqual(Object.keys(store), ["wildboy-session"]);
});
test("failed admin login preserves existing user session", async () => {
  store["wildboy-session"] = "user-token";
  reply = (o) => {
    assert.equal(o.header.Authorization, undefined);
    o.success({ statusCode: 401, data: { message: "账号或密码错误" } });
  };
  await assert.rejects(api.adminLogin("operator", "wrong"));
  assert.equal(store["wildboy-session"], "user-token");
});
test("USER response cannot be promoted to administrator", async () => {
  store["wildboy-session"] = "old";
  await assert.rejects(
    api.adminLogin("operator", "wrong"),
    (e) => e.status === 403,
  );
  assert.equal(store["wildboy-session"], "old");
});
test("leaving administrator login screen prevents late session replacement", async () => {
  store["wildboy-session"] = "old";
  reply = (o) =>
    o.success({
      statusCode: 200,
      data: { token: "admin", user: { id: "a", role: "ADMIN" } },
    });
  await assert.rejects(
    api.adminLogin("operator", "password", () => false),
    (e) => e.code === "LOGIN_CANCELLED",
  );
  assert.equal(store["wildboy-session"], "old");
});
test("logout prevents pending WeChat login from restoring a session", async () => {
  let waiting;
  reply = (o) => {
    waiting = o;
  };
  const pending = api.login(versions);
  await Promise.resolve();
  api.logout();
  waiting.success({
    statusCode: 200,
    data: { token: "late", user: { id: "u", role: "USER" } },
  });
  await assert.rejects(pending, (e) => e.code === "SESSION_CHANGED");
  assert.equal(api.hasSession(), false);
});
test("successful response from old account cannot leak after switching", async () => {
  store["wildboy-session"] = "old";
  reply = (o) => {
    store["wildboy-session"] = "new";
    o.success({ statusCode: 200, data: { private: "old-user" } });
  };
  await assert.rejects(
    api.request("/me/registrations"),
    (e) => e.code === "SESSION_CHANGED",
  );
});
test("login without explicit current consent versions never calls WeChat", async () => {
  await assert.rejects(api.login(), (e) => e.code === "CONSENT_REQUIRED");
  assert.equal(loginCount, 0);
  assert.equal(requestCount, 0);
});
test("developer USER login also sends exact consent versions", async () => {
  config.devLogin = true;
  let sent;
  reply = (o) => {
    sent = o;
    o.success({
      statusCode: 200,
      data: { token: "dev", user: { id: "u", role: "USER" } },
    });
  };
  await api.login(versions);
  assert.match(sent.url, /\/auth\/dev-login$/);
  assert.deepEqual(sent.data, { role: "USER", ...versions });
  assert.equal(loginCount, 0);
});
test("leaving WeChat login does not persist late credentials", async () => {
  await assert.rejects(
    api.login(versions, () => false),
    (e) => e.code === "LOGIN_CANCELLED",
  );
  assert.equal(api.hasSession(), false);
});
