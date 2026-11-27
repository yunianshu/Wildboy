import { beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SettingsView from "../src/views/SettingsView.vue";
import { acceptAuth, clearSession } from "../src/api";
beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});
async function view() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: SettingsView }],
  });
  await router.push("/");
  const w = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return w;
}
it("shows wechat order center status and configures the detail path", async () => {
  const calls: Array<[string, any?]> = [];
  const fetchOrderCenter = vi.fn(async (url: string, opts: any = {}) => {
    calls.push([url, opts]);
    if (url.includes("/admin/wechat-order-center/status"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          orderDetailPathConfigured: false,
          orderDetailPath: "",
          confirmationCompleted: true,
          pathErrcode: 0,
          confirmationErrcode: 0,
        }),
      };
    if (url.includes("/articles?"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], hasMore: false }),
      };
    if (opts.method === "PUT" && url.includes("order-detail-path"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ attempted: true, errcode: 0 }),
      };
    return {
      ok: true,
      status: 200,
      json: async () =>
        opts.method ? { ...JSON.parse(opts.body), version: 4 } : {},
    };
  });
  vi.stubGlobal("fetch", fetchOrderCenter);
  const w = await view();

  expect(w.get("h1").text()).toBe("基础配置");
  expect(w.findAll(".task-tabs button").map((button) => button.text())).toEqual(
    ["微信订单路径", "微信订单对账"],
  );
  expect(w.find('a[href*="/home-layout"]').exists()).toBe(false);
  expect(calls.map(([url]) => url)).toEqual([
    "/api/v1/admin/wechat-order-center/status",
  ]);
  const card = w.get(".order-center-card");
  expect(card.isVisible()).toBe(true);
  expect(card.text()).toContain("微信电商订单");
  expect(card.text()).toContain("订单详情路径 · 未配置");
  expect(card.text()).toContain("交易结算管理确认 · 已完成");

  await card.get("button.primary").trigger("click");
  const dialog = w.get(".form-modal");
  const input = dialog.get('input[name="orderPath"]');
  expect((input.element as HTMLInputElement).value).toBe(
    "pages/order-detail/index?no=${商品订单号}",
  );
  // 去掉占位符提交 → 本地校验拦截，不发 PUT
  await input.setValue("pages/orders/index");
  await dialog.get("#order-path-form").trigger("submit");
  await flushPromises();
  expect(dialog.text()).toContain("占位符");
  expect(
    calls.find(
      ([u, o]) => o?.method === "PUT" && u.includes("order-detail-path"),
    ),
  ).toBeUndefined();
  // 合法路径提交 → 调用管理端点
  await input.setValue("pages/order-detail/index?no=${商品订单号}");
  await dialog.get("#order-path-form").trigger("submit");
  await flushPromises();
  const put = calls.find(
    ([u, o]) => o?.method === "PUT" && u.includes("order-detail-path"),
  );
  expect(put).toBeTruthy();
  expect(JSON.parse(put![1].body)).toEqual({
    path: "pages/order-detail/index?no=${商品订单号}",
  });
  w.unmount();
});

it("configures the wechat message jump path with local URL validation", async () => {
  const calls: Array<[string, any?]> = [];
  const fetchJump = vi.fn(async (url: string, opts: any = {}) => {
    calls.push([url, opts]);
    if (url.includes("/admin/wechat-order-center/status"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          orderDetailPathConfigured: true,
          orderDetailPath: "pages/a",
          savedMsgJumpPath: "pages/orders/index",
          confirmationCompleted: true,
          pathErrcode: 0,
          confirmationErrcode: 0,
        }),
      };
    if (url.includes("/articles?"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], hasMore: false }),
      };
    if (opts.method === "PUT" && url.includes("msg-jump-path"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ attempted: true, errcode: 0 }),
      };
    return {
      ok: true,
      status: 200,
      json: async () =>
        opts.method ? { ...JSON.parse(opts.body), version: 4 } : {},
    };
  });
  vi.stubGlobal("fetch", fetchJump);
  const w = await view();

  const card = w.get(".order-center-card");
  const jumpButton = card
    .findAll("button")
    .find((b) => b.text().includes("设置消息跳转路径"))!;
  await jumpButton.trigger("click");
  const dialog = w.get(".form-modal");
  const input = dialog.get('input[name="msgJumpPath"]');
  expect((input.element as HTMLInputElement).value).toBe("pages/orders/index");
  // 完整网址不是小程序页面路径 → 本地拦截
  await input.setValue("https://evil.example/x");
  await dialog.get("#msg-jump-form").trigger("submit");
  await flushPromises();
  expect(dialog.text()).toContain("不能是完整网址");
  expect(
    calls.find(([u, o]) => o?.method === "PUT" && u.includes("msg-jump-path")),
  ).toBeUndefined();
  // 合法路径 → 调用管理端点
  await input.setValue("pages/order-detail/index");
  await dialog.get("#msg-jump-form").trigger("submit");
  await flushPromises();
  const put = calls.find(
    ([u, o]) => o?.method === "PUT" && u.includes("msg-jump-path"),
  );
  expect(put).toBeTruthy();
  expect(JSON.parse(put![1].body)).toEqual({
    path: "pages/order-detail/index",
  });
  w.unmount();
});

