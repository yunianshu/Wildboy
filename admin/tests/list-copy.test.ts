import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { acceptAuth, clearSession } from "../src/api";
import ArticlesView from "../src/views/ArticlesView.vue";
import ActivitiesView from "../src/views/ActivitiesView.vue";

const source = {
  id: "source",
  title: "溪谷徒步",
  summary: "沿溪上山",
  status: "PUBLISHED",
  version: 4,
  coverUrl: "/assets/hero-hiking.jpg",
  isOfficial: true,
  category: "DOMESTIC",
  location: "溪谷",
  registeredCount: 8,
  capacity: 10,
  priceCents: 8000,
  startAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  endAt: new Date(Date.now() + 7 * 86400000 + 1800000).toISOString(),
  registrationDeadline: new Date(Date.now() + 6 * 86400000).toISOString(),
};
beforeEach(() => {
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
const response = (data: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});

async function list(path: string, copy: () => unknown) {
  const fetcher = vi.fn(async (url: string, _options?: RequestInit) =>
    url.endsWith("/copy")
      ? copy()
      : response({
          items: [source],
          total: 1,
          size: 8,
          page: 0,
          hasMore: false,
        }),
  );
  vi.stubGlobal("fetch", fetcher);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/activities", component: ActivitiesView },
      { path: "/articles", component: ArticlesView },
      { path: "/:pathMatch(.*)*", component: { template: "<div/>" } },
    ],
  });
  await router.push(path);
  const w = mount(
    { template: "<RouterView/>" },
    { global: { plugins: [router] }, attachTo: document.body },
  );
  await flushPromises();
  const writes = () =>
    fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
  const button = (label: string) =>
    w.findAll("button").find((b) => b.text() === label)!;
  return { w, router, writes, button };
}

it("opens and cancels an article copy without writing, then reopens the same draft after an uncertain save", async () => {
  const copy = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce(response({ id: "new-article", status: "DRAFT" }));
  const { w, router, writes, button } = await list("/articles", copy);
  await button("复制文章").trigger("click");
  expect(w.get<HTMLInputElement>("#copy-article-title").element.value).toBe(
    "溪谷徒步（副本）",
  );
  await button("取消").trigger("click");
  expect(writes()).toHaveLength(0);
  await button("复制文章").trigger("click");
  await w.get("#copy-article-title").setValue("春季溪谷回顾");
  await w.get("#copy-article-form").trigger("submit");
  await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain("保存结果待确认");
  await button("取消").trigger("click");
  await button("复制文章").trigger("click");
  expect(w.get<HTMLInputElement>("#copy-article-title").element.disabled).toBe(
    true,
  );
  await w.get("#copy-article-form").trigger("submit");
  await flushPromises();
  expect(writes()).toHaveLength(2);
  expect(writes()[0][0]).toMatch(/\/admin\/articles\/source\/copy$/);
  expect(writes()[0][1]?.body).toBe(writes()[1][1]?.body);
  expect(JSON.parse(String(writes()[1][1]?.body))).toMatchObject({
    title: "春季溪谷回顾",
    version: 4,
    requestId: expect.any(String),
  });
  expect(router.currentRoute.value.path).toBe("/articles/new-article/edit");
  w.unmount();
});

it("copies a published activity as a draft by default and opens its editor with list filters", async () => {
  const { w, router, writes, button } = await list(
    "/activities?category=DOMESTIC",
    () => response({ id: "new-trip", status: "DRAFT" }),
  );
  await button("复制活动").trigger("click");
  expect(
    w.get<HTMLInputElement>(".reopen-modal input[type=checkbox]").element
      .checked,
  ).toBe(false);
  expect(writes()).toHaveLength(0);
  await button("保存草稿并编辑").trigger("click");
  await flushPromises();
  expect(writes()).toHaveLength(1);
  expect(JSON.parse(String(writes()[0][1]?.body))).toMatchObject({
    publishImmediately: false,
    version: 4,
  });
  expect(router.currentRoute.value.path).toBe("/activities/new-trip/edit");
  expect(router.currentRoute.value.query.list).toBe(
    "/activities?category=DOMESTIC",
  );
  w.unmount();
});

