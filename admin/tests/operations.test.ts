import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import OperationsView from "../src/views/OperationsView.vue";
import { acceptAuth, clearSession } from "../src/api";
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
      if (path.includes("/dashboard"))
        return {
          activities: { total: 2, registrations: 10, capacity: 20, full: 1 },
          orders: { paid_orders: 3, gross_cents: 10000, refunded_cents: 2000 },
          pendingShipping: 1,
          shippingDueSoon: 2,
          shippingOverdue: 1,
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
const mountView = (c: any, section?: "exceptions" | "audit") =>
  mount(c, {
    props: { section },
    global: {
      stubs: {
        RouterLink: {
          props: ["to"],
          template:
            '<a :href="typeof to === &quot;string&quot; ? to : undefined"><slot /></a>',
        },
      },
    },
  });
describe("operational workflows", () => {
  it("shows net settled value, owner data clears on logout, exceptions route to real action", async () => {
    const f = fetcher();
    const w = mountView(OperationsView);
    await flushPromises();
    expect(w.text()).toContain("¥80.00");
    const warning = w.get(
      '[aria-labelledby="shipping-metrics"] .metric:nth-child(2)',
    );
    expect(warning.get("a").text()).toBe("发货预警");
    expect(warning.get("a").attributes("href")).toBe("/operations/exceptions");
    expect(warning.get("strong").text()).toBe("2 / 1");
    expect(warning.get("small").text()).toBe("24h / 40h");
    expect(warning.classes()).toContain("has-task");
    w.unmount();
    const exceptions = mountView(OperationsView, "exceptions");
    await flushPromises();
    await exceptions
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
    expect(exceptions.text()).not.toContain("待核对支付");
    exceptions.unmount();
  });
  it("scopes date selection to shop metrics and keeps the last confirmed range on failure", async () => {
    const f = fetcher();
    const w = mountView(OperationsView);
    await flushPromises();
    const filter = '[aria-label="商城订单统计时间"]';
    const group = (id: string) => w.get(`[aria-labelledby="${id}"]`);
    expect(w.find(".operation-toolbar").exists()).toBe(false);
    expect(w.find('[aria-label="工作台视图"]').exists()).toBe(false);
    const before = ["activity-metrics", "shipping-metrics"].map((id) =>
      group(id).text(),
    );
    await group("shop-metrics").get(filter).setValue("14");
    await flushPromises();
    expect(
      f.mock.calls.some(([p]) => p.endsWith("/admin/dashboard?days=14")),
    ).toBe(true);
    expect(w.get(".trend-panel .panel-badge").text()).toBe("近 14 天");
    expect(
      ["activity-metrics", "shipping-metrics"].map((id) => group(id).text()),
    ).toEqual(before);

    f.mockRejectedValueOnce(new Error("离线"));
    await group("shop-metrics").get(filter).setValue("30");
    await flushPromises();
    expect(w.find('[role="alert"]').exists()).toBe(true);
    expect((w.get(filter).element as HTMLSelectElement).value).toBe("14");
    expect(w.get(".trend-panel .panel-badge").text()).toBe("近 14 天");
    expect(w.get(".hero-copy a").attributes("href")).toBe(
      "/operations/exceptions",
    );
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
  it("shows confirmed and occupied seats separately and sends paid exceptions to their order", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          path.includes("/dashboard")
            ? {
                activities: {
                  total: 1,
                  registrations: 1,
                  occupied: 4,
                  pending_payment: 3,
                  capacity: 20,
                  full: 0,
                },
                orders: { paid_orders: 0, gross_cents: 0, refunded_cents: 0 },
                pendingShipping: 0,
                lowStock: [],
                trend: [],
              }
            : {
                items: ["ACTIVITY_PAYMENT", "ACTIVITY_REFUND"].map((kind) => ({
                  kind,
                  id: kind,
                  entity_id:
                    kind === "ACTIVITY_PAYMENT" ? "payment-1" : "refund-1",
                  activity_id: "activity-1",
                  message: kind,
                  status: "UNKNOWN",
                  updated_at: "2026-11-11T00:00:00Z",
                })),
                hasMore: false,
              },
      })),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/", component: OperationsView },
        {
          path: "/activity-orders",
          component: { template: "<p>活动订单</p>" },
        },
      ],
    });
    await router.push("/");
    const w = mount(OperationsView, { global: { plugins: [router] } });
    await flushPromises();
    expect(w.text()).toContain("未来活动已确认报名");
    expect(w.text()).toContain("名额占用 4 / 20 · 待支付 3");
    w.unmount();
    const exceptions = mount(OperationsView, {
      props: { section: "exceptions" },
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(exceptions.findAll("a").map((a) => a.attributes("href"))).toEqual([
      "/activity-orders?orderId=payment-1&activityId=activity-1",
      "/activity-orders?orderId=refund-1&activityId=activity-1",
    ]);
    expect(
      exceptions.findAll("button").some((b) => b.text() === "核对支付"),
    ).toBe(false);
    exceptions.unmount();
  });

  it("loads audit directly without requesting overview or exceptions", async () => {
    const f = fetcher();
    const audit = mountView(OperationsView, "audit");
    await flushPromises();
    expect(audit.get("h1").text()).toBe("操作历史");
    expect(audit.find(".operations-hero").exists()).toBe(false);
    expect(audit.find('[aria-label="筛选操作历史"]').exists()).toBe(true);
    expect(f.mock.calls.map(([path]) => path)).toEqual([
      "/api/v1/admin/audit?page=0&size=20",
    ]);
    audit.unmount();
  });
});
