import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import ArticlesView from "../src/views/ArticlesView.vue";
import { acceptAuth, clearSession } from "../src/api";
const base = {
  id: "article-1",
  title: "活动回顾",
  summary: "摘要",
  coverUrl: "/assets/cover.jpg",
  activityId: null,
  status: "DRAFT",
  isOfficial: false,
  version: 0,
};
let article: typeof base,
  content: { type: string; text: string }[],
  fetcher: ReturnType<typeof vi.fn>;
function button(w: VueWrapper, text: string) {
  return w.findAll("button").find((b) => b.text() === text)!;
}
beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
  article = { ...base };
  content = [{ type: "text", text: "回顾正文" }];
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fetcher = vi.fn(async (url: string, options: any = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    let data: any;
    if (url.includes("/admin/activities")) data = { items: [], hasMore: false };
    else if (url.endsWith("/content")) {
      if (options.method === "PUT") {
        content = body.blocks;
        article.version++;
      }
      data = { blocks: content, version: article.version };
    } else if (url.endsWith("/publish")) {
      article.status = "PUBLISHED";
      article.version++;
      data = { ...article };
    } else if (url.endsWith("/unpublish")) {
      article.status = "DRAFT";
      article.version++;
      data = { ...article };
    } else if (url.endsWith("/official")) {
      article.isOfficial = true;
      article.version++;
      data = { ...article };
    } else if (options.method) {
      article = { ...article, ...body, version: article.version + 1 };
      data = { ...article };
    } else if (url.includes("/articles?"))
      data = { items: [{ ...article }], hasMore: false };
    else data = { ...article };
    return { ok: true, status: 200, json: async () => data };
  });
  vi.stubGlobal("fetch", fetcher);
});
async function view() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: ArticlesView },
      { path: "/other", component: { template: "<div />" } },
    ],
  });
  await router.push("/");
  const w = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return w;
}
async function edit(w: VueWrapper) {
  await button(w, "查看 / 编辑").trigger("click");
  await flushPromises();
}
const writes = () => fetcher.mock.calls.filter((c: any) => c[1]?.method);
describe("article editor", () => {
  it("creates a draft before loading its structured content", async () => {
    const w = await view();
    await button(w, "新建文章").trigger("click");
    await flushPromises();
    expect(w.find(".rich-editor").exists()).toBe(false);
    await w.get('[aria-label="文章标题"]').setValue("新文章");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(writes()[0][1].method).toBe("POST");
    expect(JSON.parse(writes()[0][1].body).activityId).toBeNull();
    expect(w.find(".rich-editor").exists()).toBe(true);
    w.unmount();
  });
  it("blocks publication with unsaved content, synchronizes shared version on save", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="图文文字"]').setValue("更新正文");
    expect(button(w, "发布文章").attributes("disabled")).toBeDefined();
    await button(w, "保存图文").trigger("click");
    await flushPromises();
    await button(w, "发布文章").trigger("click");
    await flushPromises();
    const publish = fetcher.mock.calls.find((c: any) =>
      c[0].endsWith("/publish"),
    )!;
    expect(JSON.parse(publish[1].body)).toEqual({ version: 1 });
    expect(w.text()).toContain("已发布文章为只读");
    w.unmount();
  });
  it("blocks publishing unsaved metadata, then reloads content version after metadata save", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="文章标题"]').setValue("修改标题");
    expect(button(w, "发布文章").attributes("disabled")).toBeDefined();
    await w.get("form").trigger("submit");
    await flushPromises();
    await w.get('[aria-label="图文文字"]').setValue("再次编辑");
    await button(w, "保存图文").trigger("click");
    await flushPromises();
    const put = fetcher.mock.calls.find(
      (c: any) => c[0].endsWith("/content") && c[1]?.method === "PUT",
    )!;
    expect(JSON.parse(put[1].body).version).toBe(1);
    w.unmount();
  });
  it("saves content, closes, reopens current detail and publishes the latest version", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="图文文字"]').setValue("保存后关闭");
    await button(w, "保存图文").trigger("click");
    await flushPromises();
    await button(w, "关闭").trigger("click");
    await edit(w);
    await button(w, "发布文章").trigger("click");
    await flushPromises();
    const publish = fetcher.mock.calls.find((c: any) =>
      c[0].endsWith("/publish"),
    )!;
    expect(JSON.parse(publish[1].body).version).toBe(1);
    expect(
      fetcher.mock.calls.filter(
        (c: any) => c[0].endsWith("/articles/article-1") && !c[1]?.method,
      ),
    ).toHaveLength(2);
    w.unmount();
  });
  it("confirms designation replacement and allows only a published article", async () => {
    article.status = "PUBLISHED";
    const w = await view();
    await edit(w);
    vi.mocked(window.confirm).mockReturnValue(false);
    await button(w, "设为官方介绍").trigger("click");
    expect(writes()).toHaveLength(0);
    vi.mocked(window.confirm).mockReturnValue(true);
    await button(w, "设为官方介绍").trigger("click");
    await flushPromises();
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringContaining("替换"),
    );
    expect(button(w, "当前官方介绍").attributes("disabled")).toBeDefined();
    expect(writes()).toHaveLength(1);
    w.unmount();
  });
  it("does not discard dirty form on cancelled Close", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="文章标题"]').setValue("未保存");
    vi.mocked(window.confirm).mockReturnValue(false);
    await button(w, "关闭").trigger("click");
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    expect(writes()).toHaveLength(0);
    vi.mocked(window.confirm).mockReturnValue(true);
    await button(w, "关闭").trigger("click");
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    w.unmount();
  });
  it("honors cancelled navigation with dirty metadata and then allows confirmed departure", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="文章标题"]').setValue("未保存导航");
    const router = (w.vm as any).$router;
    vi.mocked(window.confirm).mockReturnValue(false);
    await router.push("/other");
    expect(router.currentRoute.value.path).toBe("/");
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    vi.mocked(window.confirm).mockReturnValue(true);
    await router.push("/other");
    expect(router.currentRoute.value.path).toBe("/other");
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    w.unmount();
  });
  it("asks once before leaving with unsaved rich content", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="图文文字"]').setValue("尚未保存的图文");
    vi.mocked(window.confirm).mockClear();
    await (w.vm as any).$router.push("/other");
    expect(window.confirm).toHaveBeenCalledTimes(1);
    w.unmount();
  });
  it("prevents repeated saves and ignores a late response after logout", async () => {
    const w = await view();
    await edit(w);
    await w.get('[aria-label="文章标题"]').setValue("延迟保存");
    let finish!: (value: any) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await w.get("form").trigger("submit");
    await w.get("form").trigger("submit");
    expect(writes()).toHaveLength(1);
    clearSession();
    await flushPromises();
    finish({
      ok: true,
      status: 200,
      json: async () => ({ ...article, title: "延迟保存", version: 1 }),
    });
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.find("tbody").exists()).toBe(false);
    w.unmount();
  });
  it("clears article data when the session ends", async () => {
    const w = await view();
    await edit(w);
    clearSession();
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.find("tbody").exists()).toBe(false);
    w.unmount();
  });
  it("shows version conflict without overwriting or auto-publishing", async () => {
    const w = await view();
    await edit(w);
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message: "文章版本冲突" }),
    });
    await button(w, "发布文章").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("文章版本或状态已变化");
    expect(writes()).toHaveLength(1);
    expect(button(w, "发布文章").exists()).toBe(true);
    w.unmount();
  });
});
