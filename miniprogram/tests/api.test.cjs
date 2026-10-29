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
  api.logout();
  wx.login = (o) => { loginCount++; o.success({ code: "one-use-code" }); };
  store = {};
  requestCount = 0;
  loginCount = 0;
  env = "develop";
  config.apiMode = "request";
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
      data: { token: "session", user: { id: "u", role: "USER" } },
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
    o.success({ statusCode: 200, data: { token: "s", user: { id: "u", role: "USER" } } });
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

test("malformed login identity never replaces an existing session", async () => {
  for (const user of [undefined, {}, {id: "u"}, {id: "u", role: "ADMIN"}, {id: "", role: "USER"}]) {
    store["wildboy-session"] = "existing";
    reply = o => o.success({statusCode: 200, data: {token: "bad", user}});
    await assert.rejects(api.login(versions), /响应异常/);
    assert.equal(store["wildboy-session"], "existing");
  }
});
test("late wx code after logout or leaving does not reach backend", async () => {
  for (const action of ["logout", "leave"]) {
    let callback, current = true;
    wx.login = o => { callback = o; };
    const pending = api.login(versions, () => current);
    if (action === "logout") api.logout(); else current = false;
    callback.success({code: "late-code"});
    await assert.rejects(pending, e => ["SESSION_CHANGED", "LOGIN_CANCELLED"].includes(e.code));
    assert.equal(requestCount, 0);
  }
});
test("wx login timeout ignores late callback and permits fresh retry", async (t) => {
  t.mock.timers.enable({apis: ["setTimeout"]});
  let callback;
  wx.login = o => { callback = o; assert.equal(o.timeout, 10000); };
  const pending = api.login(versions);
  t.mock.timers.tick(10000);
  await assert.rejects(pending, /超时/);
  callback.success({code: "too-late"});
  await Promise.resolve();
  assert.equal(requestCount, 0);
  wx.login = o => o.success({code: "fresh-code"});
  await api.login(versions);
  assert.equal(requestCount, 1);
});
test("wx login synchronous failure rejects without backend request", async () => {
  wx.login = () => { throw new Error("native unavailable"); };
  await assert.rejects(api.login(versions), /暂不可用/);
  assert.equal(requestCount, 0);
});

test("AnyService materializes uploaded images through JSON with bounded app cache", async () => {
  config.apiMode="anyservice";config.anyServiceEnvId="env";config.anyServiceName="service";
  const name="11111111-1111-1111-1111-111111111111.png",path=`/assets/uploads/${name}`,calls=[],writes=[],removed=[];
  wx.env={USER_DATA_PATH:"/app-cache"};
  wx.getFileSystemManager=()=>({mkdirSync(){},readdirSync(){return Array.from({length:64},(_,i)=>`${String(i).padStart(8,'0')}-0000-0000-0000-000000000000.png`)},unlinkSync:p=>removed.push(p),writeFile:o=>{writes.push(o.filePath);o.success({})}});
  wx.cloud={callContainer:o=>{calls.push(o.path);o.success({statusCode:200,data:o.path.includes('/media/')?{dataBase64:'AAAA'}:{imageUrl:path}})}};
  const value=await api.request('/shop/products');
  assert.equal(value.imageUrl,path);assert.equal(calls.filter(p=>p.includes('/media/')).length,1);
  assert.equal(api.mediaUrl(path),`/app-cache/wildboy-public-images/${name}`);assert.equal(writes.length,1);assert.equal(removed.length,1);
  await api.request('/shop/products');assert.equal(calls.filter(p=>p.includes('/media/')).length,1);
  delete wx.env;delete wx.cloud;
});
