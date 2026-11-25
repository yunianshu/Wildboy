import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { acceptAuth, clearSession } from "../src/api";
import * as confirmation from "../src/confirm";
import HomeLayoutView from "../src/views/HomeLayoutView.vue";
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
  it("reorders featured activities, configures WeChat OA link and resizes footer brand image", async () => {
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
      if (url.endsWith("/admin/shop/products")) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: "pack", name: "轻量背包", status: "ON_SALE" },
            { id: "off-sale", name: "旧款背包", status: "OFF_SALE" },
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

    // Add act-3 and reorder featured activities
    const addBtn = w
      .findAll("button")
      .find((b) => b.text() === "加入首页排位")!;
    await addBtn.trigger("click");
    // Move second item ("路线A") forward to #1
    const moveFrontBtns = w
      .findAll("button")
      .filter((b) => b.text() === "前移");
    await moveFrontBtns[1]!.trigger("click");

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
    await w.get(".candidate-list button").trigger("click");

    // Switch to SHORTCUTS and set "野小子" to WECHAT_ARTICLE
    await w
      .findAll(".module-card")
      .find((c) => c.text().includes("快捷入口区"))!
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

    await w
      .findAll(".module-card")
      .find((c) => c.text().includes("装备横幅与商品"))!
      .trigger("click");
    const products = w.findAll(".product-pick-btn");
    expect(products.map((b) => b.text())).toEqual(["轻量背包"]);
    await products[0]!.trigger("click");

    // Switch to FOOTER and change brandWidthPx
    await w
      .findAll(".module-card")
      .find((c) => c.text().includes("底部关注码与底图"))!
      .trigger("click");
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
      "act-1",
      "act-2",
      "act-3",
      "act-later",
    ]);
    expect(saved.shortcuts.items[2].type).toBe("WECHAT_ARTICLE");
    expect(saved.shortcuts.items[1].popupImages).toEqual([]);
    expect(saved.shortcuts.items[2].wechatArticleUrl).toBe(
      "https://mp.weixin.qq.com/s?__biz=example&mid=123",
    );
    expect(saved.shop.featuredProductIds).toEqual(["pack"]);
    expect(saved.footer.brandWidthPx).toBe(300);
    expect(w.text()).toContain("首页自由装修配置已保存");
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
        return { ok: true, status: 200, json: async () => [] };
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

    // Switch to schedule tab, import navigation points and fill coordinates
    await w
      .findAll("button")
      .find((b) => b.text().includes("时间与地点"))!
      .trigger("click");
    await flushPromises();
    await w
      .findAll("button")
      .find((b) => b.text().includes("添加导航点"))!
      .trigger("click");
    const navDraft = w.get<HTMLInputElement>(
      'input[placeholder="如：岛内SM一期北门"]',
    );
    await navDraft.setValue("尚未提交的导航点");
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(navDraft.element.value).toBe("尚未提交的导航点");
    expect(
      fetch.mock.calls.filter(([url]) => url.endsWith("/act-old")),
    ).toHaveLength(1);
    await w
      .findAll(".nav-add-panel button")
      .find((b) => b.text() === "取消")!
      .trigger("click");
    await titleInput.setValue("往期山海徒步（更新版）");
    await w
      .findAll("button")
      .find((b) => b.text() === "从上方地点一键导入")!
      .trigger("click");
    await flushPromises();
    const coordInput = w.findAll(".coord-quick-input")[0]!;
    await coordInput.setValue("24.479834, 118.089425");
    await coordInput.trigger("change");

    await w.get("form").trigger("submit");
    await flushPromises();
    const putBody = JSON.parse(
      String(fetch.mock.calls.find((c) => c[1]?.method === "PUT")?.[1]?.body),
    );
    expect(putBody.title).toBe("往期山海徒步（更新版）");
    expect(putBody.navigationPoints[0]).toMatchObject({
      kind: "DESTINATION",
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
