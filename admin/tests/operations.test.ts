import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import TemplatesView from "../src/views/TemplatesView.vue";
import OperationsView from "../src/views/OperationsView.vue";
import { acceptAuth, clearSession } from "../src/api";
const source = {
  id: "source",
  title: "路线",
  status: "PUBLISHED",
  version: 4,
  capacity: 12,
};
const template = {
  id: "template",
  name: "周末徒步",
  version: 0,
  activity: source,
};
beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});
function fetcher() {
  const f = vi.fn(async (path: string, options: any = {}) => ({
    ok: true,
    status: 200,
    json: async () => {
      if (path.includes("/generate"))
        return [
          {
            id: "draft",
            title: "路线",
            startAt: "2027-05-01T00:00:00Z",
            status: "DRAFT",
          },
        ];
      if (path.includes("/admin/activities"))
        return { items: [source], hasMore: false };
      if (path.includes("/templates") && options.method) return template;
      if (path.includes("/templates"))
        return { items: [template], hasMore: false };
      if (path.includes("/dashboard"))
        return {
          activities: { total: 2, registrations: 10, capacity: 20, full: 1 },
          orders: { paid_orders: 3, gross_cents: 10000, refunded_cents: 2000 },
          pendingShipping: 1,
          lowStock: [],
          trend: [],
        };
      if (path.includes("/exceptions"))
        return {
          items: [
            {
              kind: "PAYMENT",
              id: "order",
              entity_id: "order",
              message: "待核对支付",
              status: "UNKNOWN",
              updated_at: "2026-10-29T01:00:00Z",
            },
          ],
          hasMore: false,
        };
      return { items: [], hasMore: false };
    },
  }));
  vi.stubGlobal("fetch", f);
  return f;
}
const mountView = (c: any) =>
  mount(c, {
    global: {
      stubs: { RouterLink: { props: ["to"], template: "<a><slot /></a>" } },
    },
  });
describe("operational workflows", () => {
  it("cancel template editor has no write and source is required", async () => {
    const f = fetcher();
    const w = mountView(TemplatesView);
    await flushPromises();
    await w
      .findAll("button")
      .find((b) => b.text() === "新建模板")!
      .trigger("click");
    await flushPromises();
    await w.get("form").trigger("submit");
    expect(w.text()).toContain("请选择来源活动");
    await w
      .findAll("button")
      .find((b) => b.text() === "取消")!
      .trigger("click");
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(f.mock.calls.filter(([, o]) => o?.method)).toHaveLength(0);
    w.unmount();
  });
  it("generates drafts with Beijing timezone dates and bounded repeats", async () => {
    const f = fetcher();
    const w = mountView(TemplatesView);
    await flushPromises();
    await w
      .findAll("button")
      .find((b) => b.text() === "生成草稿")!
      .trigger("click");
    await w.get('input[type="datetime-local"]').setValue("2027-05-01T09:00");
    const nums = w.findAll('input[type="number"]');
    await nums[0].setValue("2");
    await nums[1].setValue("7");
    await w.get("form").trigger("submit");
    await flushPromises();
    const call = f.mock.calls.find(([p]) => String(p).includes("/generate"))!;
    expect(JSON.parse(call[1].body)).toEqual({
      starts: ["2027-05-01T01:00:00.000Z", "2027-05-08T01:00:00.000Z"],
      version: 0,
    });
    expect(w.text()).toContain("已生成 1 场草稿");
    w.unmount();
  });
  it("shows net settled value, owner data clears on logout, exceptions route to real action", async () => {
    const f = fetcher();
    const w = mountView(OperationsView);
    await flushPromises();
    expect(w.text()).toContain("¥80.00");
    await w
      .findAll("button")
      .find((b) => b.text() === "异常待办")!
      .trigger("click");
    await flushPromises();
    await w
      .findAll("button")
      .find((b) => b.text() === "核对支付")!
      .trigger("click");
    await flushPromises();
    expect(
      f.mock.calls.some(
        ([p, o]) =>
          p.endsWith("/admin/orders/order/verify") && o?.method === "POST",
      ),
    ).toBe(true);
    clearSession();
    await flushPromises();
    expect(w.text()).not.toContain("待核对支付");
    w.unmount();
  });
  it("late response after unmount does not render old operator data", async () => {
    let release: any;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (release = r))),
    );
    const w = mountView(OperationsView);
    w.unmount();
    release({ ok: true, status: 200, json: async () => ({ private: true }) });
    await flushPromises();
    expect(w.exists()).toBe(false);
  });
});
