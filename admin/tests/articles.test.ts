import { readWechatClipboard } from "../src/wechatPaste";
import * as confirmation from "../src/confirm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Vditor 在 jsdom 中无法初始化，用可控替身验证组件协作。
const { VditorMock, vditorInstances } = vi.hoisted(() => {
  const vditorInstances: any[] = [];
  class VditorMock {
    options: any;
    value = "";
    readied = false;
    disabledCalls = 0;
    enabledCalls = 0;
    constructor(_el: HTMLElement, options: any) {
      this.options = options;
      this.value = options.value ?? "";
      vditorInstances.push(this);
    }
    setValue(v: string) {
      this.value = v;
    }
    getValue() {
      return this.value;
    }
    disabled() {
      this.disabledCalls++;
    }
    enable() {
      this.enabledCalls++;
    }
    destroy() {}
    fireInput() {
      this.options?.input?.(this.value);
    }
    ready() {
      if (this.readied) return;
      this.readied = true;
      this.options?.after?.();
    }
  }
  return { VditorMock, vditorInstances };
});
vi.mock("vditor", () => ({ default: VditorMock }));
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { defineComponent } from "vue";
import ArticleEditorView from "../src/views/ArticleEditorView.vue";
import MarkdownEditor from "../src/components/MarkdownEditor.vue";
import { acceptAuth, clearSession } from "../src/api";
// ConfirmDialog 真身 Teleport 到 body，单测内用内联替身验证确认/取消协作。
const ConfirmDialogStub = defineComponent({
  props: {
    title: { type: String, required: true },
    description: { type: String, required: true },
    confirmLabel: { type: String, required: true },
    busy: { type: Boolean, default: false },
    danger: { type: Boolean, default: false },
  },
  emits: ["confirm", "cancel"],
  template: `<div role="dialog"><h2>{{ title }}</h2><p>{{ description }}</p>
    <button :disabled="busy" @click="$emit('cancel')">返回检查</button>
    <button :disabled="busy" @click="$emit('confirm')">{{ confirmLabel }}</button></div>`,
});
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
  markdownText = "回顾正文",
  fetcher: ReturnType<typeof vi.fn>;
