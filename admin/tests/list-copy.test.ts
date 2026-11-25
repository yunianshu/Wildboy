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
