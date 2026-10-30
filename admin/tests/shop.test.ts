import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
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
    const reveal = wrapper
      .findAll("button")
      .find((button) => button.text() === "查看收货信息");
    await reveal?.trigger("click");
    expect(wrapper.text()).toContain("13800000000");
    expect(wrapper.text()).toContain("厦门市测试地址");
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
    await click(wrapper, "查看收货信息");
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
    let catalog = product;
    const fetchMock = vi.fn(
      async (path: string, options: RequestInit = {}) => ({
        ok: true,
        status: 200,
        json: async () =>
          options.method === "PUT"
            ? product
            : path.includes("/admin/shop/products")
              ? [catalog]
              : orderPage,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = mount(ShopView, { global: { stubs: { teleport: true } } });
    await flushPromises();
    await click(wrapper, "编辑");
    // A validation failure exposes the real list-retry control while the form remains open.
    await wrapper.get("form input").setValue("");
    await wrapper.get("form").trigger("submit");
    catalog = { ...product, stock: 4, version: 3 };
    await click(wrapper, "重试");
    await flushPromises();
    await wrapper.get("form input").setValue("新的商品名称");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const call = fetchMock.mock.calls.find(([, o]) => o?.method === "PUT")!;
    expect(JSON.parse(String(call[1]!.body))).toMatchObject({
      stock: 8,
      version: 2,
    });
    wrapper.unmount();
  });
});
