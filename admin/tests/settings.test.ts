import * as confirmation from "../src/confirm";
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
  vi.spyOn(confirmation, "askConfirm").mockResolvedValue(true);
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
it("reload cancellation preserves edits after a failed upload", async () => {
  const w = await view();
  // 上传失败：媒体接口返回 503，不得产生保存请求或预览
  fetcher.mockImplementation((url: string, options: any = {}) => {
    if (url.includes("/admin/media"))
      return Promise.resolve({
        ok: false,
        status: 503,
        json: async () => ({ message: "图片保存失败，请重试" }),
      });
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => defaults(),
    });
  });
  const input = w.get('input[type="file"]');
  Object.defineProperty(input.element, "files", {
    value: [new File(["png"], "qr.png", { type: "image/png" })],
  });
  vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(function (
    this: FileReader,
  ) {
    Object.defineProperty(this, "result", {
      value: "data:image/png;base64,cG5n",
      configurable: true,
    });
    this.onload?.({} as ProgressEvent<FileReader>);
  } as any);
  await input.trigger("change");
  await flushPromises();
  expect(w.find(".popup-preview").exists()).toBe(false);
  expect(fetcher.mock.calls.filter((c) => c[1]?.method === "PUT")).toHaveLength(
    0,
  );
  vi.mocked(confirmation.askConfirm).mockResolvedValue(false);
  const count = fetcher.mock.calls.filter(
    (c) => !c[0].includes("/admin/media"),
  ).length;
  await w
    .findAll("button")
    .find((b) => b.text() === "重新加载配置")!
    .trigger("click");
  expect(
    fetcher.mock.calls.filter(
      (c) => !c[0].includes("/admin/media") && c[1]?.method !== "PUT",
    ).length,
  ).toBeGreaterThanOrEqual(count);
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

it("keeps server-side popup image validation for legacy saves", async () => {
  // 上传是唯一入口（服务端只回传白名单地址）；服务端校验继续拦截历史脏数据
  const w = await view();
  const upload = w.findComponent({ name: "ImageUpload" });
  upload.vm.$emit("uploaded", "/assets/media/real-qr.png");
  await flushPromises();
  await w.get("form").trigger("submit");
  await flushPromises();
  const call = fetcher.mock.calls.find((c) => c[1]?.method === "PUT")!;
  expect(JSON.parse(call[1].body).items[2].popupImageUrl).toBe(
    "/assets/media/real-qr.png",
  );
  w.unmount();
});

it("shows wechat order center status and configures the detail path", async () => {
  const calls: Array<[string, any?]> = [];
  const fetchOrderCenter = vi.fn(async (url: string, opts: any = {}) => {
    calls.push([url, opts]);
    if (url.includes("/admin/wechat-order-center/status"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          orderDetailPathConfigured: false,
          orderDetailPath: "",
          confirmationCompleted: true,
          pathErrcode: 0,
          confirmationErrcode: 0,
        }),
      };
    if (url.includes("/articles?"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], hasMore: false }),
      };
    if (opts.method === "PUT" && url.includes("order-detail-path"))
      return {
        ok: true,
        status: 200,
        json: async () => ({ attempted: true, errcode: 0 }),
      };
    return {
      ok: true,
      status: 200,
      json: async () => (opts.method ? { ...JSON.parse(opts.body), version: 4 } : defaults()),
    };
  });
  vi.stubGlobal("fetch", fetchOrderCenter);
  const w = await view();

  const card = w.get(".order-center-card");
  expect(card.text()).toContain("微信电商订单");
  expect(card.text()).toContain("订单详情路径 · 未配置");
  expect(card.text()).toContain("交易结算管理确认 · 已完成");

  await card.get("button.primary").trigger("click");
  const dialog = w.get(".form-modal");
  const input = dialog.get('input[name="orderPath"]');
  expect((input.element as HTMLInputElement).value).toBe(
    "pages/order-detail/index?no=${商品订单号}",
  );
  // 去掉占位符提交 → 本地校验拦截，不发 PUT
  await input.setValue("pages/orders/index");
  await dialog.get("#order-path-form").trigger("submit");
  await flushPromises();
  expect(dialog.text()).toContain("占位符");
  expect(
    calls.find(([u, o]) => o?.method === "PUT" && u.includes("order-detail-path")),
  ).toBeUndefined();
  // 合法路径提交 → 调用管理端点
  await input.setValue("pages/order-detail/index?no=${商品订单号}");
  await dialog.get("#order-path-form").trigger("submit");
  await flushPromises();
  const put = calls.find(([u, o]) => o?.method === "PUT" && u.includes("order-detail-path"));
  expect(put).toBeTruthy();
  expect(JSON.parse(put![1].body)).toEqual({ path: "pages/order-detail/index?no=${商品订单号}" });
  w.unmount();
});

