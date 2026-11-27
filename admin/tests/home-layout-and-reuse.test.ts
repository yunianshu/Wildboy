import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { acceptAuth, clearSession } from "../src/api";
import * as confirmation from "../src/confirm";
import HomeLayoutView from "../src/views/HomeLayoutView.vue";
import defaultBrandPreview from "../src/assets/platform-brand-original-transparent.png";
import EditorView from "../src/views/EditorView.vue";

const sampleLayout = () => ({
  version: 2,
  modules: [
    { id: "HERO", enabled: true },
    { id: "SHORTCUTS", enabled: true },
    { id: "ACTIVITIES", enabled: true },
    { id: "SHOP", enabled: true },
    { id: "GALLERY", enabled: true },
    { id: "FOOTER", enabled: true },
  ],
  hero: {
    imageUrl: "/assets/hero-hiking.jpg",
    brandName: "野小子",
    brandCaption: "野一点，自由一点",
    kicker: "WILDBOY / OUTDOOR CLUB",
    title: "去山野，找回自己。",
    subtitle: "把日常留在身后 · 一起走出去",
    action: {
      type: "NONE",
      page: "",
      activityId: "",
      articleId: "",
      wechatArticleUrl: "",
      popupTitle: "",
      popupText: "",
      popupImages: [],
    },
  },
  shortcuts: {
    columns: 4,
    items: [
      {
        id: "slot-1",
        name: "本周活动",
        icon: "WEEKLY",
        imageUrl: "",
        type: "PAGE",
        page: "WEEKLY",
        activityId: "",
        articleId: "",
        wechatArticleUrl: "",
        popupTitle: "",
        popupText: "",
        popupImageUrl: "",
        popupImages: [],
      },
      {
        id: "slot-2",
        name: "二维码",
        icon: "QRCODE",
        imageUrl: "",
        type: "POPUP",
        page: "",
        activityId: "",
        articleId: "",
        wechatArticleUrl: "",
        popupTitle: "扫码加群",
        popupText: "",
        popupImageUrl: "/assets/equipment.jpg",
        popupImages: [
          { url: "/assets/equipment.jpg", label: "客服微信" },
          { url: "/assets/hero-hiking.jpg", label: "活动交流群" },
        ],
      },
      {
        id: "slot-3",
        name: "野小子",
        icon: "INTRO",
        imageUrl: "",
        type: "ARTICLE",
        page: "",
        activityId: "",
        articleId: "OFFICIAL",
        wechatArticleUrl: "",
        popupTitle: "",
        popupText: "",
        popupImageUrl: "",
        popupImages: [],
      },
    ],
  },
  activities: {
    eyebrow: "FIND YOUR NEXT ADVENTURE",
    title: "正在发生的山野",
    showAllLink: true,
    maxCount: 6,
    autoFill: true,
    featuredActivityIds: ["act-2", "act-1"],
  },
  shop: {
    showBanner: true,
    bannerImageUrl: "/assets/equipment-banner.jpg",
    bannerTag: "山野好物",
    bannerTitle: "把山野装进行囊",
    bannerCta: "去逛逛",
    showProducts: true,
    maxCount: 4,
    autoFill: true,
    featuredProductIds: [],
  },
  gallery: {
    eyebrow: "MOMENTS OUTSIDE",
    title: "山野之间",
    mode: "AUTO_ARTICLES",
    slides: [],
  },
  footer: {
    followEnabled: true,
    followTitle: "关注野小子公众号",
    followSubtitle: "长按识别二维码",
    followQrcodes: [{ url: "/assets/equipment.jpg", label: "官方公众号" }],
    brandEnabled: true,
    brandImageUrl: "/assets/platform-brand-original-transparent.png",
    brandWidthPx: 216,
  },
});

beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  acceptAuth({
    token: "admin-token",
    user: { id: "admin-1", nickname: "主理人", role: "ADMIN" },
  });
  vi.spyOn(confirmation, "askConfirm").mockResolvedValue(true);
});

