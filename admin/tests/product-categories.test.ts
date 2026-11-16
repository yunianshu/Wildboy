import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ProductCategoriesView from "../src/views/ProductCategoriesView.vue";
import ShopView from "../src/views/ShopView.vue";
import { acceptAuth, clearSession, currentUser } from "../src/api";
import type { Product, ProductCategory } from "../src/types";

const fallback: ProductCategory = {
  id: "uncategorized",
  name: "未分类",
  sortOrder: 9999,
  version: 0,
  productCount: 1,
};
const gear: ProductCategory = {
  id: "gear",
  name: "徒步装备",
  sortOrder: 10,
  version: 2,
  productCount: 1,
};
const product: Product = {
  id: "p1",
  name: "徒步背包",
  description: "轻量装备",
  imageUrl: "/assets/equipment.jpg",
  categoryId: "uncategorized",
  categoryName: "未分类",
  priceCents: 19900,
  originalPriceCents: 19900,
  stock: 8,
  status: "ON_SALE",
  version: 2,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
const order = {
  id: "o1",
  orderNo: "historical-order",
  userId: "u1",
  totalCents: 19900,
  status: "PAID",
  recipientName: "张*",
  phone: "13800008000",
  address: "历史收货地址",
  paymentTransactionId: "tx",
  paymentInitiated: true,
  paidAt: "2026-10-01T00:00:00Z",
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  items: [
    {
      id: "line",
      productId: "p1",
      productName: "历史商品名",
      imageUrl: product.imageUrl,
      priceCents: 19900,
      quantity: 1,
    },
  ],
};
const orderPage = {
  items: [order],
  page: 0,
  total: 1,
  size: 8,
  hasMore: false,
};
const response = (value: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => value,
});
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearSession();
  acceptAuth({
    token: "admin",
    user: { id: "operator", nickname: "管理员", role: "ADMIN" },
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  clearSession();
  vi.unstubAllGlobals();
});
async function render(
  fetcher: ReturnType<typeof vi.fn>,
  path = "/shop/categories",
) {
  vi.stubGlobal("fetch", fetcher);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/shop/categories", component: ProductCategoriesView },
      { path: "/shop", component: ShopView },
      { path: "/login", component: { template: "<p>登录</p>" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router], stubs: { teleport: true } } },
  );
  wrappers.push(wrapper);
  await flushPromises();
  return { wrapper, router };
}
function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll("button").find((item) => item.text() === label);
  if (!found) throw new Error(`Missing button ${label}`);
  return found;
}
function writes(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.filter(([, options]) =>
    ["POST", "PUT"].includes(options?.method),
  );
}
const readShop = (
  path: string,
  catalog = [product],
  categories = [gear, fallback],
) =>
  response(
    path.includes("/shop/categories")
      ? categories
      : path.includes("/shop/products")
        ? catalog
        : orderPage,
  );

