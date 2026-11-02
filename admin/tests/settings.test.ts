import { beforeEach, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import SettingsView from "../src/views/SettingsView.vue";
import { acceptAuth, clearSession } from "../src/api";
const defaults = () => ({
  version: 3,
  items: ["本周活动", "国内游行", "二维码", "野小子"].map((name, i) => ({
    slot: i + 1,
    name,
    icon: ["WEEKLY", "DOMESTIC", "QRCODE", "INTRO"][i],
    type: i === 2 ? "POPUP" : i === 3 ? "ARTICLE" : "PAGE",
    page: i === 0 ? "WEEKLY" : i === 1 ? "DOMESTIC" : "",
    articleId: i === 3 ? "OFFICIAL" : "",
    popupTitle: "",
    popupText: "",
    popupImageUrl: "",
  })),
});
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fetcher = vi.fn(async (url: string, opts: any = {}) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes("/articles?")
        ? {
            items: [
              { id: "published", title: "已发布文章", status: "PUBLISHED" },
              { id: "draft", title: "秘密草稿", status: "DRAFT" },
            ],
            hasMore: false,
          }
        : opts.method
          ? { ...JSON.parse(opts.body), version: 4 }
          : defaults(),
  }));
  vi.stubGlobal("fetch", fetcher);
});
async function view() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: SettingsView }],
  });
  await router.push("/");
  const w = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return w;
}
it("edits exactly four entries with allowed page and published article choices", async () => {
  const w = await view();
  expect(w.findAll("[data-slot]")).toHaveLength(4);
  expect(w.text()).toContain("尚未配置二维码/图片");
  expect(w.text()).toContain("已发布文章");
  expect(w.text()).not.toContain("秘密草稿");
  expect(w.find('input[placeholder="页面路径"]').exists()).toBe(false);
  w.unmount();
});
it("clears inactive fields when action changes and saves expected version", async () => {
  const w = await view();
  await w.get('[aria-label="入口1类型"]').setValue("POPUP");
  await w.get('[aria-label="入口1弹窗文字"]').setValue("欢迎");
  await w.get('[aria-label="入口1类型"]').setValue("ARTICLE");
  await w.get('[aria-label="入口1文章"]').setValue("published");
  await w.get("form").trigger("submit");
  await flushPromises();
  const call = fetcher.mock.calls.find((c) => c[1]?.method === "PUT")!;
  const body = JSON.parse(call[1].body);
  expect(body.version).toBe(3);
  expect(body.items[0]).toMatchObject({
    page: "",
    popupText: "",
    articleId: "published",
  });
  expect(w.text()).toContain("配置已保存");
  w.unmount();
});
it("keeps unsaved edits after conflict, never retries writes", async () => {
  const w = await view();
  fetcher.mockImplementation(async () => ({
    ok: false,
    status: 409,
    json: async () => ({ code: "CONFIG_CONFLICT" }),
  }));
  await w.get('[aria-label="入口1名称"]').setValue("新标题");
  await w.get("form").trigger("submit");
  await flushPromises();
  expect(w.text()).toContain("不会自动覆盖");
  expect(
    (w.get('[aria-label="入口1名称"]').element as HTMLInputElement).value,
  ).toBe("新标题");
  expect(fetcher.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(
    1,
  );
  w.unmount();
});
it("ignores save response after session is cleared", async () => {
  const w = await view();
  let resolve: any;
  fetcher.mockImplementation(() => new Promise((r) => (resolve = r)));
  await w.get("form").trigger("submit");
  clearSession();
  await flushPromises();
  resolve({ ok: true, status: 200, json: async () => defaults() });
  await flushPromises();
  expect(w.findAll("[data-slot]")).toHaveLength(0);
  expect(w.text()).not.toContain("配置已保存");
  w.unmount();
});
it("blocks save and action changes while image upload is pending", async () => {
  const w = await view();
  const upload = w.findComponent({ name: "ImageUpload" });
  upload.vm.$emit("busy", true);
  await flushPromises();
  expect(w.get("fieldset").attributes("disabled")).toBeDefined();
  await w.get("form").trigger("submit");
  expect(fetcher.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(
    0,
  );
  upload.vm.$emit("uploaded", "/assets/media/real-qr.png");
  upload.vm.$emit("busy", false);
  await flushPromises();
  await w.get("form").trigger("submit");
  await flushPromises();
  const call = fetcher.mock.calls.find((c) => c[1]?.method === "PUT")!;
  expect(JSON.parse(call[1].body).items[2].popupImageUrl).toBe(
    "/assets/media/real-qr.png",
  );
  w.unmount();
});
it("loads all article pages without replacing in-progress config edits", async () => {
  let resolve: any;
  fetcher.mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      url.includes("page=0")
        ? {
            items: [{ id: "draft", title: "草稿", status: "DRAFT" }],
            hasMore: true,
          }
        : url.includes("page=1")
          ? await new Promise((r) => (resolve = r))
          : defaults(),
  }));
  const w = await view();
  await w.get('[aria-label="入口1名称"]').setValue("编辑中");
  resolve({
    items: [{ id: "p2", title: "第二页发布文章", status: "PUBLISHED" }],
    hasMore: false,
  });
  await flushPromises();
  expect(w.text()).toContain("第二页发布文章");
  expect(
    (w.get('[aria-label="入口1名称"]').element as HTMLInputElement).value,
  ).toBe("编辑中");
  w.unmount();
});
it("blocks duplicate saves and ignores responses after unmount", async () => {
  const w = await view();
  let resolve: any;
  fetcher.mockImplementation(() => new Promise((r) => (resolve = r)));
  await w.get("form").trigger("submit");
  await w.get("form").trigger("submit");
  expect(fetcher.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(
    1,
  );
  w.unmount();
  resolve({ ok: true, status: 200, json: async () => defaults() });
  await flushPromises();
});
it("reload cancellation preserves edits and invalid image never saves", async () => {
  const w = await view();
  await w.get('[aria-label="入口3弹窗图片"]').setValue("javascript:alert(1)");
  await w.get("form").trigger("submit");
  await flushPromises();
  expect(fetcher.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(
    0,
  );
  expect(w.find(".popup-preview").exists()).toBe(false);
  vi.mocked(window.confirm).mockReturnValue(false);
  const count = fetcher.mock.calls.length;
  await w
    .findAll("button")
    .find((b) => b.text() === "重新加载配置")!
    .trigger("click");
  expect(fetcher.mock.calls.length).toBe(count);
  w.unmount();
});
it("an upload completing after logout cannot restore image data", async () => {
  const w = await view();
  let resolve: any;
  fetcher.mockImplementation(() => new Promise((r) => (resolve = r)));
  const input = w.get('input[type="file"]');
  Object.defineProperty(input.element, "files", {
    value: [new File(["png"], "qr.png", { type: "image/png" })],
  });
  const reader = vi
    .spyOn(FileReader.prototype, "readAsDataURL")
    .mockImplementation(function (this: FileReader) {
      Object.defineProperty(this, "result", {
        value: "data:image/png;base64,cG5n",
      });
      this.onload?.({} as ProgressEvent<FileReader>);
    });
  await input.trigger("change");
  await flushPromises();
  expect(w.text()).toContain("图片上传中");
  clearSession();
  await flushPromises();
  resolve({
    ok: true,
    status: 200,
    json: async () => ({ url: "/assets/media/late.png" }),
  });
  await flushPromises();
  expect(w.find(".popup-preview").exists()).toBe(false);
  expect(w.findAll("[data-slot]")).toHaveLength(0);
  reader.mockRestore();
  w.unmount();
});

it.each([
  "/assets/foo.svg",
  "/assets/nested/../foo.png",
  "https://example.com/@foo.png",
  "https://example.com/with space.png",
])(
  "rejects backend-disallowed popup image %s before preview or save",
  async (url) => {
    const w = await view();
    await w.get('[aria-label="入口3弹窗图片"]').setValue(url);
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(
      fetcher.mock.calls.filter((c) => c[1]?.method === "PUT"),
    ).toHaveLength(0);
    expect(w.find(".popup-preview").exists()).toBe(false);
    expect(w.text()).toContain("图片须为 HTTPS 或 /assets/ 地址");
    w.unmount();
  },
);
