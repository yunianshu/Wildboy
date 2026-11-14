import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ActivityOrdersView from "../src/views/ActivityOrdersView.vue";
import { acceptAuth, clearSession } from "../src/api";
const base = {
  id: "ao1",
  orderNo: "ACT-001",
  activityId: "a1",
  activityTitle: "山野徒步",
  userId: "private-user-id",
  status: "PAID",
  partySize: 2,
  originalTotalCents: 20000,
  totalCents: 16000,
  currency: "CNY",
  paymentTransactionId: "wx-real",
  version: 1,
};
let order: typeof base,
  refund: any,
  fetcher: ReturnType<typeof vi.fn>,
  wrapper: VueWrapper;
const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});
function button(text: string) {
  return wrapper.findAll("button").find((b) => b.text() === text)!;
}
const writes = () => fetcher.mock.calls.filter((c: any) => c[1]?.method);
beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  acceptAuth({
    token: "t",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  order = { ...base };
  refund = {
    id: "r1",
    amount_cents: 16000,
    reason: "无法参加",
    status: "REQUESTED",
    version: 4,
  };
  fetcher = vi.fn(async (url: string, options: any = {}) => {
    if (url.endsWith("/refund/approve")) {
      refund = { ...refund, status: "PROCESSING", version: 5 };
      order.status = "REFUND_PENDING";
      return ok(refund);
    }
    if (url.endsWith("/refund/verify")) {
      refund = { ...refund, status: "UNKNOWN" };
      return ok(refund);
    }
    if (url.endsWith("/refund/reject")) {
      refund = { ...refund, status: "REJECTED" };
      return ok(refund);
    }
    if (url.endsWith("/refund") && options.method === "POST") {
      refund = {
        id: "r-new",
        amount_cents: order.totalCents,
        reason: JSON.parse(options.body).reason,
        status: "REQUESTED",
        version: 0,
      };
      order.status = "REFUND_PENDING";
      return ok(refund);
    }
    if (url.endsWith("/refund")) return ok(refund);
    if (options.method) return ok({ ...order, status: "PENDING_PAYMENT" });
    return ok({
      items: [{ ...order }],
      total: 21,
      hasMore: !url.includes("page=1"),
      page: 0,
      size: 20,
    });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllGlobals();
});
async function view(path = "/") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: ActivityOrdersView }],
  });
  await router.push(path);
  wrapper = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return router;
}
async function open() {
  await button("查看订单").trigger("click");
  await flushPromises();
}
describe("activity order management", () => {
  it("keeps the selected activity filter through pagination and clears stale details when it changes", async () => {
    const router = await view("/?activityId=activity-one");
    expect(wrapper.text()).toContain("收费活动名单");
    expect(wrapper.text()).toContain("待支付仅保留名额");
    expect(fetcher.mock.calls[0][0]).toContain("activityId=activity-one");
    await button("下一页").trigger("click");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)![0]).toContain(
      "page=1&size=20&activityId=activity-one",
    );
    await open();
    const draft = wrapper.get('[aria-label="退款审核备注"]');
    await draft.setValue("正在核对的审核备注");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await router.push("/?activityId=activity-two");
    expect(router.currentRoute.value.query.activityId).toBe("activity-one");
    expect((draft.element as HTMLTextAreaElement).value).toBe(
      "正在核对的审核备注",
    );
    await router.push("/?activityId=activity-two");
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(fetcher.mock.calls.at(-1)![0]).toContain(
      "page=0&size=20&activityId=activity-two",
    );
    await router.push("/");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)![0]).not.toContain("activityId=");
  });
  it("paginates orders, masks user identity and uses backend price snapshots", async () => {
    await view();
    expect(wrapper.text()).toContain("¥160.00");
    expect(wrapper.text()).toContain("原价 ¥200.00");
    await button("下一页").trigger("click");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)![0]).toContain("page=1");
    await open();
    expect(wrapper.text()).not.toContain(base.userId);
    await button("查看用户标识").trigger("click");
    expect(wrapper.text()).toContain(base.userId);
    await button("关闭").trigger("click");
    await open();
    expect(wrapper.text()).not.toContain(base.userId);
  });
  it("passes the exact order and activity from an operations link", async () => {
    await view("/?activityId=a1&orderId=ao1");
    expect(wrapper.text()).toContain("活动订单核对");
    expect(fetcher.mock.calls[0][0]).toContain("activityId=a1&orderId=ao1");
    await open();
    expect(wrapper.get('[role="dialog"]').text()).toContain("ACT-001");
  });
  it("labels zero-cost confirmation and cancellation without fake payment or refund", async () => {
    order.totalCents = 0;
    order.status = "CONFIRMED_FREE";
    order.paymentTransactionId = "";
    refund = {};
    await view();
    await open();
    expect(wrapper.text()).toContain("免支付已确认");
    expect(wrapper.text()).toContain("免支付订单，无微信支付交易");
    expect(wrapper.text()).not.toContain("已支付");
    await button("关闭").trigger("click");
    order.status = "CLOSED";
    await button("刷新订单").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("免费报名已取消");
    expect(wrapper.text()).not.toContain("已退款");
  });
  it("approves only after confirmation, passes refund version and keeps processing distinct from success", async () => {
    await view();
    await open();
    vi.mocked(window.confirm).mockReturnValue(false);
    await button("批准全额退款").trigger("click");
    expect(writes()).toHaveLength(0);
    vi.mocked(window.confirm).mockReturnValue(true);
    await button("批准全额退款").trigger("click");
    await flushPromises();
    expect(writes()[0][0]).toContain(
      "/admin/activity-orders/ao1/refund/approve",
    );
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      refundId: "r1",
      version: 4,
    });
    expect(wrapper.text()).toContain("退款处理中");
    expect(wrapper.text()).not.toContain("已退款");
    await button("核对退款结果").trigger("click");
    await flushPromises();
    expect(JSON.parse(writes()[1][1].body)).toEqual({
      refundId: "r1",
      version: 5,
    });
    expect(wrapper.text()).toContain("结果待核对");
  });
  it("requires a rejection note and blocks stale retries until refund reload", async () => {
    await view();
    await open();
    await button("拒绝退款").trigger("click");
    expect(wrapper.text()).toContain("请填写拒绝原因");
    expect(writes()).toHaveLength(0);
    await wrapper.get('[aria-label="退款审核备注"]').setValue("不符合规则");
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ code: "STALE_VERSION", message: "退款申请已更新" }),
    });
    await button("拒绝退款").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("不会自动覆盖");
    expect(button("拒绝退款").attributes("disabled")).toBeDefined();
    refund.version = 7;
    await button("重新加载退款资料").trigger("click");
    await flushPromises();
    await wrapper.get('[aria-label="退款审核备注"]').setValue("复核原因");
    await button("拒绝退款").trigger("click");
    await flushPromises();
    expect(JSON.parse(writes()[1][1].body)).toEqual({
      refundId: "r1",
      version: 7,
      note: "复核原因",
    });
  });
  it("blocks a replaced refund at the same version until the operator rereads and confirms it", async () => {
    await view();
    await open();
    refund = { ...refund, id: "r2", reason: "新申请原因" };
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ code: "STALE_REFUND", message: "退款申请已替换" }),
    });
    await button("批准全额退款").trigger("click");
    await flushPromises();
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      refundId: "r1",
      version: 4,
    });
    expect(wrapper.text()).toContain("原退款申请已被替换");
    expect(wrapper.text()).not.toContain("新申请原因");
    expect(button("批准全额退款").attributes("disabled")).toBeDefined();
    await button("批准全额退款").trigger("click");
    expect(writes()).toHaveLength(1);
    await button("重新加载退款资料").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("新申请原因");
    expect(writes()).toHaveLength(1);
    await button("批准全额退款").trigger("click");
    await flushPromises();
    expect(JSON.parse(writes()[1][1].body)).toEqual({
      refundId: "r2",
      version: 4,
    });
  });
  it("refreshes order and refund state together before resuming after a post-save read failure", async () => {
    await view();
    await open();
    fetcher.mockImplementationOnce(async () => {
      refund = { ...refund, status: "PROCESSING", version: 5 };
      order.status = "REFUND_PENDING";
      return ok(refund);
    });
    fetcher.mockRejectedValueOnce(new Error("暂时无法读取订单"));
    await button("批准全额退款").trigger("click");
    await flushPromises();
    expect(writes()).toHaveLength(1);
    expect(wrapper.text()).toContain("请重新加载订单和退款资料");
    expect(button("重试原退款").attributes("disabled")).toBeDefined();

    refund = { ...refund, status: "SUCCESS", version: 6 };
    order.status = "REFUNDED";
    await button("重新加载退款资料").trigger("click");
    await flushPromises();
    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain("订单编号ACT-001");
    expect(dialog.text()).toContain("已退款");
    expect(dialog.text()).not.toContain("退款中");
    expect(wrapper.text()).not.toContain("请重新加载订单和退款资料");
    expect(writes()).toHaveLength(1);
  });
  it("checks pending payment with admin endpoint and does not invent successful payment", async () => {
    order.status = "PENDING_PAYMENT";
    order.paymentTransactionId = "";
    refund = {};
    await view();
    await open();
    await button("核对支付状态").trigger("click");
    await flushPromises();
    expect(writes()[0][0]).toBe("/api/v1/admin/activity-orders/ao1/verify");
    expect(wrapper.text()).toContain("待支付");
    expect(wrapper.text()).not.toContain("已支付");
  });
  it("loads participant details only on request, masks them and clears them on close", async () => {
    await view();
    await open();
    expect(fetcher.mock.calls.some((c) => c[0].endsWith("/participants"))).toBe(
      false,
    );
    fetcher.mockResolvedValueOnce(
      ok([
        {
          id: "p1",
          participantName: "参***",
          phone: "138****5678",
          idNumber: "350***********1234",
        },
        {
          id: "p2",
          participantName: "另一个人",
          phone: "123-4567",
          idNumber: "",
        },
      ]),
    );
    await button("加载参加者").trigger("click");
    await flushPromises();
    expect(wrapper.text()).not.toContain("13812345678");
    expect(wrapper.text()).not.toContain("参加者姓名");
    expect(wrapper.text()).toContain("350***********1234");
    expect(wrapper.text()).toContain("138****5678");
    expect(wrapper.text()).not.toContain("123-4567");
    expect(wrapper.text()).not.toContain("123••••4567");
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await button("查看姓名电话").trigger("click");
    expect(wrapper.text()).not.toContain("13812345678");
    expect(writes()).toHaveLength(0);
    fetcher.mockResolvedValueOnce(
      ok([
        {
          id: "p1",
          participantName: "参加者姓名",
          phone: "13812345678",
          idNumber: "350***********1234",
        },
      ]),
    );
    await button("查看姓名电话").trigger("click");
    await flushPromises();
    expect(writes()[0][0]).toBe(
      "/api/v1/admin/activity-orders/ao1/participants/reveal",
    );
    expect(wrapper.text()).toContain("13812345678");
    await button("隐藏姓名电话").trigger("click");
    expect(wrapper.text()).not.toContain("13812345678");
    await button("关闭").trigger("click");
    await open();
    expect(wrapper.text()).not.toContain("13812345678");
    expect(button("加载参加者").exists()).toBe(true);
  });
  it("retries only the existing unknown refund after confirmation with its version", async () => {
    refund.status = "UNKNOWN";
    order.status = "REFUND_PENDING";
    await view();
    await open();
    vi.mocked(window.confirm).mockReturnValue(false);
    await button("重试原退款").trigger("click");
    expect(writes()).toHaveLength(0);
    vi.mocked(window.confirm).mockReturnValue(true);
    fetcher.mockResolvedValueOnce(
      ok({ ...refund, status: "PROCESSING", version: 5 }),
    );
    await button("重试原退款").trigger("click");
    await flushPromises();
    expect(writes()[0][0]).toBe(
      "/api/v1/admin/activity-orders/ao1/refund/retry",
    );
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      refundId: "r1",
      version: 4,
    });
    expect(wrapper.text()).not.toContain("已退款");
  });
  it("requires reason and inline confirmation before an administrator requests a full refund", async () => {
    refund = {};
    await view();
    await open();
    expect(wrapper.text()).toContain("ACT-001 发起全额退款 ¥160.00");
    await wrapper.get('[role="dialog"] form').trigger("submit");
    expect(wrapper.text()).toContain("请填写退款原因");
    expect(writes()).toHaveLength(0);
    await wrapper.get('[aria-label="发起退款原因"]').setValue("活动取消");
    await wrapper.get('[role="dialog"] form').trigger("submit");
    expect(wrapper.text()).toContain("请先确认本订单");
    expect(writes()).toHaveLength(0);
    await wrapper.get('[aria-label="确认全额退款申请"]').setValue(true);
    await wrapper.get('[role="dialog"] form').trigger("submit");
    await flushPromises();
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toBe("/api/v1/admin/activity-orders/ao1/refund");
    expect(JSON.parse(writes()[0][1].body)).toEqual({ reason: "活动取消" });
    expect(wrapper.text()).toContain("待审核");
    expect(button("批准全额退款").exists()).toBe(true);
    expect(wrapper.text()).not.toContain("已退款");
    expect(order.totalCents).toBe(16000);
  });
  it("accepts a 200-character refund reason and blocks 201 characters", async () => {
    refund = {};
    await view();
    await open();
    expect(
      wrapper.get('[aria-label="发起退款原因"]').attributes("maxlength"),
    ).toBe("200");
    await wrapper.get('[aria-label="确认全额退款申请"]').setValue(true);
    await wrapper.get('[aria-label="发起退款原因"]').setValue("因".repeat(201));
    await wrapper.get('[role="dialog"] form').trigger("submit");
    expect(writes()).toHaveLength(0);
    expect(wrapper.text()).toContain("1–200字");
    await wrapper.get('[aria-label="发起退款原因"]').setValue("因".repeat(200));
    await wrapper.get('[role="dialog"] form').trigger("submit");
    await flushPromises();
    expect(JSON.parse(writes()[0][1].body).reason).toHaveLength(200);
    expect(
      wrapper.get('[aria-label="退款审核备注"]').attributes("maxlength"),
    ).toBe("200");
    await wrapper.get('[aria-label="退款审核备注"]').setValue("因".repeat(201));
    await button("拒绝退款").trigger("click");
    expect(writes()).toHaveLength(1);
    expect(wrapper.text()).toContain("审核备注最多200字");
    await wrapper.get('[aria-label="退款审核备注"]').setValue("因".repeat(200));
    await button("拒绝退款").trigger("click");
    await flushPromises();
    expect(JSON.parse(writes()[1][1].body).note).toHaveLength(200);
  });
  it.each(["REJECTED", "CLOSED"])(
    "permits a new request for a paid order after %s",
    async (status) => {
      refund.status = status;
      await view();
      await open();
      expect(button("发起全额退款").exists()).toBe(true);
    },
  );
  it("does not offer administrator refund requests for unpaid orders and locks duplicate requests", async () => {
    order.status = "PENDING_PAYMENT";
    refund = {};
    await view();
    await open();
    expect(wrapper.find('[aria-label="发起退款原因"]').exists()).toBe(false);
    await button("关闭").trigger("click");
    order.status = "PAID";
    await button("刷新订单").trigger("click");
    await flushPromises();
    await open();
    await wrapper.get('[aria-label="发起退款原因"]').setValue("活动取消");
    await wrapper.get('[aria-label="确认全额退款申请"]').setValue(true);
    let finish!: (r: unknown) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await wrapper.get('[role="dialog"] form').trigger("submit");
    await wrapper.get('[role="dialog"] form').trigger("submit");
    expect(writes()).toHaveLength(1);
    clearSession();
    await flushPromises();
    finish(ok({ id: "r-new", status: "REQUESTED", version: 0 }));
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
  it("locks repeated refund actions and ignores late results after logout", async () => {
    await view();
    await open();
    let finish!: (r: unknown) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await button("批准全额退款").trigger("click");
    await button("批准全额退款").trigger("click");
    expect(writes()).toHaveLength(1);
    clearSession();
    await flushPromises();
    finish(ok({ ...refund, status: "SUCCESS" }));
    await flushPromises();
    expect(wrapper.find("tbody").exists()).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});
