const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { config } = require("../dist/config.js");
let store = {},
  containerCalls = [],
  requestCalls = 0,
  reply;
global.wx = {
  getStorageSync: (k) => store[k],
  setStorageSync: (k, v) => (store[k] = v),
  removeStorageSync: (k) => delete store[k],
  getAccountInfoSync: () => ({ miniProgram: { envVersion: "release" } }),
  login: () => {},
  request: () => {
    requestCalls++;
  },
  cloud: {
    init: () => {},
    callContainer: (options) => {
      containerCalls.push(options);
      reply(options);
    },
  },
};
const api = require("../dist/utils/api.js");

beforeEach(() => {
  store = {};
  containerCalls = [];
  requestCalls = 0;
  config.apiMode = "anyservice";
  config.apiOrigin = "https://api.example.invalid";
  config.anyServiceEnvId = "wildboy-test-env";
  config.anyServiceName = "wildboy-api";
  config.devLogin = false;
  reply = (options) =>
    options.success({ statusCode: 200, data: { ok: true } });
});

test("anyservice mode needs no HTTPS origin and never uses wx.request", async () => {
  const data = await api.request("/home");
  assert.deepEqual(data, { ok: true });
  assert.equal(requestCalls, 0);
  assert.equal(containerCalls.length, 1);
  const call = containerCalls[0];
  assert.equal(call.path, "/api/v1/home");
  assert.equal(call.method, "GET");
  assert.equal(call.config.env, "wildboy-test-env");
  assert.equal(call.header["X-WX-SERVICE"], "tcbanyservice");
  assert.equal(call.header["X-AnyService-Name"], "wildboy-api");
});

test("anyservice mode sends the bearer token only for non-auth paths", async () => {
  store["wildboy-session"] = "session-token";
  await api.request("/me");
  assert.equal(
    containerCalls[0].header.Authorization,
    "Bearer session-token",
  );
  await api.request("/auth/admin", "POST", { username: "a", password: "b" });
  assert.equal(containerCalls[1].header.Authorization, undefined);
  assert.deepEqual(containerCalls[1].data, { username: "a", password: "b" });
});

test("anyservice mode maps upstream HTTP errors to ApiError", async () => {
  reply = (options) =>
    options.success({
      statusCode: 409,
      data: { code: "VERSION_CONFLICT", message: "请刷新后重试" },
    });
  await assert.rejects(api.request("/admin/activities/a"), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.code, "VERSION_CONFLICT");
    assert.equal(error.message, "请刷新后重试");
    return true;
  });
});

test("anyservice 401 clears the stored session", async () => {
  store["wildboy-session"] = "expired-token";
  reply = (options) =>
    options.success({ statusCode: 401, data: { code: "UNAUTHORIZED" } });
  await assert.rejects(api.request("/me"), { status: 401 });
  assert.equal(api.hasSession(), false);
});

test("anyservice failure keeps the network error message", async () => {
  reply = (options) => options.fail({ errMsg: "callContainer:fail" });
  await assert.rejects(api.request("/home"), /网络连接失败/);
});

test("anyservice mode without env or service name stays unconfigured", async () => {
  config.anyServiceName = "";
  await assert.rejects(api.request("/home"), /尚未配置/);
  assert.equal(containerCalls.length, 0);
  assert.equal(requestCalls, 0);
});

test("request mode still requires an HTTPS origin in release", async () => {
  config.apiMode = "request";
  config.apiOrigin = "http://60.205.219.30";
  await assert.rejects(api.request("/home"), /HTTPS/);
  assert.equal(containerCalls.length, 0);
});
