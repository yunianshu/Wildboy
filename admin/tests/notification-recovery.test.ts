import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import NotificationsView from "../src/views/NotificationsView.vue";
import { acceptAuth, clearSession } from "../src/api";
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
it("does not send retries for missing subscription or service configuration", async () => {
  const items = [
    "FAILED",
    "NO_PERMISSION",
    "UNCONFIGURED",
    "SENT",
    "UNKNOWN",
  ].map((status, i) => ({
    id: "notice-" + i,
    status,
    kind: ["PRETRIP", "ACTIVITY_CHANGED", "ACTIVITY_CANCELLED"][i % 3],
    title: ["出发提醒", "活动变更", "活动取消"][i % 3],
    detail: "行程说明",
    lastError: "",
    attempts: 1,
  }));
  const f = vi.fn(async (path: string, _options: RequestInit = {}) =>
    ok(
      path.endsWith("/notifications/config")
        ? { ready: false, templateId: "" }
        : { items, page: 0, hasMore: false },
    ),
  );
  vi.stubGlobal("fetch", f);
  const w = mount(NotificationsView, { global: { stubs: { teleport: true } } });
  await flushPromises();
  for (const title of ["出发提醒", "活动变更", "活动取消"])
    expect(w.get("tbody").text()).toContain(title);
  expect(
    w
      .get("tbody")
      .findAll("button")
      .map((b) => b.text()),
  ).toEqual(["重新发送"]);
  expect(f).toHaveBeenCalledTimes(2);
  expect(w.text()).toContain("等待用户在小程序订阅");
  expect(w.text()).toContain("完成部署配置后可重新排队");
  await w
    .findAll("button")
    .find((b) => b.text() === "重新发送")!
    .trigger("click");
  expect(w.get('[role="dialog"]').text()).toContain("确认重试原通知");
  await w
    .findAll("button")
    .find((b) => b.text() === "确认重试")!
    .trigger("click");
  await flushPromises();
  expect(f.mock.calls.map((c) => c[0])).toContain(
    "/api/v1/admin/notifications/notice-0/retry",
  );
  expect(
    f.mock.calls.some(
      (c) => c[0].includes("notice-1/retry") || c[0].includes("notice-2/retry"),
    ),
  ).toBe(false);
  w.unmount();
});
it("a first-load notification error cannot also announce an empty list", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ message: "消息服务暂不可用" }),
    })),
  );
  const w = mount(NotificationsView);
  await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain("暂不可用");
  expect(w.text()).not.toContain("暂无通知");
  expect(w.find(".ui-state-loading").exists()).toBe(false);
  w.unmount();
});
it("an old retry response cannot show a previous operator's message after logout", async () => {
  let finish: (v: unknown) => void = () => {};
  const f = vi.fn((_: string, o: RequestInit = {}) =>
    o?.method === "POST"
      ? new Promise((r) => (finish = r))
      : Promise.resolve(
          ok({
            items: [
              {
                id: "n",
                status: "FAILED",
                title: "上一身份消息",
                detail: "",
                attempts: 1,
                lastError: "",
              },
            ],
            page: 0,
            hasMore: false,
          }),
        ),
  );
  vi.stubGlobal("fetch", f);
  const w = mount(NotificationsView, { global: { stubs: { teleport: true } } });
  await flushPromises();
  await w
    .findAll("button")
    .find((b) => b.text() === "重新发送")!
    .trigger("click");
  await w
    .findAll("button")
    .find((b) => b.text() === "确认重试")!
    .trigger("click");
  clearSession();
  finish(ok({}));
  await flushPromises();
  expect(w.text()).not.toContain("上一身份消息");
  expect(w.find('[role="alert"]').exists()).toBe(false);
  expect(f.mock.calls.filter(([, o]) => !o?.method)).toHaveLength(2);
  w.unmount();
});
it("keeps existing notices when config cannot be checked and retries the original id after configuration recovers", async () => {
  let configFailed = true;
  const item = {
    id: "original/config",
    status: "UNCONFIGURED",
    title: "原通知",
    detail: "变更说明",
    lastError: "",
    attempts: 0,
  };
  const f = vi.fn(async (path: string, options: RequestInit = {}) => {
    if (path.endsWith("/notifications/config")) {
      if (configFailed) throw Error("config offline");
      return ok({ ready: true, templateId: "configured" });
    }
    if (options.method === "POST") {
      item.status = "PENDING";
      return ok({});
    }
    return ok({ items: [item], page: 0, hasMore: false });
  });
  vi.stubGlobal("fetch", f);
  const w = mount(NotificationsView, { global: { stubs: { teleport: true } } });
  await flushPromises();
  expect(w.text()).toContain("原通知");
  expect(w.text()).toContain("暂无法核对微信消息配置");
  expect(w.get("tbody").findAll("button")).toHaveLength(0);
  expect(f.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  configFailed = false;
  window.dispatchEvent(new Event("focus"));
  await flushPromises();
  await w
    .findAll("button")
    .find((b) => b.text() === "重新排队")!
    .trigger("click");
  await w
    .findAll("button")
    .find((b) => b.text() === "确认重试")!
    .trigger("click");
  await flushPromises();
  const writes = f.mock.calls.filter(([, o]) => o?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(writes[0]?.[0]).toBe(
    "/api/v1/admin/notifications/original%2Fconfig/retry",
  );
  expect(w.text()).toContain("原通知已重新排队");
  expect(w.text()).toContain("待发送");
  expect(w.get("tbody").text()).not.toContain("已发送");
  w.unmount();
});
it("requires a cancellable subscription confirmation and does not claim a retry has delivered the notice", async () => {
  const item = {
    id: "original-permission",
    status: "NO_PERMISSION",
    title: "需用户授权的通知",
    detail: "",
    lastError: "",
    attempts: 0,
  };
  const f = vi.fn(async (path: string, _options: RequestInit = {}) =>
    ok(
      path.endsWith("/notifications/config")
        ? { ready: true, templateId: "configured" }
        : { items: [item], page: 0, hasMore: false },
    ),
  );
  vi.stubGlobal("fetch", f);
  const w = mount(NotificationsView, { global: { stubs: { teleport: true } } });
  await flushPromises();
  const open = () =>
    w
      .findAll("button")
      .find((b) => b.text() === "确认授权")!
      .trigger("click");
  await open();
  expect(w.get('[role="dialog"]').text()).toContain(
    "用户已在小程序重新同意订阅",
  );
  await w
    .get('[role="dialog"]')
    .findAll("button")
    .find((b) => b.text() === "取消")!
    .trigger("click");
  expect(f.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(0);
  await open();
  await w
    .get('[role="dialog"]')
    .findAll("button")
    .find((b) => b.text() === "已确认，重试原通知")!
    .trigger("click");
  await flushPromises();
  const writes = f.mock.calls.filter(([, o]) => o?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(writes[0]?.[0]).toBe(
    "/api/v1/admin/notifications/original-permission/retry",
  );
  expect(w.text()).toContain("等待授权");
  expect(w.text()).toContain("原通知已重新排队");
  expect(w.get("tbody").text()).not.toContain("已发送");
  w.unmount();
});
it("discards a restored-subscription retry when the operator changes", async () => {
  let finish!: (value: unknown) => void;
  const f = vi.fn((path: string, options: RequestInit = {}) =>
    options.method === "POST"
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(
          ok(
            path.endsWith("/notifications/config")
              ? { ready: true, templateId: "configured" }
              : {
                  items: [
                    {
                      id: "n",
                      status: "NO_PERMISSION",
                      title: "旧身份通知",
                      detail: "",
                      lastError: "",
                      attempts: 0,
                    },
                  ],
                  page: 0,
                  hasMore: false,
                },
          ),
        ),
  );
  vi.stubGlobal("fetch", f);
  const w = mount(NotificationsView, { global: { stubs: { teleport: true } } });
  await flushPromises();
  await w
    .findAll("button")
    .find((b) => b.text() === "确认授权")!
    .trigger("click");
  await w
    .get('[role="dialog"]')
    .findAll("button")
    .find((b) => b.text() === "已确认，重试原通知")!
    .trigger("click");
  acceptAuth({
    token: "new",
    user: { id: "other", nickname: "新管理员", role: "ADMIN" },
  });
  finish(ok({}));
  await flushPromises();
  expect(w.text()).not.toContain("旧身份通知");
  expect(w.text()).not.toContain("原通知已重新排队");
  expect(w.find('[role="dialog"]').exists()).toBe(false);
  expect(f.mock.calls.filter(([, o]) => !o?.method)).toHaveLength(2);
  w.unmount();
});
it("explains the configuration state even when the queue is empty", async () => {
  const f = vi.fn(async (path: string) =>
    ok(
      path.endsWith("/notifications/config")
        ? { ready: false, templateId: "" }
        : { items: [], page: 0, hasMore: false },
    ),
  );
  vi.stubGlobal("fetch", f);
  const w = mount(NotificationsView, { global: { stubs: { teleport: true } } });
  await flushPromises();
  expect(w.text()).toContain("暂无通知");
  expect(w.text()).toContain("活动取消、报名变动等消息会自动出现在这里");
  expect(w.text()).toContain("报名与活动变更的通知不会发送");
  w.unmount();
});