it("queries wechat order list with filters and pagination", async () => {
  const calls: Array<[string, any?]> = [];
  let page = 0;
  const fetchOrders = vi.fn(async (url: string, opts: any = {}) => {
    calls.push([url, opts]);
    if (url.includes("/admin/wechat-order-center/status"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          orderDetailPathConfigured: true,
          orderDetailPath: "pages/a",
          confirmationCompleted: true,
          pathErrcode: 0,
          confirmationErrcode: 0,
        }),
      };
    if (url.includes("/articles?"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], hasMore: false }),
      };
    if (url.includes("/admin/wechat-order-center/wechat-orders")) {
      page += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          attempted: true,
          errcode: 0,
          error: "",
          lastIndex: page === 1 ? "idx-1" : "idx-2",
          hasMore: page === 1,
          orders:
            page === 1
              ? [
                  {
                    transaction_id: "42000000000000000000000000000081",
                    merchant_trade_no: "30000000000000000000000000000081",
                    order_state: 2,
                    pay_time: 1765000000,
                    paid_amount: 19900,
                    in_complaint: false,
                  },
                ]
              : [
                  {
                    transaction_id: "42000000000000000000000000000082",
                    merchant_trade_no: "30000000000000000000000000000082",
                    order_state: 6,
                    pay_time: 1765000100,
                    paid_amount: 9900,
                    in_complaint: true,
                  },
                ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () =>
        opts.method ? { ...JSON.parse(opts.body), version: 4 } : {},
    };
  });
  vi.stubGlobal("fetch", fetchOrders);
  const w = await view();

  // 选择状态并查询
  const form = w.get(".wechat-orders-filters");
  await form.get("select").setValue("2");
  await form.trigger("submit");
  await flushPromises();
  const first = calls.find(([u]) => u.includes("/wechat-orders?"))!;
  expect(first[0]).toContain("orderState=2");
  expect(first[0]).toContain("size=20");
  const card2 = w.get('[aria-labelledby="wechat-orders-heading"]');
  expect(card2.text()).toContain("42000000000000000000000000000081");
  expect(card2.text()).toContain("已发货");
  expect(card2.text()).toContain("¥199.00");
  // 下一页沿用已提交的条件及微信游标
  await form.get("select").setValue("3");
  const more = card2.findAll("button").find((b) => b.text() === "下一页")!;
  await more.trigger("click");
  await flushPromises();
  const second = calls.filter(([u]) => u.includes("/wechat-orders?"))[1];
  expect(second[0]).toContain("lastIndex=idx-1");
  expect(second[0]).toContain("orderState=2");
  expect(card2.text()).not.toContain("42000000000000000000000000000081");
  expect(card2.text()).toContain("资金待结算");
  expect(card2.text()).toContain("纠纷中");
  await card2
    .findAll("button")
    .find((b) => b.text() === "上一页")!
    .trigger("click");
  await flushPromises();
  const third = calls.filter(([u]) => u.includes("/wechat-orders?"))[2];
  expect(third[0]).not.toContain("lastIndex");
  expect(third[0]).toContain("orderState=2");
  w.unmount();
});


it("applies both Beijing payment times together without querying until submitted", async () => {
  const fetchWechat = vi.fn(async (_url: string) => ({
    ok: true,
    status: 200,
    json: async () => ({ attempted: true, errcode: 0, lastIndex: "", orders: [] }),
  }));
  vi.stubGlobal("fetch", fetchWechat);
  const w = await view();
  const ordersCalls = () => fetchWechat.mock.calls
    .map(([url]) => url)
    .filter((url) => url.includes("/wechat-orders?"));
  await w.findAll(".task-tabs button")[1]!.trigger("click");
  const trigger = w.get("#wx-payment-range");
  await trigger.trigger("click");
  expect(w.findAll('[role="dialog"]')).toHaveLength(1);
  await w.get("#wxBegin").setValue("2026-11-27T10:15");
  await w.get("#wxEnd").setValue("2026-11-27T09:10");
  expect(w.get(".form-modal [role=alert]").text()).toContain("不能晚于");
  expect(w.get('.form-modal button[type="submit"]').attributes("disabled")).toBeDefined();
  await w.get("#wx-payment-range-form").trigger("submit");
  expect(w.find("#wx-payment-range-form").exists()).toBe(true);
  await w.get("#wxEnd").setValue("2026-11-28T11:40");
  await w.get("#wx-payment-range-form").trigger("submit");
  expect(trigger.text()).toContain("2026-11-27 10:15");
  expect(trigger.text()).toContain("2026-11-28 11:40");
  expect(ordersCalls()).toEqual([]);

  await trigger.trigger("click");
  await w.get("#wxBegin").setValue("2026-11-26T00:00");
  expect((w.get("#wxEnd").element as HTMLInputElement).value).toBe("2026-11-28T11:40");
  await w.findAll(".form-modal button").find((button) => button.text() === "取消")!.trigger("click");
  expect(trigger.text()).toContain("2026-11-27 10:15");
  expect(trigger.text()).not.toContain("2026-11-26");

  await w.get(".wechat-orders-filters").trigger("submit");
  await flushPromises();
  const params = new URL(ordersCalls()[0]!, "https://example.test").searchParams;
  expect(params.get("begin")).toBe(String(Date.parse("2026-11-27T02:15:00Z") / 1000));
  expect(params.get("end")).toBe(String(Date.parse("2026-11-28T03:40:00Z") / 1000));

  await trigger.trigger("click");
  await w.get("#wxEnd").setValue("");
  await w.get("#wx-payment-range-form").trigger("submit");
  await w.get(".wechat-orders-filters").trigger("submit");
  await flushPromises();
  expect(new URL(ordersCalls()[1]!, "https://example.test").searchParams.has("end")).toBe(false);
  await w.findAll(".wechat-orders-actions button").find((button) => button.text() === "重置")!.trigger("click");
  expect(trigger.text()).toContain("选择支付时间范围");
  w.unmount();
});
