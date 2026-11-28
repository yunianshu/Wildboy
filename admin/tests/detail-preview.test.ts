import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { renderPreviewMarkdown } from "../src/previewMarkdown";
import { encodeWechatFence } from "../src/components/wechatFence";
import ActivityDetailPreview from "../src/components/ActivityDetailPreview.vue";
import ProductDetailPreview from "../src/components/ProductDetailPreview.vue";
import ActivitiesView from "../src/views/ActivitiesView.vue";
import ShopView from "../src/views/ShopView.vue";
import ProductContentView from "../src/views/ProductContentView.vue";
import EditorView from "../src/views/EditorView.vue";
import { acceptAuth, clearSession } from "../src/api";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("renderPreviewMarkdown", () => {
  it("renders headings, images, tables, wechat blocks and strips unsafe scripts", () => {
    const wechatEncoded = encodeWechatFence(
      '<p style="color: rgb(22, 122, 82);">公众号段落</p><script>alert(1)</script>',
    );
    const md = [
      "## 行程亮点",
      "",
      "含 **领队带队** 与 [说明](https://example.com/guide)",
      "",
      "![风景](https://example.com/view.jpg)",
      "",
      "| 时间 | 安排 |",
      "| --- | --- |",
      "| 08:00 | 集合出发 |",
      "",
      "```wechat",
      wechatEncoded,
      "```",
      "",
      '<img src=x onerror="alert(2)" />',
    ].join("\n");

    const html = renderPreviewMarkdown(md);
    expect(html).toContain("<h2>行程亮点</h2>");
    expect(html).toContain("<strong>领队带队</strong>");
    expect(html).toContain('href="https://example.com/guide"');
    expect(html).toContain('src="https://example.com/view.jpg"');
    expect(html).toContain("<table>");
    expect(html).toContain("集合出发");
    expect(html).toContain('class="wechat-prose"');
    expect(html).toContain("公众号段落");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});

describe("ActivityDetailPreview & ProductDetailPreview", () => {
  it("renders configured activity details and markdown without a separate boarding section", async () => {
    const wrapper = mount(ActivityDetailPreview, {
      props: {
        activity: {
          title: "武功山周末轻装线",
          category: "WEEKLY",
          coverUrl: "https://example.com/cover.jpg",
          galleryUrls: ["https://example.com/g1.jpg"],
          summary: "云海草甸两日轻装徒步",
          description: "兜底纯文本说明",
          location: "萍乡武功山",
          meetingPoint: "市民中心南广场",
          boardingPoints: ["地铁口 A", "体育馆北门"],
          navigationPoints: [
            {
              id: "dest",
              kind: "DESTINATION",
              label: "萍乡武功山",
              address: "萍乡市芦溪县武功山",
              latitude: 27.46,
              longitude: 114.17,
            },
          ],
          startAt: "2026-12-20T08:00",
          endAt: "2026-12-21T18:00",
          registrationDeadline: "2026-12-19T20:00",
          capacity: 24,
          priceCents: 29900,
          registeredCount: 6,
          status: "PUBLISHED",
        },
        markdown: "### 第一天\n- 集合上山",
      },
    });

    expect(wrapper.text()).toContain("武功山周末轻装线");
    expect(wrapper.text()).toContain("¥299.00 / 人");
    expect(wrapper.text()).toContain("共 24 位，已占 6 位");
    expect(wrapper.text()).toContain("打开地图导航");
    expect(wrapper.html()).toContain("<h3>第一天</h3>");
    expect(wrapper.text()).not.toContain("兜底纯文本说明");
    expect(wrapper.text()).toContain("立即报名");

    expect(wrapper.text()).toContain("集合位置");
    expect(wrapper.text()).not.toContain("查看上车点");
    expect(wrapper.text()).not.toContain("地铁口 A");
    expect(wrapper.text()).not.toContain("体育馆北门");
    await wrapper.setProps({ activity: {
      ...wrapper.props("activity"), startAt: "", endAt: "", registrationDeadline: "",
      location: "", meetingPoint: "", capacity: 0, priceCents: 0,
    } });
    expect(wrapper.findAll(".mp-fact-label").map((row) => row.text())).toEqual(["标准费用"]);
    expect(wrapper.text()).toContain("免费参与");
  });

  it("renders product details, strikethrough original price and interactive quantity stepper", async () => {
    const wrapper = mount(ProductDetailPreview, {
      props: {
        product: {
          name: "轻量防风冲锋衣",
          description: "防风防水透气",
          imageUrl: "https://example.com/jacket.jpg",
          priceCents: 39900,
          originalPriceCents: 59900,
          stock: 12,
          status: "ON_SALE",
        },
        markdown: "## 面料参数\n- 3L 压胶防水",
      },
    });

    expect(wrapper.text()).toContain("轻量防风冲锋衣");
    expect(wrapper.text()).toContain("¥399.00");
    expect(wrapper.text()).toContain("¥599.00");
    expect(wrapper.text()).toContain("库存 12 件");
    expect(wrapper.html()).toContain("<h2>面料参数</h2>");
    expect(wrapper.get(".mp-total-amount").text()).toBe("¥399.00");

    await wrapper.get('button[aria-label="增加购买数量"]').trigger("click");
    expect(wrapper.get(".mp-total-amount").text()).toBe("¥798.00");
  });
});

describe("Admin views miniprogram detail preview integration", () => {
  beforeEach(() => {
    acceptAuth({
      token: "test-token",
      user: {
        id: "admin-1",
        nickname: "管理员",
        role: "ADMIN",
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearSession();
  });

  it("opens activity detail preview drawer from ActivitiesView and loads markdown", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/admin/activities/act-1/content/markdown")) {
        return Promise.resolve(
          jsonResponse({ markdown: "## 活动行程\n准时出发", version: 2 }),
        );
      }
      if (url.includes("/admin/activities")) {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: "act-1",
                title: "莫干山徒步",
                category: "WEEKLY",
                coverUrl: "https://example.com/m.jpg",
                galleryUrls: [],
                summary: "竹林古道",
                description: "纯文本描述",
                location: "德清莫干山",
                meetingPoint: "武林广场",
                boardingPoints: [],
                navigationPoints: [],
                startAt: "2026-12-28T08:00:00+08:00",
                endAt: "2026-12-28T18:00:00+08:00",
                registrationDeadline: "2026-12-27T20:00:00+08:00",
                capacity: 30,
                priceCents: 12800,
                registeredCount: 4,
                status: "PUBLISHED",
                currency: "CNY",
                version: 1,
                createdAt: "2026-11-01T00:00:00Z",
                updatedAt: "2026-11-01T00:00:00Z",
              },
            ],
            total: 1,
            page: 0,
            size: 8,
            hasMore: false,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/activities", component: ActivitiesView },
        { path: "/activities/:id/edit", component: { template: "<div />" } },
      ],
    });
    await router.push("/activities");
    await router.isReady();

    const wrapper = mount(ActivitiesView, { global: { plugins: [router] } });
    await flushPromises();

    const previewBtn = wrapper
      .findAll("button")
      .find((b) => b.text() === "预览");
    expect(previewBtn).toBeTruthy();
    await previewBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("小程序详情预览 · 莫干山徒步");
    expect(wrapper.text()).toContain("活动行程");
    expect(wrapper.text()).toContain("德清莫干山");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/activities/act-1/content/markdown"),
      expect.anything(),
    );
  });

  it("opens live activity detail preview from EditorView reflecting unsaved edits", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}));
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/activities/new", component: EditorView },
        { path: "/activities", component: { template: "<div />" } },
      ],
    });
    await router.push("/activities/new");
    await router.isReady();

    const wrapper = mount(EditorView, { global: { plugins: [router] } });
    await flushPromises();

    await wrapper.get('input[placeholder="活动名称"]').setValue("未保存草稿活动");
    const previewBtn = wrapper
      .findAll("button")
      .find((b) => b.text().includes("小程序详情预览"));
    expect(previewBtn).toBeTruthy();
    await previewBtn!.trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("小程序详情预览 · 未保存草稿活动");
    expect(wrapper.text()).toContain("草稿 · 发布后可报名");
  });

  it("opens product detail preview drawer from ShopView and ProductContentView", async () => {
    const product = {
      id: "prod-1",
      name: "轻量碳素登山杖",
      description: "双支装可折叠",
      imageUrl: "https://example.com/pole.jpg",
      categoryId: "cat-1",
      categoryName: "徒步装备",
      priceCents: 18900,
      originalPriceCents: 24900,
      stock: 15,
      status: "ON_SALE" as const,
      version: 1,
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/admin/shop/products/prod-1/content/markdown")) {
        return Promise.resolve(
          jsonResponse({ markdown: "## 装备亮点\n碳纤维杆身", version: 1 }),
        );
      }
      if (url.includes("/admin/shop/products/prod-1")) {
        return Promise.resolve(jsonResponse(product));
      }
      if (url.includes("/admin/shop/categories")) {
        return Promise.resolve(
          jsonResponse([{ id: "cat-1", name: "徒步装备", sortOrder: 1, version: 1 }]),
        );
      }
      if (url.includes("/admin/shop/products")) {
        return Promise.resolve(jsonResponse([product]));
      }
      if (url.includes("/admin/orders")) {
        return Promise.resolve(
          jsonResponse({ items: [], total: 0, page: 0, size: 20, hasMore: false }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/shop", component: ShopView },
        { path: "/shop/products/:id/content", component: ProductContentView },
      ],
    });
    await router.push("/shop");
    await router.isReady();

    const shopWrapper = mount(ShopView, { global: { plugins: [router] } });
    await flushPromises();

    const shopPreviewBtn = shopWrapper
      .findAll("button")
      .find((b) => b.text() === "预览");
    expect(shopPreviewBtn).toBeTruthy();
    await shopPreviewBtn!.trigger("click");
    await flushPromises();

    expect(shopWrapper.text()).toContain("小程序详情预览 · 轻量碳素登山杖");
    expect(shopWrapper.text()).toContain("装备亮点");
    expect(shopWrapper.text()).toContain("¥189.00");
    shopWrapper.unmount();

    await router.push("/shop/products/prod-1/content");
    await router.isReady();
    const contentWrapper = mount(ProductContentView, {
      global: {
        plugins: [router],
        stubs: { MarkdownEditor: true },
      },
    });
    await flushPromises();

    const nameInput = contentWrapper.get("#shop-product-form input");
    await nameInput.setValue("轻量碳素登山杖 Pro");
    const editPreviewBtn = contentWrapper
      .findAll("button")
      .find((b) => b.text().includes("小程序详情预览"));
    expect(editPreviewBtn).toBeTruthy();
    await editPreviewBtn!.trigger("click");
    await flushPromises();

    expect(contentWrapper.text()).toContain("小程序详情预览 · 轻量碳素登山杖 Pro");
    expect(contentWrapper.text()).toContain("装备亮点");
  });
});