describe("HomeLayoutView modular workbench", () => {
  it("swaps featured activity and product ranks, previews their cards, and saves the layout", async () => {
    const fetch = vi.fn(async (url: string, opts: any = {}) => {
      if (url.includes("/admin/home/layout")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            opts.method === "PUT"
              ? { ...JSON.parse(opts.body), version: 3 }
              : sampleLayout(),
        };
      }
      if (url.endsWith("/admin/home/activity-suggestions")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "act-auto",
              title: "海岸晨行",
              location: "东山岛",
              status: "PUBLISHED",
              category: "WEEKLY",
              coverUrl: "/uploads/coast.jpg",
              startAt: "2027-01-02T08:00:00+08:00",
              priceCents: 0,
            },
          ],
        };
      }
      if (url.endsWith("/admin/shop/products")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              id: "pack",
              name: "轻量背包",
              imageUrl: "/uploads/pack.jpg",
              priceCents: 9900,
              status: "ON_SALE",
            },
            {
              id: "pole",
              name: "登山杖",
              imageUrl: "/uploads/pole.jpg",
              priceCents: 6900,
              status: "ON_SALE",
            },
            {
              id: "lamp",
              name: "头灯",
              imageUrl: "/uploads/lamp.jpg",
              priceCents: 4900,
              status: "ON_SALE",
            },
            { id: "off-sale", name: "旧款背包", status: "OFF_SHELF" },
          ],
        };
      }
      if (url.includes("/admin/activities?")) {
        const query = new URL(url, "http://localhost").searchParams;
        if (query.get("keyword") === "武夷山" || query.get("page") === "1") {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [
                { id: "act-later", title: "远足新路线", location: "武夷山" },
              ],
              total: query.has("keyword") ? 1 : 51,
              page: Number(query.get("page")),
              size: 50,
              hasMore: false,
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "act-1",
                title: "路线A",
                location: "厦门",
                coverUrl: "/assets/category-weekly.jpg",
                status: "PUBLISHED",
              },
              {
                id: "act-2",
                title: "路线B",
                location: "泉州",
                coverUrl: "/assets/category-domestic.jpg",
                status: "PUBLISHED",
              },
              {
                id: "act-3",
                title: "路线C",
                location: "漳州",
                coverUrl: "/assets/category-holiday.jpg",
                status: "PUBLISHED",
              },
            ],
            total: 51,
            page: 0,
            size: 50,
            hasMore: true,
          }),
        };
      }
      if (url.includes("/admin/articles?")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [
              {
                id: "12345678-1234-1234-1234-123456789abc",
                title: "运营版关于小子",
                status: "PUBLISHED",
              },
              { id: "draft", title: "不能选的草稿", status: "DRAFT" },
            ],
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ items: [] }) };
    });
    vi.stubGlobal("fetch", fetch);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/home-layout", component: HomeLayoutView }],
    });
    await router.push("/home-layout?section=ACTIVITIES");
    await router.isReady();

    const w = mount(HomeLayoutView, {
      global: { plugins: [router] },
    });
    await flushPromises();

    expect(w.get("h1").text()).toBe("小程序首页配置");
    expect(w.get(".editor-panel h2").text()).toBe("首页精选活动");
    // Verify 6 slots are shown on the left (2 filled + 4 empty) and rich cards on the right
    expect(w.findAll(".activity-empty-slot").length).toBe(4);
    expect(w.findAll(".candidate-card-btn img").length).toBeGreaterThan(0);
    // Add act-3 into the next empty slot and reorder featured activities
    const addBtn = w.get(".candidate-list .candidate-card-btn");
    await addBtn.trigger("click");
    expect(w.findAll(".activity-empty-slot").length).toBe(3);
    // Move second item ("路线A") forward to #1
    const moveFrontBtns = w
      .findAll("button")
      .filter((b) => b.text() === "前移");
    await moveFrontBtns[1]!.trigger("click");

    const activityCards = () =>
      w.findAll(".featured-activities .featured-rank-card");
    const activityTitles = () =>
      activityCards().map((card) => card.get("strong").text());
    expect(activityTitles()).toEqual(["路线A", "路线B", "路线C"]);
    const cards = activityCards();
    const dataTransfer = { setData: vi.fn() };
    expect(cards[0]!.attributes("draggable")).toBe("true");
    await cards[0]!.trigger("dragstart", { dataTransfer });
    await cards[2]!.trigger("dragover", { dataTransfer });
    await cards[2]!.trigger("drop", { dataTransfer });
    await cards[0]!.trigger("dragend", { dataTransfer });
    expect(activityTitles()).toEqual(["路线C", "路线B", "路线A"]);
    // An unrelated drop after a cancelled drag must not reuse its source.
    await cards[1]!.trigger("dragstart", { dataTransfer });
    await cards[1]!.trigger("dragend", { dataTransfer });
    await cards[2]!.trigger("drop", { dataTransfer });
    expect(activityTitles()).toEqual(["路线C", "路线B", "路线A"]);
    const activityPreview = w.findAll(".pv-activity-card");
    expect(activityPreview.slice(0, 3).map((card) => card.text())).toEqual([
      expect.stringMatching(/路线C.*漳州/),
      expect.stringMatching(/路线B.*泉州/),
      expect.stringMatching(/路线A.*厦门/),
    ]);
    expect(
      activityPreview
        .slice(0, 3)
        .map((card) => card.get("img").attributes("src")),
    ).toEqual([
      "/assets/category-holiday.jpg",
      "/assets/category-domestic.jpg",
      "/assets/category-weekly.jpg",
    ]);

    await w
      .findAll("button")
      .find((b) => b.text() === "下一页")!
      .trigger("click");
    await flushPromises();
    expect(w.get(".candidate-list").text()).toContain("远足新路线");
    await w.get('input[type="search"]').setValue("武夷山");
    await vi.waitFor(() => {
      expect(w.get(".candidate-list").text()).toContain("远足新路线");
      expect(
        fetch.mock.calls.some(([url]) => url.includes("keyword=%E6%AD%A6")),
      ).toBe(true);
    });
    expect(
      w.findAll(".pv-activity-card strong").map((item) => item.text()),
    ).toEqual(["路线C", "路线B", "路线A", "海岸晨行"]);
    await w.get(".candidate-list button").trigger("click");

    // Switch to SHORTCUTS and set "野小子" to WECHAT_ARTICLE
    await w
      .findAll(".module-select")
      .find((button) => button.text().includes("快捷入口区"))!
      .trigger("click");
    const chips = w.findAll(".shortcut-chip");
    await chips[1]!.trigger("click");
    for (let remaining = 2; remaining > 0; remaining--) {
      await w
        .findAll(".qr-card-actions button")
        .find((button) => button.text() === "删除")!
        .trigger("click");
    }
    await chips[2]!.trigger("click");
    const actionSelect = w.findAll("select")[2]!;
    await actionSelect.setValue("WECHAT_ARTICLE");
    await w
      .get('input[placeholder="https://mp.weixin.qq.com/s/..."]')
      .setValue("https://mp.weixin.qq.com/s?__biz=example&mid=123");
    const intro = w.get('select[aria-label="小程序介绍正文"]');
    expect(intro.text()).not.toContain("不能选的草稿");
    await intro.setValue("12345678-1234-1234-1234-123456789abc");

    await w
      .findAll(".module-card")
      .find((c) => c.text().includes("装备横幅与商品"))!
      .trigger("click");
    const products = w.findAll(".product-pick-btn");
    expect(products.map((button) => button.text())).toEqual([
      expect.stringContaining("轻量背包"),
      expect.stringContaining("登山杖"),
      expect.stringContaining("头灯"),
    ]);
    for (const product of products) await product.trigger("click");
    const productCards = () =>
      w.findAll(".featured-products .featured-rank-card");
    const rankedProducts = productCards();
    expect(rankedProducts).toHaveLength(3);
    expect(rankedProducts[0]!.attributes("draggable")).toBe("true");
    await rankedProducts[0]!.trigger("dragstart", { dataTransfer });
    await rankedProducts[2]!.trigger("dragover", { dataTransfer });
    await rankedProducts[2]!.trigger("drop", { dataTransfer });
    await rankedProducts[0]!.trigger("dragend", { dataTransfer });
    const rankedNames = ["头灯", "登山杖", "轻量背包"];
    expect(productCards().map((card) => card.get("strong").text())).toEqual(
      rankedNames,
    );
    const productPreview = w.findAll(".pv-product-card");
    expect(productPreview.map((card) => card.text())).toEqual(
      rankedNames.map((name) => expect.stringContaining(name)),
    );
    expect(
      productPreview.map((card) => card.get("img").attributes("src")),
    ).toEqual(["/uploads/lamp.jpg", "/uploads/pole.jpg", "/uploads/pack.jpg"]);

    // Switch to FOOTER and change brandWidthPx
    await w
      .findAll(".module-card")
      .find((c) => c.text().includes("底部关注码与底图"))!
      .trigger("click");
    expect(w.get('img[alt="野小子底图预览"]').attributes("src")).toBe(
      defaultBrandPreview,
    );
    expect(w.get(".pv-brand-wrap img").attributes("src")).toBe(
      defaultBrandPreview,
    );
    await w.get("input.px-number").setValue("300");

    // Save layout
    await w
      .findAll("button")
      .find((b) => b.text().includes("保存首页配置"))!
      .trigger("click");
    await flushPromises();

    const putCall = fetch.mock.calls.find((c) => c[1]?.method === "PUT")!;
    const saved = JSON.parse(putCall[1].body);
    expect(saved.activities.featuredActivityIds).toEqual([
      "act-3",
      "act-2",
      "act-1",
      "act-later",
    ]);
    expect(saved.shortcuts.items[2].type).toBe("WECHAT_ARTICLE");
    expect(saved.shortcuts.items[2].articleId).toBe(
      "12345678-1234-1234-1234-123456789abc",
    );
    expect(saved.shortcuts.items[1].popupImages).toEqual([]);
    expect(saved.shortcuts.items[2].wechatArticleUrl).toBe(
      "https://mp.weixin.qq.com/s?__biz=example&mid=123",
    );
    expect(saved.shop.featuredProductIds).toEqual(["lamp", "pole", "pack"]);
    expect(saved.footer.brandWidthPx).toBe(300);
    expect(saved.footer.brandImageUrl).toBe(
      "/assets/platform-brand-original-transparent.png",
    );
    expect(w.text()).toContain("首页配置已保存");
    w.unmount();
  });
});

