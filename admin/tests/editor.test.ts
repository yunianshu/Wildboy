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
async function fillNew(wrapper: ReturnType<typeof mount>) {
  for (const [selector, value] of [
    ['input[placeholder="活动名称"]', base.title],
    ['input[placeholder^="https://"]', base.coverUrl],
    ['textarea[placeholder="活动简介"]', base.summary],
    ['textarea[maxlength="20000"]', base.description],
    ['input[placeholder="城市 / 路线 / 目的地"]', base.location],
    ['input[placeholder="写明集合位置、交通指引"]', base.meetingPoint],
  ])
    await wrapper.get(selector!).setValue(value);
  const dates = wrapper.findAll('input[type="datetime-local"]');
  await dates[0]!.setValue("2027-05-02T09:00");
  await dates[1]!.setValue("2027-05-02T17:00");
  await dates[2]!.setValue("2027-05-01T18:00");
}
describe("editor workflow", () => {
  it("rejects incomplete new activity without making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/new");
    expect(wrapper.get("h1").text()).toBe("新建活动");
    expect(wrapper.text()).toContain("核验身份证（仅必要时开启，须说明用途）");
    expect(wrapper.text()).toContain("新建草稿默认免费报名");
    expect(wrapper.text()).toContain("时间均为北京时间");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("[role=alert]").text()).toContain("请检查");
    expect(fetch).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it.each(["network", "server"])(
    "retains an uncertain %s create draft and blocks a second POST",
    async (mode) => {
      const fetch = vi.fn();
      if (mode === "network")
        fetch.mockRejectedValueOnce(new Error("响应丢失"));
      else
        fetch.mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: async () => ({ message: "暂时无法响应" }),
        });
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
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch.mock.calls[0]?.[1].method).toBe("POST");
      wrapper.unmount();
    },
  );
  it("keeps a rejected 400 create editable and lets the corrected draft retry", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "请修正活动标题" }),
    });
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/new");
    await fillNew(wrapper);
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("请修正活动标题");
    await wrapper.get('input[placeholder="活动名称"]').setValue("修正后的标题");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetch.mock.calls[1]?.[1].body).title).toBe(
      "修正后的标题",
    );
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
  it("keeps unsaved pricing on metadata save and validates monetary precision", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => base,
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
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(
      (wrapper.get('[aria-label="活动报名原价"]').element as HTMLInputElement)
        .value,
    ).toBe("25");
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
      .find((b) => b.text() === "返回检查")
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
