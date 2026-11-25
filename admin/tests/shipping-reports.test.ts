import * as confirmation from "../src/confirm";
import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import ShippingReportsView from "../src/views/ShippingReportsView.vue";
import { currentUser, clearSession } from "../src/api";

let failed: any, reported: any, skipped: any, fetcher: any, confirm: any;
beforeEach(() => {
  failed = {
    id: "report-failed",
    source: "shop",
    order_id: "o1",
    order_no: "10000000000000000000000000000001",
    logistics_type: 1,
    status: "FAILED",
    attempts: 3,
    last_errcode: 9400001,
    last_error: "upload_shipping_info",
    next_retry_at: "2026-01-01T08:00:00+08:00",
    reported_at: null,
    updated_at: "2026-01-01T07:00:00+08:00",
  };
  reported = {
    ...failed,
    id: "report-reported",
    source: "activity",
    order_no: "20000000000000000000000000000002",
    logistics_type: 3,
    status: "REPORTED",
    attempts: 1,
    last_errcode: 0,
    reported_at: "2026-01-01T09:00:00+08:00",
  };
  skipped = {
    ...failed,
    id: "report-skipped",
    order_no: "30000000000000000000000000000003",
    status: "SKIPPED",
    last_errcode: null,
    last_error: "missing_transaction",
  };
  currentUser.value = { id: "admin", nickname: "管理员", role: "ADMIN" };
  fetcher = vi.fn(async (url: string, options: any = {}) => {
    if (options.method === "POST")
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...failed, status: "REPORTED" }),
      };
    const wanted = new URL(url, "https://x").searchParams.get("status") || "";
    const items = [failed, reported, skipped].filter(
      (r) => !wanted || r.status === wanted,
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({ items, hasMore: false }),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  confirm = vi.spyOn(confirmation, "askConfirm").mockResolvedValue(true);
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const button = (w: any, text: string) =>
  w.findAll("button").find((b: any) => b.text() === text)!;

it("labels each report row by source, logistics type and outcome", async () => {
  const w = mount(ShippingReportsView);
  await flushPromises();
  const text = w.text();
  expect(text).toContain("商城");
  expect(text).toContain("活动");
  expect(text).toContain("实体物流");
  expect(text).toContain("虚拟发货");
  expect(text).toContain("上报失败");
  expect(text).toContain("已上报");
  expect(text).toContain("错误码 9400001");
  expect(text).toContain("upload_shipping_info");
  expect(text).toContain("非微信支付订单，无交易记录");
  const actions = w.findAll("tbody button");
  expect(actions.map((button) => button.text())).toEqual(["补报"]);
  expect(actions[0].attributes("disabled")).toBeUndefined();
  w.unmount();
});

it("status filter requests only that status from the server", async () => {
  const w = mount(ShippingReportsView);
  await flushPromises();
  await button(w, "上报失败").trigger("click");
  await flushPromises();
  const last = fetcher.mock.calls.at(-1)[0] as string;
  expect(last).toContain("/api/v1/admin/shipping-reports?");
  expect(last).toContain("status=FAILED");
  // 仅展示失败行：已上报订单的订单号不再出现在表格里
  expect(w.text()).not.toContain("20000000000000000000000000000002");
  w.unmount();
});

it("retry needs explicit confirmation and posts to the retry endpoint", async () => {
  const w = mount(ShippingReportsView);
  await flushPromises();
  await button(w, "补报").trigger("click");
  expect(confirm).toHaveBeenCalledTimes(1);
  await flushPromises();
  // 列表请求、补报请求、补报后的刷新
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(fetcher.mock.calls[1][0]).toBe(
    "/api/v1/admin/shipping-reports/report-failed/retry",
  );
  expect((fetcher.mock.calls[1][1] as any).method).toBe("POST");
  w.unmount();
});

it("declining the confirmation never contacts the gateway", async () => {
  confirm.mockResolvedValue(false);
  const w = mount(ShippingReportsView);
  await flushPromises();
  await button(w, "补报").trigger("click");
  expect(fetcher).toHaveBeenCalledTimes(1); // 只有初始列表请求
  w.unmount();
});
