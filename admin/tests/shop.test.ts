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
});