it("opens only the chosen paid activity orders in a right drawer without routing away", async () => {
  const free = { ...source, id: "free", title: "免费同行活动", priceCents: 0 };
  const order = {
    id: "paid-order",
    orderNo: "ACT-ORDER-01",
    activityId: source.id,
    activityTitle: source.title,
    status: "PAID",
    partySize: 1,
    originalTotalCents: 8000,
    totalCents: 7500,
    currency: "CNY",
    version: 1,
  };
  const fetcher = vi.fn(async (url: string, _options?: RequestInit) => {
    if (url.includes("/admin/activities?"))
      return response({ items: [source, free], total: 21, page: 1, size: 8, hasMore: true });
    if (url.endsWith("/admin/activities/free")) return response(free);
    if (url.includes("/admin/activities/free/registrations?"))
      return response({ items: [], total: 0, page: 0, size: 20, hasMore: false });
    if (url.endsWith("/refund")) return response({});
    if (url.endsWith("/participants")) return response([]);
    return response({ items: [order], total: 21, page: 0, size: 20, hasMore: true });
  });
  vi.stubGlobal("fetch", fetcher);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/activities", component: ActivitiesView },
      { path: "/activity-orders", component: { template: "<h1>独立订单页</h1>" } },
      { path: "/activities/:id/registrations", component: { template: "<div/>" } },
    ],
  });
  await router.push("/activities?title=徒步&category=DOMESTIC&page=1");
  const w = mount({ template: "<RouterView/>" }, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
  try {
    await flushPromises();
    const before = router.currentRoute.value.fullPath;
    const rosterBtn = w.findAll("button").find((b) => b.text() === "名单")!;
    expect(rosterBtn.attributes("aria-haspopup")).toBe("dialog");
    await rosterBtn.trigger("click");
    await flushPromises();
    const rosterDrawer = w.get(".form-modal-right");
    expect(rosterDrawer.text()).toContain("报名名单 · 免费同行活动");
    expect(router.currentRoute.value.fullPath).toBe(before);
    await rosterDrawer.get('button[aria-label="关闭弹窗"]').trigger("click");
    await flushPromises();
    expect(w.find(".form-modal-right").exists()).toBe(false);
    const button = w.findAll("button").find((b) => b.text() === "订单")!;
    expect(w.find(".form-modal-right").exists()).toBe(false);
    await button.trigger("click");
    await flushPromises();
    const drawer = w.get(".form-modal-right");
    expect(drawer.attributes("role")).toBe("dialog");
    expect(drawer.text()).toContain("活动订单 · 溪谷徒步");
    expect(drawer.text()).toContain("ACT-ORDER-01");
    expect(drawer.text()).not.toContain("查看全部活动订单");
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("page=0&size=20&activityId=source");
    expect(router.currentRoute.value.fullPath).toBe(before);
    await drawer.get('[aria-label="订单状态"]').setValue("PAID");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("status=PAID&activityId=source");
    await drawer.findAll("button").find((b) => b.text() === "下一页")!.trigger("click");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("page=1&size=20&status=PAID&activityId=source");
    await drawer.findAll("button").find((b) => b.text() === "查看订单")!.trigger("click");
    await flushPromises();
    expect(w.findAll('[role="dialog"]')).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(w.findAll('[role="dialog"]')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(router.currentRoute.value.fullPath).toBe(before);
    expect(document.activeElement).toBe(button.element);
    expect(w.get<HTMLInputElement>('input[aria-label="活动名称"]').element.value).toBe("徒步");
    expect(fetcher.mock.calls.every(([, options]) => !options?.method)).toBe(true);
  } finally {
    w.unmount();
  }
});
