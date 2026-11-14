import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import MarkdownEditor from "../src/components/MarkdownEditor.vue";
import ImageUpload from "../src/components/ImageUpload.vue";
import { clearSession, acceptAuth } from "../src/api";

// Vditor 在 jsdom 中无法初始化，用可控替身验证组件逻辑。
const { VditorMock, instances } = vi.hoisted(() => {
  const instances: any[] = [];
  class VditorMock {
    options: any;
    value = "";
    readied = false;
    constructor(_el: HTMLElement, options: any) {
      this.options = options;
      this.value = options.value ?? "";
      instances.push(this);
    }
    setValue(v: string) {
      this.value = v;
    }
    getValue() {
      return this.value;
    }
    disabled() {}
    enable() {}
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
  return { VditorMock, instances };
});
vi.mock("vditor", () => ({ default: VditorMock }));

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  instances.length = 0;
  clearSession();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});

async function mountEditor(
  props: { path?: string; active?: boolean; disabled?: boolean } = {},
) {
  const merged = {
    path: "/admin/articles/a1/content",
    active: true,
    ...props,
  };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  const w = mount(MarkdownEditor, {
    props: merged,
    global: { plugins: [router] },
  });
  await flushPromises();
  return w;
}

describe("markdown article content editor", () => {
  it("loads markdown into the editor, saves with version and reports the new one", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ markdown: "# 标题\n\n正文", version: 4 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ markdown: "# 标题\n\n新正文", version: 5 }),
      });
    vi.stubGlobal("fetch", fetch);
    const w = await mountEditor();
    expect(instances).toHaveLength(1);
    expect(instances[0].value).toBe("# 标题\n\n正文");
    instances[0].value = "# 标题\n\n新正文";
    instances[0].fireInput();
    expect(dirtyOf(w)).toBe(true);
    await w.get("button.primary").trigger("click");
    await flushPromises();
    const put = fetch.mock.calls.find((c: any) => c[1]?.method === "PUT")!;
    expect(JSON.parse(put[1].body)).toEqual({
      markdown: "# 标题\n\n新正文",
      version: 4,
    });
    expect(w.emitted("saved")![0]).toEqual([5]);
    expect(dirtyOf(w)).toBe(false);
    w.unmount();
  });

  it("surfaces conflict errors and keeps local edits for correction", async () => {
    const fetch = vi.fn(async (url: string, options: any = {}) => {
      if (options.method === "PUT")
        return {
          ok: false,
          status: 409,
          json: async () => ({ message: "文章已更新，请刷新后重试" }),
        };
      return {
        ok: true,
        status: 200,
        json: async () => ({ markdown: "正文", version: 1 }),
      };
    });
    vi.stubGlobal("fetch", fetch);
    const w = await mountEditor();
    const inst = instances[0];
    inst.value = "本地修改";
    inst.fireInput();
    await w.get("button.primary").trigger("click");
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain("内容冲突");
    expect(inst.value).toBe("本地修改");
    expect(dirtyOf(w)).toBe(true);
    w.unmount();
  });

  it("disables editing while the article is locked and guards unsaved leaving", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ markdown: "正文", version: 1 }),
    });
    vi.stubGlobal("fetch", fetch);
    const w = await mountEditor();
    await w.setProps({ disabled: true });
    instances[0].value = "改了一半";
    instances[0].fireInput();
    expect(dirtyOf(w)).toBe(true);
    expect(w.vm.canLeave()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    w.unmount();
  });

  it("offers a reload action when the initial load fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ message: "服务暂时不可用" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ markdown: "重试后的正文", version: 7 }),
      });
    vi.stubGlobal("fetch", fetch);
    const w = await mountEditor();
    expect(w.get('[role="alert"]').text()).toContain("服务暂时不可用");
    expect(instances).toHaveLength(0);
    await w.get("button").trigger("click");
    await flushPromises();
    expect(instances[0].value).toBe("重试后的正文");
    w.unmount();
  });
});

describe("image upload guard", () => {
  it("rejects oversized uploads before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const w = mount(ImageUpload);
    const big = new File([new ArrayBuffer(5 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    Object.defineProperty(w.get('input[type="file"]').element, "files", {
      value: [big],
    });
    await w.get('input[type="file"]').trigger("change");
    await flushPromises();
    expect(w.text()).toContain("请选择 4MB 内 JPG/PNG 图片");
    expect(fetch).not.toHaveBeenCalled();
    w.unmount();
  });
});

function dirtyOf(w: ReturnType<typeof mount>) {
  // defineExpose 的 ref 在实例上自动解包
  return Boolean((w.vm as unknown as { dirty: boolean }).dirty);
}