describe("single-level product categories", () => {
  it("paginates eight categories and offers create/edit without delete or hierarchy", async () => {
    const categories = Array.from({ length: 9 }, (_, i) => ({
      ...gear,
      id: String(i),
      name: `装备分类${i}`,
    }));
    categories[0] = fallback;
    const fetcher = vi.fn(async (_path: string) => response(categories));
    const { wrapper } = await render(fetcher);
    expect(wrapper.get("tbody").findAll("tr")).toHaveLength(8);
    expect(wrapper.get("table").text()).toContain("默认分类");
    expect(wrapper.text()).not.toContain("删除分类");
    expect(wrapper.text()).not.toContain("父级分类");
    await button(wrapper, "下一页").trigger("click");
    expect(wrapper.get("tbody").findAll("tr")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(wrapper.get('a[href="/shop?tab=orders"]').text()).toBe("订单与发货");
  });
  it("creates a trimmed name and integer sort with no update version, then refreshes authoritative counts", async () => {
    let catalog = [fallback];
    const fetcher = vi.fn(async (_path: string, options: RequestInit = {}) => {
      if (options.method === "POST") {
        const saved = {
          ...gear,
          ...JSON.parse(String(options.body)),
          version: 0,
          productCount: 0,
        };
        catalog = [saved, fallback];
        return response(saved, 201);
      }
      return response(catalog);
    });
    const { wrapper } = await render(fetcher);
    await button(wrapper, "新分类").trigger("click");
    await wrapper.get('[name="categoryName"]').setValue(" 新装备 ");
    await wrapper.get('[name="categorySortOrder"]').setValue("12");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(writes(fetcher)).toHaveLength(1);
    expect(writes(fetcher)[0]![0]).toBe("/api/v1/admin/shop/categories");
    expect(JSON.parse(String(writes(fetcher)[0]![1].body))).toEqual({
      name: "新装备",
      sortOrder: 12,
    });
    expect(wrapper.get("table").text()).toContain("新装备");
    expect(wrapper.find("form").exists()).toBe(false);
  });
  it("edit keeps the original version when the list refreshes and includes a renamed default category", async () => {
    let latest = fallback;
    const fetcher = vi.fn(async (_path: string, options: RequestInit = {}) =>
      response(
        options.method === "PUT"
          ? { ...latest, ...JSON.parse(String(options.body)), version: 3 }
          : [latest],
      ),
    );
    const { wrapper } = await render(fetcher);
    await button(wrapper, "编辑分类").trigger("click");
    await wrapper.get('[name="categoryName"]').setValue("其他装备");
    latest = { ...fallback, version: 2 };
    await button(wrapper, "刷新分类").trigger("click");
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(writes(fetcher)[0]![0]).toBe(
      "/api/v1/admin/shop/categories/uncategorized",
    );
    expect(JSON.parse(String(writes(fetcher)[0]![1].body))).toEqual({
      name: "其他装备",
      sortOrder: 9999,
      version: 0,
    });
  });
  it("duplicate name preserves a correctable draft and does not turn into a version conflict", async () => {
    const fetcher = vi.fn(async (_path: string, options: RequestInit = {}) =>
      options.method === "POST"
        ? response({ code: "CATEGORY_NAME_EXISTS" }, 409)
        : response([fallback]),
    );
    const { wrapper } = await render(fetcher);
    await button(wrapper, "新分类").trigger("click");
    await wrapper.get('[name="categoryName"]').setValue("重复分类");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.text()).toContain("该分类名称已存在");
    expect(button(wrapper, "保存分类").attributes("disabled")).toBeUndefined();
    await wrapper.get('[name="categoryName"]').setValue("更正分类名");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(writes(fetcher)).toHaveLength(2);
    expect(JSON.parse(String(writes(fetcher)[1]![1].body)).name).toBe(
      "更正分类名",
    );
  });
  it("rejects control characters and invalid sorting before any category write", async () => {
    const fetcher = vi.fn(async (_path: string) => response([fallback]));
    const { wrapper } = await render(fetcher);
    await button(wrapper, "新分类").trigger("click");
    await wrapper.get('[name="categoryName"]').setValue("装备\u0085");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("不能包含控制字符");
    await wrapper.get('[name="categoryName"]').setValue("装备");
    await wrapper.get('[name="categorySortOrder"]').setValue("-1");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("排序须为 0–9999");
    expect(writes(fetcher)).toHaveLength(0);
  });
  it("version conflict retains the draft, cancellation and failed reload keep it locked, success adopts a fresh version", async () => {
    let reads = 0;
    const fetcher = vi.fn(async (_path: string, options: RequestInit = {}) => {
      if (options.method === "PUT")
        return response({ code: "STALE_VERSION" }, 409);
      reads++;
      return reads === 2
        ? response({ message: "读取断开" }, 503)
        : response([
            {
              ...fallback,
              name: reads >= 3 ? "服务器分类" : fallback.name,
              version: reads >= 3 ? 5 : 0,
            },
          ]);
    });
    const { wrapper } = await render(fetcher);
    await button(wrapper, "编辑分类").trigger("click");
    await wrapper.get('[name="categoryName"]').setValue("本地草稿");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(button(wrapper, "保存分类").attributes("disabled")).toBeDefined();
    await button(wrapper, "重新读取").trigger("click");
    await button(wrapper, "返回检查").trigger("click");
    expect(
      (wrapper.get('[name="categoryName"]').element as HTMLInputElement).value,
    ).toBe("本地草稿");
    await button(wrapper, "重新读取").trigger("click");
    await button(wrapper, "确认重新读取").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("读取断开");
    expect(button(wrapper, "保存分类").attributes("disabled")).toBeDefined();
    expect(
      (wrapper.get('[name="categoryName"]').element as HTMLInputElement).value,
    ).toBe("本地草稿");
    await button(wrapper, "重新读取").trigger("click");
    await button(wrapper, "确认重新读取").trigger("click");
    await flushPromises();
    expect(
      (wrapper.get('[name="categoryName"]').element as HTMLInputElement).value,
    ).toBe("服务器分类");
    expect(button(wrapper, "保存分类").attributes("disabled")).toBeUndefined();
    expect(writes(fetcher)).toHaveLength(1);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(String(writes(fetcher)[1]![1].body)).version).toBe(5);
    expect(
      fetcher.mock.calls.filter(([, options]) => !options?.method).at(-1)?.[1]
        ?.cache,
    ).toBe("no-store");
  });
  it.each(["network", "server"])(
    "uncertain %s creation locks duplicate writes and can return to the refreshed list for review",
    async (mode) => {
      let saved = false;
      const fetcher = vi.fn(
        async (_path: string, options: RequestInit = {}) => {
          if (options.method === "POST") {
            saved = true;
            if (mode === "network") throw Error("connection lost");
            return response({ message: "server timeout" }, 503);
          }
          return response(
            saved ? [{ ...gear, name: "待核对分类" }, fallback] : [fallback],
          );
        },
      );
      const { wrapper } = await render(fetcher);
      await button(wrapper, "新分类").trigger("click");
      await wrapper.get('[name="categoryName"]').setValue("待核对分类");
      await wrapper.get("form").trigger("submit");
      await flushPromises();
      expect(wrapper.text()).toContain("创建结果待核对");
      expect(button(wrapper, "保存分类").attributes("disabled")).toBeDefined();
      await wrapper.get("form").trigger("submit");
      expect(writes(fetcher)).toHaveLength(1);
      vi.spyOn(window, "confirm").mockReturnValue(true);
      await button(wrapper, "返回分类列表核对").trigger("click");
      await flushPromises();
      expect(wrapper.find("form").exists()).toBe(false);
      expect(wrapper.get("table").text()).toContain("待核对分类");
      expect(writes(fetcher)).toHaveLength(1);
    },
  );
  it("dirty navigation can be declined and identity replacement clears draft and pending response", async () => {
    let release!: (value: unknown) => void;
    const fetcher = vi.fn((_path: string, options: RequestInit = {}) =>
      options.method === "POST"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(
            response(currentUser.value?.id === "next" ? [] : [fallback]),
          ),
    );
    const { wrapper, router } = await render(fetcher);
    await button(wrapper, "新分类").trigger("click");
    await wrapper.get('[name="categoryName"]').setValue("保留草稿");
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await router.push("/shop?tab=orders");
    expect(router.currentRoute.value.path).toBe("/shop/categories");
    await wrapper.get("form").trigger("submit");
    acceptAuth({
      token: "next",
      user: { id: "next", nickname: "新管理员", role: "ADMIN" },
    });
    release(response({ ...gear, name: "保留草稿" }, 201));
    await flushPromises();
    expect(wrapper.text()).not.toContain("保留草稿");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find(".success-box").exists()).toBe(false);
    expect(currentUser.value?.id).toBe("next");
  });
});