it("configures the wechat message jump path with local URL validation", async () => {
  const calls: Array<[string, any?]> = [];
  const fetchJump = vi.fn(async (url: string, opts: any = {}) => {
    calls.push([url, opts]);
    if (url.includes("/admin/wechat-order-center/status"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          orderDetailPathConfigured: true,
          orderDetailPath: "pages/a",
          savedMsgJumpPath: "pages/orders/index",
          confirmationCompleted: true,
          pathErrcode: 0,
          confirmationErrcode: 0,
        }),
      };
    if (url.includes("/articles?"))
      return { ok: true, status: 200, json: async () => ({ items: [], hasMore: false }) };
    if (opts.method === "PUT" && url.includes("msg-jump-path"))
      return { ok: true, status: 200, json: async () => ({ attempted: true, errcode: 0 }) };
    return {
      ok: true,
      status: 200,
      json: async () => (opts.method ? { ...JSON.parse(opts.body), version: 4 } : defaults()),
    };
  });
  vi.stubGlobal("fetch", fetchJump);
  const w = await view();

  const card = w.get(".order-center-card");
  const jumpButton = card
    .findAll("button")
    .find((b) => b.text().includes("设置消息跳转路径"))!;
  await jumpButton.trigger("click");
  const dialog = w.get(".form-modal");
  const input = dialog.get('input[name="msgJumpPath"]');
  expect((input.element as HTMLInputElement).value).toBe("pages/orders/index");
  // 完整网址不是小程序页面路径 → 本地拦截
  await input.setValue("https://evil.example/x");
  await dialog.get("#msg-jump-form").trigger("submit");
  await flushPromises();
  expect(dialog.text()).toContain("不能是完整网址");
  expect(
    calls.find(([u, o]) => o?.method === "PUT" && u.includes("msg-jump-path")),
  ).toBeUndefined();
  // 合法路径 → 调用管理端点
  await input.setValue("pages/order-detail/index");
  await dialog.get("#msg-jump-form").trigger("submit");
  await flushPromises();
  const put = calls.find(([u, o]) => o?.method === "PUT" && u.includes("msg-jump-path"));
  expect(put).toBeTruthy();
  expect(JSON.parse(put![1].body)).toEqual({ path: "pages/order-detail/index" });
  w.unmount();
});

it("queries wechat order list with filters and pagination", async () => {
  const calls: Array<[string, any?]> = [];
  let page = 0;
  const fetchOrders = vi.fn(async (url: string, opts: any = {}) => {
    calls.push([url, opts]);
    if (url.includes("/admin/wechat-order-center/status"))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          enabled: true,
          orderDetailPathConfigured: true,
          orderDetailPath: "pages/a",
          confirmationCompleted: true,
          pathErrcode: 0,
          confirmationErrcode: 0,
        }),
      };
    if (url.includes("/articles?"))
      return { ok: true, status: 200, json: async () => ({ items: [], hasMore: false }) };
    if (url.includes("/admin/wechat-order-center/wechat-orders")) {
      page += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          attempted: true,
          errcode: 0,
          error: "",
          lastIndex: page === 1 ? "idx-1" : "idx-2",
          hasMore: page === 1,
          orders:
            page === 1
              ? [
                  {
                    transaction_id: "42000000000000000000000000000081",
                    merchant_trade_no: "30000000000000000000000000000081",
                    order_state: 2,
                    pay_time: 1765000000,
                    paid_amount: 19900,
                    in_complaint: false,
                  },
                ]
              : [
                  {
                    transaction_id: "42000000000000000000000000000082",
                    merchant_trade_no: "30000000000000000000000000000082",
                    order_state: 6,
                    pay_time: 1765000100,
                    paid_amount: 9900,
                    in_complaint: true,
                  },
                ],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => (opts.method ? { ...JSON.parse(opts.body), version: 4 } : defaults()),
    };
  });
  vi.stubGlobal("fetch", fetchOrders);
  const w = await view();

  // 选择状态并查询
  const form = w.get(".wechat-orders-filters");
  await form.get("select").setValue("2");
  await form.trigger("submit");
  await flushPromises();
  const first = calls.find(([u]) => u.includes("/wechat-orders?"))!;
  expect(first[0]).toContain("orderState=2");
  expect(first[0]).toContain("size=20");
  const card2 = w.get('[aria-labelledby="wechat-orders-heading"]');
  expect(card2.text()).toContain("42000000000000000000000000000081");
  expect(card2.text()).toContain("已发货");
  expect(card2.text()).toContain("¥199.00");
  // 下一页沿用已提交的条件及微信游标
  await form.get("select").setValue("3");
  const more = card2
    .findAll("button")
    .find((b) => b.text() === "下一页")!;
  await more.trigger("click");
  await flushPromises();
  const second = calls.filter(([u]) => u.includes("/wechat-orders?"))[1];
  expect(second[0]).toContain("lastIndex=idx-1");
  expect(second[0]).toContain("orderState=2");
  expect(card2.text()).not.toContain("42000000000000000000000000000081");
  expect(card2.text()).toContain("资金待结算");
  expect(card2.text()).toContain("纠纷中");
  await card2.findAll("button").find((b) => b.text() === "上一页")!.trigger("click");
  await flushPromises();
  const third = calls.filter(([u]) => u.includes("/wechat-orders?"))[2];
  expect(third[0]).not.toContain("lastIndex");
  expect(third[0]).toContain("orderState=2");
  w.unmount();
});
