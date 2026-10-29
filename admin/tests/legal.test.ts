import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import LegalView from "../src/views/LegalView.vue";
import { currentUser, clearSession } from "../src/api";
let draft = {
  title: "测试隐私政策",
  content: "这是用于自动化测试的协议草稿正文。",
  revision: 2,
};
let versions: any[] = [];
function fetcher(conflict = false) {
  return vi.fn(async (path: string, opts: any = {}) => {
    if (path.endsWith("/versions"))
      return { ok: true, status: 200, json: async () => versions };
    if (opts.method === "PUT") {
      if (conflict)
        return {
          ok: false,
          status: 409,
          json: async () => ({ code: "STALE_VERSION" }),
        };
      draft = { ...JSON.parse(opts.body), revision: draft.revision + 1 };
    }
    if (opts.method === "POST") {
      versions = [
        {
          kind: "PRIVACY",
          ...draft,
          version: 1,
          publishedAt: "2026-10-26T00:00:00Z",
        },
      ];
      draft.revision++;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        kind: "PRIVACY",
        draft: { ...draft },
        published: versions[0] || null,
      }),
    };
  });
}
async function render(fetch = fetcher()) {
  vi.stubGlobal("fetch", fetch);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/legal", component: LegalView },
      { path: "/login", component: { template: "<div>LOGIN</div>" } },
    ],
  });
  await router.push("/legal");
  await router.isReady();
  const wrapper = mount(LegalView, {
    global: { plugins: [router], stubs: { teleport: true } },
  });
  await flushPromises();
  return { wrapper, fetch, router };
}
function button(w: any, label: string) {
  return w.findAll("button").find((b: any) => b.text() === label)!;
}
beforeEach(() => {
  vi.unstubAllGlobals();
  draft = {
    title: "测试隐私政策",
    content: "这是用于自动化测试的协议草稿正文。",
    revision: 2,
  };
  versions = [];
  currentUser.value = { id: "admin", nickname: "管理员", role: "ADMIN" };
});
afterEach(() => clearSession());
describe("legal management", () => {
  it("saves a draft without any publish mutation", async () => {
    const { wrapper, fetch } = await render();
    await wrapper
      .get("textarea")
      .setValue("修改后的草稿内容，用于测试保存而非发布。");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(fetch.mock.calls.filter((x) => x[1]?.method === "PUT")).toHaveLength(
      1,
    );
    expect(fetch.mock.calls.some((x) => x[1]?.method === "POST")).toBe(false);
    expect(wrapper.text()).toContain("线上协议尚未改变");
    wrapper.unmount();
  });
  it("cancels publication confirmation without mutation", async () => {
    const { wrapper, fetch } = await render();
    await button(wrapper, "发布新版本").trigger("click");
    expect(wrapper.find("[role=dialog]").exists()).toBe(true);
    expect(wrapper.get("[role=dialog]").text()).toContain("用户需重新确认");
    expect(wrapper.get("[role=dialog]").text()).toContain(
      "历史同意记录不会被覆盖",
    );
    expect(wrapper.get("[role=dialog]").text()).toContain("运营方审核");
    await button(wrapper, "返回检查").trigger("click");
    expect(fetch.mock.calls.some((x) => x[1]?.method === "POST")).toBe(false);
    wrapper.unmount();
  });
  it("publishes only after explicit confirmation using saved revision", async () => {
    const { wrapper, fetch } = await render();
    await button(wrapper, "发布新版本").trigger("click");
    await button(wrapper, "确认发布").trigger("click");
    await flushPromises();
    const calls = fetch.mock.calls.filter((x) => x[1]?.method === "POST");
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]![1].body)).toEqual({ revision: 2 });
    expect(wrapper.text()).toContain("当前发布 v1");
    wrapper.unmount();
  });
  it("preserves typed draft on conflict and disables overwrite", async () => {
    const { wrapper } = await render(fetcher(true));
    await wrapper
      .get("textarea")
      .setValue("我的未保存修订内容必须在冲突后仍保留。");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(
      (wrapper.get("textarea").element as HTMLTextAreaElement).value,
    ).toContain("必须在冲突后仍保留");
    expect(wrapper.get("[role=alert]").text()).toContain("不会自动覆盖");
    expect(button(wrapper, "保存草稿").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("requires saving dirty draft before publishing", async () => {
    const { wrapper } = await render();
    await wrapper.get("input").setValue("新标题");
    expect(button(wrapper, "发布新版本").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("keeps history read-only and renders malicious markup as text", async () => {
    versions = [
      {
        kind: "PRIVACY",
        version: 1,
        title: "历史版本",
        content: "<img src=x onerror=alert(1)>",
        publishedAt: "2026-10-01",
      },
    ];
    const { wrapper, fetch } = await render();
    await button(wrapper, "v1 · 历史版本").trigger("click");
    expect(wrapper.find("article").text()).toContain(
      "<img src=x onerror=alert(1)>",
    );
    expect(wrapper.find("article img").exists()).toBe(false);
    expect(wrapper.find("article textarea").exists()).toBe(false);
    expect(fetch.mock.calls.some((x) => x[1]?.method)).toBe(false);
    wrapper.unmount();
  });
  it("rejects HTML draft before request", async () => {
    const { wrapper, fetch } = await render();
    await wrapper.get("textarea").setValue("<script>alert(1)</script>");
    await wrapper.get("form").trigger("submit");
    expect(fetch.mock.calls.some((x) => x[1]?.method === "PUT")).toBe(false);
    expect(wrapper.get("[role=alert]").text()).toContain("纯文本");
    wrapper.unmount();
  });
  it("clears draft and history immediately on session logout", async () => {
    const { wrapper } = await render();
    clearSession();
    await flushPromises();
    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.text()).not.toContain("这是用于自动化测试");
    wrapper.unmount();
  });
  it("blocks switching away from unsaved draft when declined", async () => {
    const { wrapper } = await render();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    await wrapper.get("input").setValue("还没保存的新标题");
    await button(wrapper, "用户协议").trigger("click");
    expect((wrapper.get("input").element as HTMLInputElement).value).toBe(
      "还没保存的新标题",
    );
    wrapper.unmount();
    vi.restoreAllMocks();
  });
});