describe("product category and original/current prices", () => {
  it("filters category locally, displays both prices, and only strikes a genuinely higher original price", async () => {
    const discounted = {
      ...product,
      id: "p2",
      categoryId: gear.id,
      categoryName: gear.name,
      name: "折扣装备",
      originalPriceCents: 24900,
    };
    const fetcher = vi.fn(async (path: string) =>
      readShop(path, [product, discounted]),
    );
    const { wrapper } = await render(fetcher, "/shop");
    expect(wrapper.findAll("del")).toHaveLength(1);
    expect(wrapper.get("del").text()).toBe("¥249.00");
    expect(wrapper.get("table").text()).toContain("原价 / 现价");
    const calls = fetcher.mock.calls.length;
    await button(wrapper, "筛选商品").trigger("click");
    await wrapper.get('[name="categoryFilter"]').setValue(gear.id);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("tbody").findAll("tr")).toHaveLength(1);
    expect(wrapper.get("table").text()).toContain(discounted.name);
    expect(wrapper.get("table").text()).not.toContain(product.name);
    expect(fetcher).toHaveBeenCalledTimes(calls);
  });
  it("sends category and two integer-cent prices while retaining product version and historical order totals", async () => {
    let catalog = product;
    const fetcher = vi.fn(async (path: string, options: RequestInit = {}) => {
      if (options.method === "PUT") {
        catalog = {
          ...catalog,
          ...JSON.parse(String(options.body)),
          categoryName: gear.name,
          version: 3,
        };
        return response(catalog);
      }
      return readShop(path, [catalog]);
    });
    const { wrapper } = await render(fetcher, "/shop");
    await button(wrapper, "编辑").trigger("click");
    await wrapper.get('[name="productCategory"]').setValue(gear.id);
    await wrapper.get('[name="originalPrice"]').setValue("249.99");
    await wrapper.get('[name="currentPrice"]').setValue("199.50");
    await wrapper.get('input[type="number"]').setValue("12");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get(".dialog").text()).toContain("徒步装备");
    expect(wrapper.get(".dialog").text()).toContain("原价 ¥249.99");
    expect(wrapper.get(".dialog").text()).toContain("现价 ¥199.50");
    await button(wrapper, "确认保存").trigger("click");
    await flushPromises();
    expect(JSON.parse(String(writes(fetcher)[0]![1].body))).toMatchObject({
      categoryId: "gear",
      originalPriceCents: 24999,
      priceCents: 19950,
      version: 2,
      stock: 12,
    });
    await button(wrapper, "订单与发货").trigger("click");
    await flushPromises();
    await button(wrapper, "查看").trigger("click");
    expect(
      wrapper.get('[aria-label="订单 historical-order"]').text(),
    ).toContain("¥199.00");
    expect(
      wrapper.get('[aria-label="订单 historical-order"]').text(),
    ).not.toContain("249.99");
    expect(writes(fetcher)).toHaveLength(1);
  });
  it("blocks invalid original/current prices and a missing category without any product mutation", async () => {
    const fetcher = vi.fn(async (path: string) => readShop(path));
    const { wrapper } = await render(fetcher, "/shop");
    await button(wrapper, "编辑").trigger("click");
    await wrapper.get('[name="originalPrice"]').setValue("100.00");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("原价不能低于现价");
    await wrapper.get('[name="originalPrice"]').setValue("199.001");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("请输入有效商品原价");
    await wrapper.get('[name="originalPrice"]').setValue("199.00");
    await wrapper.get('[name="productCategory"]').setValue("");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.text()).toContain("选择有效的商品分类");
    expect(writes(fetcher)).toHaveLength(0);
  });
  it("category failure leaves products/orders usable and offers editor retry without losing input", async () => {
    let fail = true;
    const fetcher = vi.fn(async (path: string) =>
      path.includes("/shop/categories") && fail
        ? response({ message: "分类网络断开" }, 503)
        : readShop(path),
    );
    const { wrapper } = await render(fetcher, "/shop");
    expect(wrapper.get("table").text()).toContain(product.name);
    await button(wrapper, "订单与发货").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(order.orderNo);
    await button(wrapper, "商品与库存").trigger("click");
    await flushPromises();
    await button(wrapper, "编辑").trigger("click");
    await wrapper.get("form input").setValue("保留新名称");
    expect(wrapper.text()).toContain("分类网络断开");
    expect(button(wrapper, "确认并保存").attributes("disabled")).toBeDefined();
    fail = false;
    await button(wrapper, "重新加载分类").trigger("click");
    await flushPromises();
    expect((wrapper.get("form input").element as HTMLInputElement).value).toBe(
      "保留新名称",
    );
    expect(
      button(wrapper, "确认并保存").attributes("disabled"),
    ).toBeUndefined();
    expect(writes(fetcher)).toHaveLength(0);
  });
});
