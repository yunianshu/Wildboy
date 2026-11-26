import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import EditorView from "../src/views/EditorView.vue";
const base = {
  id: "activity-1",
  title: "海边轻徒步",
  category: "WEEKLY",
  coverUrl: "/assets/category-weekly.jpg",
  galleryUrls: [],
  summary: "周末一起走进山海。",
  description: "请带足饮水，穿适合徒步的鞋。",
  location: "厦门",
  meetingPoint: "地铁站 A 口",
  startAt: "2027-05-02T09:00:00+08:00",
  endAt: "2027-05-02T17:00:00+08:00",
  registrationDeadline: "2027-05-01T18:00:00+08:00",
  capacity: 20,
  priceCents: 0,
  registeredCount: 3,
  status: "DRAFT",
  currency: "CNY",
  version: 2,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
async function render(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/activities/new", component: EditorView },
      { path: "/activities/:id/edit", component: EditorView },
      { path: "/activities", component: { template: "<div>LIST</div>" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const wrapper = mount(EditorView, {
    global: { plugins: [router], stubs: { teleport: true } },
  });
  await flushPromises();
  return { wrapper, router };
}
beforeEach(() => vi.unstubAllGlobals());
// 封面与更多图片走上传：向 ImageUpload 的文件输入注入 PNG 并打桩上传接口
const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
async function uploadCover(wrapper: ReturnType<typeof mount>) {
  const input = wrapper.findAll('input[type="file"]')[0]!;
  const file = new File([pngBuffer], "cover.png", { type: "image/png" });
  Object.defineProperty(input.element, "files", { value: [file] });
  await input.trigger("change");
  await vi.waitFor(() => {
    expect(wrapper.get('img[alt="封面预览"]').attributes("src")).toBe(
      "/assets/uploads/mock-cover.png",
    );
  });
}
function withMedia(
  fetch: ReturnType<typeof vi.fn>,
  rest: (url: string, options: any) => any,
) {
  return fetch.mockImplementation(async (url: string, options: any = {}) => {
    if (url.includes("/admin/media"))
      return {
        ok: true,
        status: 201,
        json: async () => ({ url: "/assets/uploads/mock-cover.png" }),
      };
    return rest(url, options);
  });
}
async function fillNew(wrapper: ReturnType<typeof mount>) {
  for (const [selector, value] of [
    ['input[placeholder="活动名称"]', base.title],
    ['textarea[placeholder="活动简介"]', base.summary],
    ['textarea[maxlength="20000"]', base.description],
    ['input[placeholder="城市 / 路线 / 目的地"]', base.location],
    ['input[placeholder="写明集合位置、交通指引"]', base.meetingPoint],
  ])
    await wrapper.get(selector!).setValue(value);
  await uploadCover(wrapper);
  const dates = wrapper.findAll('input[type="date"]');
  const times = wrapper.findAll('input[type="time"]');
  await dates[0]!.setValue("2027-05-02");
  await times[0]!.setValue("09:00");
  await dates[1]!.setValue("2027-05-02");
  await times[1]!.setValue("17:00");
  await dates[2]!.setValue("2027-05-01");
  await times[2]!.setValue("18:00");
}
describe("editor workflow", () => {
  it("rejects incomplete new activity without making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/new");
    expect(wrapper.get("h1").text()).toBe("新建活动");
    expect(wrapper.text()).toContain("核验身份证（仅必要时开启，须说明用途）");
    expect(wrapper.text()).toContain("价格随草稿保存");
    expect(wrapper.text()).toContain("时间均为北京时间");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("[role=alert]").text()).toContain("请检查");
    expect(fetch).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it("uses separate date and time inputs with quick time presets", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { wrapper } = await render("/activities/new");
    await wrapper.get("#activity-start").setValue("2027-05-02");
    const start = wrapper.get(".datetime-field");
    await start
      .findAll("button")
      .find((button) => button.text() === "09:00")!
      .trigger("click");
    expect(
      (wrapper.get("#activity-start-time").element as HTMLInputElement).value,
    ).toBe("09:00");
    expect(
      start
        .findAll("button")
        .find((button) => button.text() === "09:00")!
        .attributes("aria-pressed"),
    ).toBe("true");
    wrapper.unmount();
  });
  it("opens one calendar and time dialog and fills the selected values", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { wrapper } = await render("/activities/new");
    await wrapper.get("#activity-start").trigger("click");
    expect(wrapper.get("[role=dialog]").text()).toContain("选择日期");
    const day = wrapper.get(".calendar-day:not(.is-outside)");
    const selectedDate = day.attributes("aria-label");
    await day.trigger("click");
    await wrapper
      .get(".time-choice-grid")
      .findAll("button")
      .find((button) => button.text() === "09:00")!
      .trigger("click");
    await wrapper
      .get("[role=dialog] .dialog-actions .primary")
      .trigger("click");
    expect(
      (wrapper.get("#activity-start").element as HTMLInputElement).value,
    ).toBe(selectedDate);
    expect(
      (wrapper.get("#activity-start-time").element as HTMLInputElement).value,
    ).toBe("09:00");
    expect(wrapper.find("[role=dialog]").exists()).toBe(false);
    wrapper.unmount();
  });
  it.each(["network", "server"])(
    "retains an uncertain %s create draft and blocks a second POST",
    async (mode) => {
      const fetch = vi.fn();
      if (mode === "network")
        withMedia(fetch, () => {
          throw new Error("响应丢失");
        });
      else
        withMedia(fetch, () => ({
          ok: false,
          status: 503,
          json: async () => ({ message: "暂时无法响应" }),
        }));
      vi.stubGlobal("fetch", fetch);
      const { wrapper } = await render("/activities/new");
      await fillNew(wrapper);
      await wrapper.get("form").trigger("submit");
      await flushPromises();
      expect(wrapper.get("[role=alert]").text()).toContain("返回活动列表核对");
      expect(
        (
          wrapper.get('input[placeholder="活动名称"]')
            .element as HTMLInputElement
        ).value,
      ).toBe(base.title);
      await wrapper.get("form").trigger("submit");
      const posts = fetch.mock.calls.filter(
        (c: any) => !c[0].includes("/admin/media"),
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[1].method).toBe("POST");
      wrapper.unmount();
    },
  );
  it("keeps a rejected 400 create editable and lets the corrected draft retry", async () => {
    const fetch = vi.fn();
    withMedia(fetch, () => ({
      ok: false,
      status: 400,
      json: async () => ({ message: "请修正活动标题" }),
    }));
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/new");
    await fillNew(wrapper);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("请修正活动标题");
    await wrapper.get('input[placeholder="活动名称"]').setValue("修正后的标题");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    const creates = fetch.mock.calls.filter(
      (c: any) => !c[0].includes("/admin/media"),
    );
    expect(creates).toHaveLength(2);
    expect(JSON.parse(creates[1]?.[1].body).title).toBe("修正后的标题");
    wrapper.unmount();
  });
  it("edits an existing activity across sections and preserves hidden data on save", async () => {
    const published = {
      ...base,
      status: "PUBLISHED",
      galleryUrls: ["/assets/existing.png"],
      boardingPoints: ["海滨公园东门"],
      identityRequired: false,
    };
    const fetch = vi.fn(async (_path: string, options?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () =>
        options?.method === "PUT"
          ? { ...published, ...JSON.parse(String(options.body)), version: 3 }
          : published,
    }));
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    expect(wrapper.find(".task-tabs").exists()).toBe(false);
    const title = wrapper.get('input[placeholder="活动名称"]');
    const end = wrapper.get("#activity-end-time");
    const description = wrapper.get('textarea[maxlength="20000"]');
    const section = (label: string) =>
      wrapper
        .get(".activity-section-nav")
        .findAll("button")
        .find((b) => b.text() === label)!;
    const isActive = (field: HTMLElement) =>
      field.closest<HTMLElement>(".form-section")?.style.display !== "none";
    expect(isActive(title.element as HTMLElement)).toBe(true);
    expect(isActive(end.element as HTMLElement)).toBe(false);
    expect(isActive(description.element as HTMLElement)).toBe(false);
    expect(wrapper.get("#activity-media-options").isVisible()).toBe(false);
    await title.setValue("更新后的活动");
    expect(wrapper.get(".preview-copy h3").text()).toBe("更新后的活动");

    await section("时间与地点").trigger("click");
    expect(isActive(end.element as HTMLElement)).toBe(true);
    expect(isActive(title.element as HTMLElement)).toBe(false);
    expect(wrapper.get("#activity-advanced-options").isVisible()).toBe(false);
    await end.setValue("18:00");
    await section("活动详情").trigger("click");
    expect(isActive(description.element as HTMLElement)).toBe(true);
    expect(isActive(end.element as HTMLElement)).toBe(false);
    await description.setValue("请在出发前检查装备。");
    await section("基本信息").trigger("click");
    expect((title.element as HTMLInputElement).value).toBe("更新后的活动");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]?.[1]?.method).toBe("PUT");
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toMatchObject({
      title: "更新后的活动",
      endAt: expect.stringContaining("T18:00"),
      description: "请在出发前检查装备。",
      coverUrl: published.coverUrl,
      galleryUrls: published.galleryUrls,
      boardingPoints: published.boardingPoints,
      identityRequired: false,
      version: 2,
    });
    expect(wrapper.get('[role="status"]').text()).toBe("活动修改已保存。");
    wrapper.unmount();
  });

  it("reveals a required cover problem even when media settings were closed", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => base,
    });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    const toggle = wrapper.get(
      'button[aria-controls="activity-media-options"]',
    );
    await toggle.trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "移除封面")!
      .trigger("click");
    await toggle.trigger("click");
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await wrapper.get("form").trigger("submit");
    expect(toggle.attributes("aria-expanded")).toBe("true");
    expect(toggle.text()).toContain("待修正");
    expect(fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("renders paid occupancy separately and locks ID policy when seats are occupied", async () => {
    const paid = {
      ...base,
      priceCents: 9900,
      status: "PUBLISHED",
      registeredCount: 4,
      confirmedCount: 1,
      pendingPaymentCount: 3,
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => paid }),
    );
    const { wrapper } = await render("/activities/activity-1/edit");
    expect(wrapper.text()).toContain("名额占用 4 / 20");
    expect(wrapper.text()).toContain("已确认 1");
    expect(wrapper.text()).toContain("待支付 3");
    expect(
      wrapper.get('input[type="checkbox"]').attributes("disabled"),
    ).toBeDefined();
    wrapper.unmount();
  });
  it("retains other edits when the server locks an identity-policy change", async () => {
    const original = { ...base, registeredCount: 0, identityRequired: false };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => original,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          code: "ACTIVITY_IDENTITY_LOCKED",
          message: "已有名额占用，不能修改身份证核验要求",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...original, title: "保留的标题" }),
      });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    const checkbox = wrapper.get('input[type="checkbox"]');
    await checkbox.setValue(true);
    await wrapper.get('input[placeholder="活动名称"]').setValue("保留的标题");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain(
      "不能修改身份证核验要求",
    );
    expect(checkbox.attributes("disabled")).toBeDefined();
    expect((checkbox.element as HTMLInputElement).checked).toBe(false);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(fetch.mock.calls[2]?.[1].body)).toMatchObject({
      title: "保留的标题",
      identityRequired: false,
    });
    wrapper.unmount();
  });
  it("selects and saves boarding points on a started activity", async () => {
    const started = {
      ...base,
      status: "PUBLISHED",
      startAt: "2026-11-01T09:00:10+08:00",
      endAt: "2026-11-01T09:00:50+08:00",
      registrationDeadline: "2026-10-31T18:00:00+08:00",
      boardingPoints: ["海滨公园东门"],
    };
    const fetch = vi.fn(async (path: string, options: RequestInit = {}) => {
      if (path.endsWith("/activity-boarding-points")) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            options.method === "POST"
              ? { name: "会展中心东门" }
              : ["厦门北站", "海滨公园东门"],
        };
      }
      const data =
        options.method === "PUT"
          ? { ...started, ...JSON.parse(String(options.body)), version: 3 }
          : started;
      return { ok: true, status: 200, json: async () => data };
    });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper
      .get('button[aria-controls="activity-advanced-options"]')
      .trigger("click");
    await flushPromises();
    const choices = wrapper.get('select[aria-label="选择已有上车地点"]');
    expect(choices.findAll("option").map((option) => option.text())).toEqual([
      "选择已有地点",
      "厦门北站",
    ]);
    await choices.setValue("厦门北站");
    await wrapper
      .get('button[aria-label="移除上车地点 海滨公园东门"]')
      .trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "新增地点")!
      .trigger("click");
    await wrapper.get(".new-point input").setValue("  会展中心东门  ");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "保存地点")!
      .trigger("click");
    await flushPromises();
    expect(JSON.parse(String(fetch.mock.calls[2]?.[1]?.body))).toEqual({
      name: "会展中心东门",
    });
    expect(wrapper.find(".new-point input").exists()).toBe(false);
    expect(wrapper.get(".selected-points").text()).toContain("会展中心东门");
    expect(
      fetch.mock.calls.some(([, options]) => options?.method === "PUT"),
    ).toBe(false);

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(String(fetch.mock.calls[3]?.[1]?.body))).toMatchObject({
      boardingPoints: ["厦门北站", "会展中心东门"],
      startAt: started.startAt,
      endAt: started.endAt,
      version: 2,
    });
    expect(wrapper.get('[role="status"]').text()).toBe("活动修改已保存。");
    wrapper.unmount();
  });
  it("saves a draft price separately, retains main DTO free-only and never publishes implicitly", async () => {
    let activity = { ...base, registeredCount: 0 };
    const fetch = vi.fn(async (_path: string, options: any = {}) => {
      if (_path.endsWith("/price"))
        activity = {
          ...activity,
          priceCents: JSON.parse(options.body).priceCents,
          version: 3,
        };
      return { ok: true, status: 200, json: async () => activity };
    });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper.get('[aria-label="活动报名原价"]').setValue("12.34");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "保存报名价格")!
      .trigger("click");
    await flushPromises();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      priceCents: 1234,
      version: 2,
    });
    expect(fetch.mock.calls.some((c) => c[0].endsWith("/publish"))).toBe(false);
    await wrapper.get('input[placeholder="活动名称"]').setValue("调整活动标题");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({
      priceCents: 0,
      version: 3,
    });
    expect(
      (wrapper.get('[aria-label="活动报名原价"]').element as HTMLInputElement)
        .value,
    ).toBe("12.34");
    wrapper.unmount();
  });
  it("saves metadata and then price with the latest version, and validates monetary precision", async () => {
    const fetch = vi.fn(async (path: string, options?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () =>
        path.endsWith("/price")
          ? { ...base, version: 4, priceCents: 2500 }
          : options?.method === "PUT"
            ? { ...base, version: 3 }
            : base,
    }));
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper.get('[aria-label="活动报名原价"]').setValue("12.345");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "保存报名价格")!
      .trigger("click");
    expect(wrapper.text()).toContain("最多两位小数");
    expect(fetch).toHaveBeenCalledTimes(1);
    await wrapper.get('[aria-label="活动报名原价"]').setValue("25");
    await wrapper.get('input[placeholder="活动名称"]').setValue("调整活动标题");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(fetch.mock.calls[2][0]).toMatch(/\/price$/);
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({
      priceCents: 2500,
      version: 3,
    });
    expect(
      (wrapper.get('[aria-label="活动报名原价"]').element as HTMLInputElement)
        .value,
    ).toBe("25.00");
    wrapper.unmount();
  });
  it("version conflict requires reload and disables overwrite retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => base })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ code: "VERSION_CONFLICT", message: "conflict" }),
      });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper.get('input[placeholder="活动名称"]').setValue("新标题");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body).version).toBe(2);
    expect(wrapper.get("[role=alert]").text()).toContain("不会自动覆盖");
    const save = wrapper.findAll("button").find((b) => b.text() === "保存修改");
    expect(save?.attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
  it("opening then canceling publish dialog makes no publication call", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => base });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "发布活动")
      ?.trigger("click");
    expect(wrapper.find("[role=dialog]").exists()).toBe(true);
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "取消")
      ?.trigger("click");
    expect(wrapper.text()).not.toContain("发布这场活动？");
    expect(fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it("publishes only after explicit confirmation using latest version", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => base })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...base, status: "PUBLISHED", version: 3 }),
      });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "发布活动")
      ?.trigger("click");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "确认发布")
      ?.trigger("click");
    await flushPromises();
    expect(fetch.mock.calls[1]?.[0]).toBe(
      "/api/v1/admin/activities/activity-1/publish",
    );
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body)).toEqual({ version: 2 });
    expect(wrapper.text()).toContain("活动已发布");
    wrapper.unmount();
  });
  it("blocks publish when there are unsaved changes", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => base });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/activity-1/edit");
    await wrapper
      .get('input[placeholder="活动名称"]')
      .setValue("未保存的新标题");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "发布活动")
      ?.trigger("click");
    expect(wrapper.get("[role=alert]").text()).toContain("请先保存");
    expect(wrapper.text()).not.toContain("发布这场活动？");
    expect(fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