function button(w: VueWrapper, text: string) {
  return w.findAll("button").find((b) => b.text() === text)!;
}
beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  localStorage.clear();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
  article = { ...base };
  markdownText = "回顾正文";
  vditorInstances.length = 0;
  vi.spyOn(confirmation, "askConfirm").mockResolvedValue(true);
  fetcher = vi.fn(async (url: string, options: any = {}) => {
    const body = options.body ? JSON.parse(options.body) : null;
    let data: any;
    if (url.includes("/admin/activities")) data = { items: [], hasMore: false };
    else if (url.endsWith("/content")) {
      if (options.method === "PUT") {
        markdownText = body.markdown;
        article.version++;
      }
      data = { markdown: markdownText, version: article.version };
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
      const { markdown, ...fields } = body;
      if (markdown !== undefined) markdownText = markdown;
      article = { ...article, ...fields, version: article.version + 1 };
      data = { ...article };
    } else if (url.includes("/articles?"))
      data = { items: [{ ...article }], hasMore: false };
    else data = { ...article };
    return { ok: true, status: 200, json: async () => data };
  });
  vi.stubGlobal("fetch", fetcher);
});
async function view(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/articles", component: { template: "<div />" } },
      { path: "/articles/new", component: ArticleEditorView },
      { path: "/articles/:id/edit", component: ArticleEditorView },
      { path: "/other", component: { template: "<div />" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const w = mount(
    { template: "<RouterView />" },
    {
      global: {
        plugins: [router],
        stubs: { ConfirmDialog: ConfirmDialogStub },
      },
      // Teleport 目标按 selector 解析，需挂载到 document 才能找到
      attachTo: document.body,
    },
  );
  await flushPromises();
  return w;
}
function rich(w: VueWrapper) {
  return w.getComponent(MarkdownEditor);
}
async function loadRich(w: VueWrapper) {
  await flushPromises();
  expect(vditorInstances.length).toBeGreaterThan(0);
  vditorInstances.at(-1)!.ready();
  await flushPromises();
}
async function typeContent(w: VueWrapper, text: string) {
  const inst = vditorInstances.at(-1)!;
  inst.value = text;
  inst.fireInput();
  await flushPromises();
}
const writes = () => fetcher.mock.calls.filter((c: any) => c[1]?.method);
describe("article editor page", () => {
  it("writes title and body together when creating a draft", async () => {
    const w = await view("/articles/new");
    await loadRich(w);
    expect(w.text()).toContain("整理内容块");
    await typeContent(w, "## 新文章的正文");
    await w.get('[aria-label="文章标题"]').setValue("新文章");
    await button(w, "保存草稿").trigger("click");
    await flushPromises();
    expect(writes()[0][1].method).toBe("POST");
    expect(JSON.parse(writes()[0][1].body).activityId).toBeNull();
    expect(JSON.parse(writes()[0][1].body).markdown).toBe("## 新文章的正文");
    expect(w.vm.$route.path).toBe("/articles/article-1/edit");
    await loadRich(w);
    expect(vditorInstances.at(-1)!.value).toBe("## 新文章的正文");
    w.unmount();
  });
  it("refuses to save a draft without a title", async () => {
    const w = await view("/articles/new");
    await loadRich(w);
    await button(w, "保存草稿").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("请填写文章标题");
    expect(writes()).toHaveLength(0);
    w.unmount();
  });
  it("saves content before metadata with a shared version chain, then publishes", async () => {
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    await typeContent(w, "更新正文");
    await w.get('[aria-label="文章标题"]').setValue("修改标题");
    expect(button(w, "发布").attributes("disabled")).toBeDefined();
    await button(w, "保存").trigger("click");
    await flushPromises();
    expect(writes()[0][0].endsWith("/content")).toBe(true);
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      markdown: "更新正文",
      version: 0,
    });
    expect(writes()[1][0].endsWith("/articles/article-1")).toBe(true);
    expect(JSON.parse(writes()[1][1].body).version).toBe(1);
    await button(w, "发布").trigger("click");
    expect(w.text()).toContain("发布文章？");
    await button(w, "确认发布").trigger("click");
    await flushPromises();
    const publish = fetcher.mock.calls.find((c: any) =>
      c[0].endsWith("/publish"),
    )!;
    expect(JSON.parse(publish[1].body)).toEqual({ version: 2 });
    expect(w.text()).toContain("文章已发布，将在小程序探索页展示。");
    await typeContent(w, "发布后的首次更新");
    await button(w, "发布更新").trigger("click");
    await flushPromises();
    expect(JSON.parse(writes().at(-1)![1].body).version).toBe(3);
    expect(markdownText).toBe("发布后的首次更新");
    w.unmount();
  });
  it("edits a published article and releases metadata and body together", async () => {
    article.status = "PUBLISHED";
    article.isOfficial = true;
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    const title = w.get('[aria-label="文章标题"]');
    expect(title.attributes("disabled")).toBeUndefined();
    expect(vditorInstances.at(-1)!.disabledCalls).toBe(0);
    expect(button(w, "发布更新").attributes("disabled")).toBeDefined();
    await title.setValue("新版标题");
    await typeContent(w, "新版正文");
    expect(writes()).toHaveLength(0);
    expect(w.text()).toContain("修改待发布");
    await button(w, "发布更新").trigger("click");
    await flushPromises();
    expect(writes()).toHaveLength(1);
    expect(writes()[0][0]).toMatch(/\/admin\/articles\/article-1$/);
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      title: "新版标题",
      summary: "摘要",
      coverUrl: "/assets/cover.jpg",
      activityId: null,
      markdown: "新版正文",
      version: 0,
    });
    expect(article).toMatchObject({
      title: "新版标题",
      status: "PUBLISHED",
      isOfficial: true,
      version: 1,
    });
    expect(markdownText).toBe("新版正文");
    expect(w.text()).toContain("更新已发布");
    expect(button(w, "发布更新").attributes("disabled")).toBeDefined();
    await title.setValue("下架后的草稿标题");
    await typeContent(w, "尚未保存的正文");
    await button(w, "下架").trigger("click");
    await flushPromises();
    expect(writes()[1][0]).toMatch(/\/unpublish$/);
    expect(JSON.parse(writes()[1][1].body)).toEqual({ version: 1 });
    expect(article.status).toBe("DRAFT");
    expect(article.title).toBe("新版标题");
    expect(
      w.get<HTMLTextAreaElement>('[aria-label="文章标题"]').element.value,
    ).toBe("下架后的草稿标题");
    expect(vditorInstances.at(-1)!.value).toBe("尚未保存的正文");
    expect(w.text()).toContain("有未保存修改");
    w.unmount();
  });
  it("preserves unsaved edits when a published update has a version conflict", async () => {
    article.status = "PUBLISHED";
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    await w.get('[aria-label="文章标题"]').setValue("未发布标题");
    await typeContent(w, "未发布正文");
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message: "文章版本冲突" }),
    });
    await button(w, "发布更新").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("文章版本或状态已变化");
    expect(w.text()).toContain("修改待发布");
    expect(
      w.get<HTMLTextAreaElement>('[aria-label="文章标题"]').element.value,
    ).toBe("未发布标题");
    expect(vditorInstances.at(-1)!.value).toBe("未发布正文");
    expect(article).toMatchObject({
      title: base.title,
      status: "PUBLISHED",
      version: 0,
    });
    expect(markdownText).toBe("回顾正文");
    w.unmount();
  });
  it("confirms official designation and allows it only for published articles", async () => {
    const draft = await view("/articles/article-1/edit");
    await loadRich(draft);
    expect(button(draft, "设为官方介绍")).toBeUndefined();
    draft.unmount();
    article.status = "PUBLISHED";
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    await button(w, "设为官方介绍").trigger("click");
    expect(w.text()).toContain("原介绍保留在文章轮播");
    expect(w.text()).toContain(article.title);
    await button(w, "返回检查").trigger("click");
    expect(writes()).toHaveLength(0);
    await button(w, "设为官方介绍").trigger("click");
    await button(w, "确认设为官方介绍").trigger("click");
    await flushPromises();
    expect(button(w, "当前官方介绍").attributes("disabled")).toBeDefined();
    expect(writes()).toHaveLength(1);
    w.unmount();
  });
  it("asks once before leaving with unsaved content or metadata", async () => {
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    await typeContent(w, "尚未保存的图文");
    const router = (w.vm as any).$router;
    vi.mocked(confirmation.askConfirm).mockClear();
    vi.mocked(confirmation.askConfirm).mockResolvedValue(false);
    await router.push("/other");
    expect(confirmation.askConfirm).toHaveBeenCalledTimes(1);
    expect(router.currentRoute.value.path).toBe("/articles/article-1/edit");
    vi.mocked(confirmation.askConfirm).mockResolvedValue(true);
    await router.push("/other");
    expect(router.currentRoute.value.path).toBe("/other");
    w.unmount();
  });
  it("prevents repeated saves and ignores a late response after logout", async () => {
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    await w.get('[aria-label="文章标题"]').setValue("延迟保存");
    let finish!: (value: any) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const saveButton = button(w, "保存")!;
    await saveButton.trigger("click");
    // 保存中按钮文案变化，重复点击应被 saving 守卫拦截
    await button(w, "正在保存…")?.trigger("click");
    expect(writes()).toHaveLength(1);
    clearSession();
    await flushPromises();
    finish({
      ok: true,
      status: 200,
      json: async () => ({ ...article, title: "延迟保存", version: 1 }),
    });
    await flushPromises();
    expect(button(w, "正在保存…")).toBeUndefined();
    w.unmount();
  });
  it("clears article state when the session ends", async () => {
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    clearSession();
    await flushPromises();
    expect(w.find(".status-pill").exists()).toBe(false);
    expect(button(w, "发布")).toBeUndefined();
    w.unmount();
  });
  it("keeps one continuous editing flow with unique fields and a stable editor", async () => {
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    expect(w.find(".article-layout").exists()).toBe(true);
    expect(w.find(".article-steps").exists()).toBe(false);
    expect(w.find(".layout-switch").exists()).toBe(false);
    expect(w.findAll('[aria-label="文章标题"]')).toHaveLength(1);
    expect(w.findAll('[aria-label="文章摘要"]')).toHaveLength(1);
    await typeContent(w, "连续编辑不丢正文");
    expect(vditorInstances).toHaveLength(1);
    expect(Boolean(rich(w).vm.dirty)).toBe(true);
    expect(localStorage.getItem("wildboy-admin-article-layout")).toBeNull();
    w.unmount();
  });
  it("shows version conflict without overwriting or auto-publishing", async () => {
    const w = await view("/articles/article-1/edit");
    await loadRich(w);
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ message: "文章版本冲突" }),
    });
    await button(w, "发布").trigger("click");
    await button(w, "确认发布").trigger("click");
    await flushPromises();
    expect(w.text()).toContain("文章版本或状态已变化");
    expect(writes()).toHaveLength(1);
    expect(button(w, "发布").exists()).toBe(true);
    w.unmount();
  });
});

it("recognizes an image-only paste from the WeChat article photo CDN", () => {
  const html = '<img src="https://mmecoa.qpic.cn/photo/0">';
  const event = {
    clipboardData: {
      getData: (type: string) => (type === "text/html" ? html : ""),
    },
  } as ClipboardEvent;
  expect(readWechatClipboard(event)).toBe(html);
});
