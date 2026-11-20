import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ShopView from "../src/views/ShopView.vue";
import { acceptAuth, clearSession } from "../src/api";

const product = {
  id: "product-1",
  name: "徒步背包",
  description: "轻量装备",
  imageUrl: "/assets/equipment.jpg",
  priceCents: 19900,
  stock: 8,
  status: "ON_SALE",
  version: 2,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const order = {
  id: "order-1",
  orderNo: "order-number-1",
  userId: "user-1",
  totalCents: 19900,
  status: "PAID",
  recipientName: "收货人",
  phone: "13800000000",
  address: "厦门市测试地址",
  paymentTransactionId: "transaction-1",
  paymentInitiated: true,
  paidAt: "2026-01-01T00:00:00Z",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  items: [
    {
      ...product,
      productId: product.id,
      productName: product.name,
      quantity: 1,
    },
  ],
};

beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
  acceptAuth({
    token: "test",
    user: { id: "a", nickname: "管理员", role: "ADMIN" },
  });
});

describe("shop administration", () => {
  const orderPage = {
    items: [order],
    total: 1,
    page: 0,
    size: 20,
    hasMore: false,
  };
  function click(wrapper: ReturnType<typeof mount>, label: string) {
    return wrapper
      .findAll("button")
      .find((b) => b.text() === label)!
      .trigger("click");
  }
  it("opens independent information and content editors from the product row", async () => {
    const contentPath = `/api/v1/admin/shop/products/${product.id}/content/markdown`;
    const fetch = vi.fn(async (path: string) => ({
      ok: true,
      status: 200,
      json: async () => {
        if (path.endsWith("/products")) return [product];
        if (path.endsWith("/categories")) return [];
        return orderPage;
      },
    }));
    vi.stubGlobal("fetch", fetch);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/shop", component: ShopView },
        { path: "/shop/products/:id/content", component: { template: "<h1>商品图文工作台</h1>" } },
      ],
    });
    await router.push("/shop?productQuery=背包");
    const wrapper = mount({ template: "<RouterView />" }, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.findAll("button").find(b => b.text() === "编辑商品信息")!.trigger("click");
    expect(wrapper.get('[role="dialog"] h2').text()).toBe("编辑商品信息");
    expect(wrapper.text()).not.toContain("商品图文工作台");
    expect(fetch.mock.calls.some(([path]) => path === contentPath)).toBe(false);
    await wrapper.get('button[aria-label="关闭弹窗"]').trigger("click");

    await wrapper.get(`a[href^="/shop/products/${product.id}/content"]`).trigger("click");
    await flushPromises();
    expect(wrapper.get("h1").text()).toBe("商品图文工作台");
    expect(wrapper.find("#shop-product-form").exists()).toBe(false);
    expect(router.currentRoute.value.query.productQuery).toBe("背包");
    wrapper.unmount();
  });

  it("loads products and masks order delivery data", async () => {
    const fetchMock = vi.fn().mockImplementation(async (path: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        path.includes("/admin/shop/products")
          ? [product]
          : { items: [order], total: 1, page: 0, size: 20, hasMore: false },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    expect(wrapper.text()).toContain("徒步背包");
    expect(wrapper.text()).toContain("¥199.00");
    expect(wrapper.text()).toContain("已支付");
    expect(wrapper.get(".privacy-note").text()).toContain("仅用于订单履约");
    expect(wrapper.get(".privacy-note").text()).toContain(
      "请勿公开或用于无关营销",
    );
    expect(wrapper.text()).not.toContain("13800000000");
    expect(wrapper.text()).not.toContain("厦门市测试地址");
    await click(wrapper, "订单与发货");
    const reveal = wrapper
      .findAll("button")
      .find((button) => button.text() === "查看收货信息");
    await reveal?.trigger("click");
    expect(wrapper.text()).not.toContain(order.address);
    await click(wrapper, "取消");
    expect(wrapper.text()).not.toContain(order.address);
    await reveal?.trigger("click");
    await click(wrapper, "确认查看");
    expect(wrapper.text()).toContain("13800000000");
    expect(wrapper.text()).toContain("厦门市测试地址");
    wrapper.unmount();
  });
  it("shows free-confirmed orders without fake payment and permits fulfillment", async () => {
    const free = {
      ...order,
      status: "CONFIRMED_FREE",
      totalCents: 0,
      originalTotalCents: 19900,
      paymentTransactionId: null,
      paidAt: null,
      items: [
        {
          ...order.items[0],
          priceCents: 0,
          originalPriceCents: 19900,
          tierName: "黄金",
        },
      ],
    };
    const blocked = {
      ...free,
      id: "blocked-free-order",
      orderNo: "blocked-free-order",
      reconciliationRequired: true,
    };
    const fetch = vi.fn(async (path: string, _options?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () =>
        path.includes("/admin/shop/products")
          ? [product]
          : { ...orderPage, items: [free, blocked] },
    }));
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    const card = wrapper.get(".order-admin-card");
    expect(card.text()).toContain("免支付已确认");
    expect(card.text()).toContain("免支付订单，无微信交易号");
    expect(card.text()).toContain("会员优惠前 ¥199.00");
    await card
      .findAll("button")
      .find((b) => b.text() === "展开商品明细")!
      .trigger("click");
    expect(card.text()).toContain("黄金优惠价 ¥0.00 / 件");
    expect(card.text()).not.toContain("已支付");
    expect(card.text()).not.toContain("尚未确认支付");
    expect(card.text()).not.toContain("退款");
    expect(
      wrapper.get('[aria-label="订单 blocked-free-order"]').text(),
    ).not.toContain("确认发货");
    await click(wrapper, "确认发货");
    const dialog = wrapper.get('[role="dialog"]');
    await dialog
      .findAll("button")
      .find((b) => b.text() === "确认发货")!
      .trigger("click");
    await flushPromises();
    const write = fetch.mock.calls.find(
      ([, options]) => options?.method === "POST",
    );
    expect(write?.[0]).toBe("/api/v1/admin/orders/order-1/ship");
    expect(JSON.parse(String(write?.[1]?.body))).toEqual({
      version: free.version,
      company: "",
      trackingNo: "",
    });
    wrapper.unmount();
  });
  it("shows the refund conflict in the shipping dialog and prevents retrying the old version", async () => {
    let latest = { ...order };
    const fetch = vi.fn(async (path: string, options?: RequestInit) => {
      if (options?.method === "POST") {
        latest = { ...order, status: "REFUNDED", version: 2 };
        return {
          ok: false,
          status: 409,
          json: async () => ({
            code: "REFUND_PENDING",
            message: "退款申请处理中，不能发货",
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          path.includes("/admin/shop/products")
            ? [product]
            : { ...orderPage, items: [latest] },
      };
    });
    vi.stubGlobal("fetch", fetch);
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await click(wrapper, "确认发货");
    const dialog = wrapper.get('[role="dialog"]');
    const inputs = dialog.findAll("input");
    await inputs[0]!.setValue("顺丰速运");
    await inputs[1]!.setValue("SF123456789");
    const confirm = dialog
      .findAll("button")
      .find((b) => b.text() === "确认发货")!;
    await confirm.trigger("click");
    await flushPromises();
    const shipCall = fetch.mock.calls.find(
      ([, o]) => o?.method === "POST",
    );
    expect(JSON.parse(String(shipCall?.[1]?.body))).toEqual({
      version: order.version,
      company: "顺丰速运",
      trackingNo: "SF123456789",
    });
    const blockedDialog = wrapper.get('[role="dialog"]');
    expect(blockedDialog.get('[role="alert"]').text()).toContain(
      "退款申请处理中，不能发货",
    );
    const blockedConfirm = blockedDialog
      .findAll("button")
      .find((b) => b.text() === "确认发货")!;
    expect(blockedConfirm.attributes("disabled")).toBeDefined();
    await blockedConfirm.trigger("click");
    expect(
      fetch.mock.calls.filter(([, o]) => o?.method === "POST"),
    ).toHaveLength(1);
    await click(wrapper, "返回");
    await flushPromises();
    expect(wrapper.get(".order-admin-card").text()).toContain("已退款");
    expect(wrapper.findAll("button").some((b) => b.text() === "确认发货")).toBe(
      false,
    );
    wrapper.unmount();
  });
  it("clears revealed delivery data immediately when the operator logs out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          path.includes("/admin/shop/products") ? [product] : orderPage,
      })),
    );
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await click(wrapper, "订单与发货");
    await click(wrapper, "查看收货信息");
    await click(wrapper, "确认查看");
    expect(wrapper.text()).toContain(order.address);
    clearSession();
    await flushPromises();
    expect(wrapper.text()).not.toContain(order.address);
    expect(wrapper.text()).not.toContain(order.recipientName);
    expect(wrapper.text()).not.toContain(order.orderNo);
    wrapper.unmount();
  });
  it("does not refill the previous operator's orders after logout", async () => {
    const responses: ((value: unknown) => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => responses.push(r))),
    );
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    clearSession();
    responses[0]({ ok: true, status: 200, json: async () => [product] });
    responses[1]({ ok: true, status: 200, json: async () => orderPage });
    await flushPromises();
    expect(wrapper.text()).not.toContain(order.recipientName);
    expect(wrapper.text()).not.toContain(order.orderNo);
    wrapper.unmount();
  });
  it("retains the form's original version after the catalog refreshes", async () => {
    let catalogReads = 0;
    let finishRefresh!: (value: (typeof product)[]) => void;
    const refreshedCatalog = new Promise<(typeof product)[]>((resolve) => {
      finishRefresh = resolve;
    });
    const fetchMock = vi.fn(
      async (path: string, options: RequestInit = {}) => ({
        ok: true,
        status: 200,
        json: async () =>
          options.method === "PUT"
            ? product
            : path.includes("/admin/shop/products")
              ? ++catalogReads === 1
                ? [product]
                : refreshedCatalog
              : { ...orderPage, hasMore: true },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await click(wrapper, "订单与发货");
    await click(wrapper, "下一页");
    await click(wrapper, "商品与库存");
    await click(wrapper, "编辑商品信息");
    // A catalog request already in flight finishes after the edit draft opens.
    finishRefresh([{ ...product, stock: 4, version: 3 }]);
    await flushPromises();
    await wrapper.get(".form-modal form input").setValue("新的商品名称");
    await wrapper.get(".form-modal form").trigger("submit");
    await flushPromises();
    const call = fetchMock.mock.calls.find(([, o]) => o?.method === "PUT")!;
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({
      stock: 8,
      version: 2,
    });
    wrapper.unmount();
  });

  it("shows and focuses invalid-price feedback inside the product editor without sending a write", async () => {
    const fetchMock = vi.fn(
      async (path: string, _options: RequestInit = {}) => ({
        ok: true,
        status: 200,
        json: async () =>
          path.includes("/admin/shop/products") ? [product] : orderPage,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(ShopView, { attachTo: document.body });
    try {
      await flushPromises();
      await click(wrapper, "编辑商品信息");
      await wrapper.get('input[name="originalPrice"]').setValue("1");
      await wrapper.get('input[name="currentPrice"]').setValue("2");
      await wrapper.get(".form-modal form").trigger("submit");
      await flushPromises();
      const alert = wrapper.get('.form-modal [role="alert"]');
      expect(alert.text()).toBe("原价不能低于现价");
      expect(document.activeElement).toBe(alert.element);
      expect(wrapper.find('main > [role="alert"]').exists()).toBe(false);
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(false);
      await wrapper.get('input[name="originalPrice"]').setValue("3");
      await wrapper.get(".form-modal form").trigger("submit");
      await flushPromises();
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "PUT"),
      ).toBe(true);
    } finally {
      wrapper.unmount();
    }
  });

  it("keeps a rejected save's error and unchanged draft visible in the dialog", async () => {
    const fetchMock = vi.fn(
      async (path: string, options: RequestInit = {}) => ({
        ok: options.method !== "PUT",
        status: options.method === "PUT" ? 409 : 200,
        json: async () =>
          options.method === "PUT"
            ? { code: "STALE_VERSION", message: "商品已更新，请核对最新版本" }
            : path.includes("/admin/shop/products")
              ? [product]
              : orderPage,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(ShopView, { attachTo: document.body });
    try {
      await flushPromises();
      await click(wrapper, "编辑商品信息");
      await wrapper.get(".form-modal form input").setValue("保留的商品名称");
      await wrapper.get(".form-modal form").trigger("submit");
      await flushPromises();
      const alert = wrapper.get('.form-modal [role="alert"]');
      expect(alert.text()).toContain("内容冲突");
      expect(document.activeElement).toBe(alert.element);
      expect(wrapper.get<HTMLInputElement>(".form-modal form input").element.value).toBe(
        "保留的商品名称",
      );
      const call = fetchMock.mock.calls.find(
        ([, options]) => options?.method === "PUT",
      )!;
      expect(JSON.parse(String(call[1]!.body)).version).toBe(2);
      expect(wrapper.find('main > [role="alert"]').exists()).toBe(false);
    } finally {
      wrapper.unmount();
    }
  });

  it("opens the order route directly and keeps route changes and task tabs in sync", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          path.includes("/admin/shop/products") ? [product] : orderPage,
      })),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/shop", component: ShopView }],
    });
    await router.push("/shop?tab=orders");
    const wrapper = mount(ShopView, {
      attachTo: document.body,
      global: { plugins: [router] },
    });
    try {
      await flushPromises();
      expect(wrapper.get("#shop-orders").isVisible()).toBe(true);
      expect(wrapper.get("#shop-products").isVisible()).toBe(false);
      expect(
        wrapper
          .findAll("button")
          .find((button) => button.text() === "筛选商品")
          ?.isVisible(),
      ).toBe(false);
      await click(wrapper, "商品与库存");
      await flushPromises();
      expect(router.currentRoute.value.query.tab).toBe("products");
      expect(wrapper.get("#shop-products").isVisible()).toBe(true);
      expect(wrapper.get("#shop-orders").isVisible()).toBe(false);
      await router.push("/shop?tab=orders");
      await flushPromises();
      expect(wrapper.get("#shop-orders").isVisible()).toBe(true);
      expect(wrapper.get('.task-tabs [aria-pressed="true"]').text()).toBe(
        "订单与发货",
      );
    } finally {
      wrapper.unmount();
    }
  });
});
