import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import RefundsView from "../src/views/RefundsView.vue";
import { currentUser, clearSession } from "../src/api";
let row: any, fetcher: any;
beforeEach(() => {
  row = {
    id: "r",
    orderId: "o",
    orderNo: "ORDER",
    amountCents: 100,
    reason: "不再需要",
    status: "REQUESTED",
    version: 0,
  };
  currentUser.value = { id: "admin", nickname: "管理员", role: "ADMIN" };
  fetcher = vi.fn(async (_: string, options: any = {}) => ({
    ok: true,
    status: 200,
    json: async () =>
      options.method === "POST"
        ? { ...row, status: "PROCESSING", version: 1 }
        : { items: [row], hasMore: false },
  }));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
const button = (w: any, text: string) =>
  w.findAll("button").find((b: any) => b.text() === text)!;
it("requires explicit confirmation before refund and labels processing accurately", async () => {
  const w = mount(RefundsView);
  await flushPromises();
  await button(w, "批准退款").trigger("click");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(w.get('[role="dialog"]').text()).toContain("不可撤回");
  await button(w, "确认").trigger("click");
  await flushPromises();
  expect(w.text()).toContain("退款中");
  expect(w.text()).not.toContain("已退款");
  expect(fetcher.mock.calls[1][0]).toBe("/api/v1/admin/refunds/r/approve");
  w.unmount();
});
it("cancel never sends a refund and rejection needs a reason", async () => {
  const w = mount(RefundsView);
  await flushPromises();
  await button(w, "批准退款").trigger("click");
  await button(w, "取消").trigger("click");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await button(w, "拒绝").trigger("click");
  await button(w, "确认").trigger("click");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(w.text()).toContain("请填写拒绝原因");
  await w.get("textarea").setValue("已沟通");
  await button(w, "确认").trigger("click");
  await flushPromises();
  expect(fetcher.mock.calls[1][0]).toContain("/reject");
  w.unmount();
});
it("identity changes discard pending rows and dialog", async () => {
  const w = mount(RefundsView);
  await flushPromises();
  await button(w, "批准退款").trigger("click");
  clearSession();
  await flushPromises();
  expect(w.find('[role="dialog"]').exists()).toBe(false);
  expect(w.text()).not.toContain("ORDER");
  w.unmount();
});