describe("Anytime activity editing, navigation points and reopen modal", () => {
  it("allows editing cancelled activities, adding navigation points, and reopening for a new date", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const cancelledAct = {
      id: "act-old",
      title: "往期山海徒步",
      category: "WEEKLY",
      coverUrl: "/assets/category-weekly.jpg",
      galleryUrls: [],
      summary: "已结束或取消的活动仍可随时编辑",
      description: "路线详情说明",
      location: "厦门东坪山",
      meetingPoint: "东坪山地铁口",
      boardingPoints: [],
      navigationPoints: [],
      startAt: "2026-06-01T09:00:00+08:00",
      endAt: "2026-06-01T16:00:00+08:00",
      registrationDeadline: "2026-05-31T18:00:00+08:00",
      capacity: 25,
      priceCents: 6800,
      registeredCount: 0,
      status: "CANCELLED",
      currency: "CNY",
      version: 4,
      createdAt: "2026-05-01T00:00:00Z",
      updatedAt: "2026-05-01T00:00:00Z",
    };

    let copyAttempts = 0;
    const fetch = vi.fn(async (url: string, opts: any = {}) => {
      if (url.endsWith("/activity-boarding-points")) {
        return { ok: true, status: 200, json: async () => [] };
      }
      if (url.endsWith("/activity-boarding-point-locations")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            {
              name: "东门",
              address: "东门",
              latitude: 24.479834,
              longitude: 118.089425,
            },
          ],
        };
      }
      if (url.endsWith("/copy")) {
        if (++copyAttempts === 1) throw new Error("响应连接中断");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...cancelledAct,
            id: "act-new-round",
            status: "PUBLISHED",
            version: 1,
          }),
        };
      }
      if (opts.method === "PUT") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...cancelledAct,
            ...JSON.parse(opts.body),
            version: 5,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => cancelledAct };
    });
    vi.stubGlobal("fetch", fetch);

    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/activities/:id/edit", component: EditorView },
        { path: "/activities", component: { template: "<div>LIST</div>" } },
      ],
    });
    await router.push("/activities/act-old/edit");
    await router.isReady();

    const w = mount(EditorView, {
      global: { plugins: [router], stubs: { teleport: true } },
    });
    await flushPromises();

    // Cancelled activity is NOT disabled anymore!
    const titleInput = w.get('input[placeholder="活动名称"]');
    expect(titleInput.attributes("disabled")).toBeUndefined();

    await w
      .get(".activity-section-nav")
      .findAll("button")
      .find((button) => button.text() === "时间与地点")!
      .trigger("click");
    await flushPromises();
    const stop = w.get<HTMLInputElement>(".point-choice input");
    await stop.setValue(true);
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(stop.element.checked).toBe(true);
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith("/act-old")),
    ).toHaveLength(1);
    await titleInput.setValue("往期山海徒步（更新版）");

    await w.get("form").trigger("submit");
    await flushPromises();
    const putBody = JSON.parse(
      String(fetch.mock.calls.find((c) => c[1]?.method === "PUT")?.[1]?.body),
    );
    expect(putBody.title).toBe("往期山海徒步（更新版）");
    expect(putBody.navigationPoints[0]).toMatchObject({
      kind: "BOARDING",
      latitude: 24.479834,
      longitude: 118.089425,
    });

    // Open one-click reopen modal and create new round
    await w
      .findAll("button")
      .find((b) => b.text() === "换时间重开一期")!
      .trigger("click");
    await w.get(".reopen-modal input[type='checkbox']").setValue(true);
    await w.get("#reopen-start-at-time").setValue("14:30");
    vi.spyOn(Date, "now").mockReturnValueOnce(Date.now() + 1000);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(w.get<HTMLInputElement>("#reopen-start-at-time").element.value).toBe(
      "14:30",
    );
    expect(
      w.get<HTMLInputElement>(".reopen-modal input[type='checkbox']").element
        .checked,
    ).toBe(true);
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith("/act-old")),
    ).toHaveLength(2);
    const submitCopy = () =>
      w
        .findAll("button")
        .find((b) => b.text().includes("重开并立即发布"))!
        .trigger("click");
    await submitCopy();
    await flushPromises();
    expect(w.text()).toContain("响应连接中断");
    await submitCopy();
    await flushPromises();
    const submissions = fetch.mock.calls
      .filter(([url]) => url.endsWith("/copy"))
      .map(([, opts]) => JSON.parse(opts.body));
    expect(submissions).toHaveLength(2);
    expect(submissions[0].requestId).toBeTruthy();
    expect(submissions[1]).toEqual(submissions[0]);
    w.unmount();
  });
});


it("manages generic top/bottom footer blocks, supports 1-3 columns, drag swap, and column splitter push", async () => {
  const layout = sampleLayout();
  layout.footer.followQrcodes.push({ url: "/assets/video.jpg", label: "视频号" });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => url.includes("/admin/home/layout")
      ? layout
      : url.endsWith("/admin/shop/products") ? [] : { items: [], hasMore: false },
  })));
  const w = mount(HomeLayoutView, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  const footer = w.get(".pv-footer");
  const order = () => footer.findAll(".pv-footer-cell").map((item) => item.attributes("data-cell"));
  expect(order()).toEqual(["brand", "qr-1", "text", "qr-2"]);
  await footer.trigger("click");

  // Drag qr-2 (pos 3) onto pos 0 (brand) to swap them
  const slots = () => w.findAll(".footer-slot-card");
  await slots()[3]!.trigger("dragstart");
  await slots()[0]!.trigger("drop");
  expect(order()).toEqual(["qr-2", "qr-1", "text", "brand"]);

  // Switch to 3 columns, push column splitter, and add a new generic block
  await w.get('button[data-footer-cols="3"]').trigger("click");
  expect(w.findAll(".footer-splitter")).toHaveLength(2);
  await w.get('button[data-footer-splitter="col-0"]').trigger("keydown.left");
  expect(footer.attributes("style")).toContain("28fr");

  await w.get("button[data-footer-add]").trigger("click");
  expect(w.findAll(".footer-slot-card")).toHaveLength(5);
  await w.get('button[data-footer-top-type="TEXT"]').trigger("click");
  await w.get('.footer-part-card input[placeholder="输入标题或说明文字"]').setValue("山野热线");
  expect(footer.text()).toContain("山野热线");

  // Delete the added block
  await w.get("button[data-footer-delete]").trigger("click");
  expect(w.findAll(".footer-slot-card")).toHaveLength(4);
  expect(footer.text()).not.toContain("山野热线");

  // Disable all remaining blocks -> preview footer hides completely
  for (let i = 0; i < 4; i++) {
    await w.findAll(".footer-slot-card")[i]!.trigger("click");
    await w.get('input[data-footer-toggle="block"]').setValue(false);
  }
  expect(w.find(".pv-footer").exists()).toBe(false);
  w.unmount();
});
