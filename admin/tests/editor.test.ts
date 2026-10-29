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
describe("editor workflow", () => {
  it("rejects incomplete new activity without making a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { wrapper } = await render("/activities/new");
    expect(wrapper.get("h1").text()).toBe("新建活动");
    expect(wrapper.text()).toContain("核验身份证（仅必要时开启，须说明用途）");
    expect(wrapper.text()).toContain("仅支持免费报名");
    expect(wrapper.text()).toContain("时间均为北京时间");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.get("[role=alert]").text()).toContain("请检查");
    expect(fetch).not.toHaveBeenCalled();
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
      .find((b) => b.text() === "发布活动 ↗")
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
      .find((b) => b.text() === "发布活动 ↗")
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
      .find((b) => b.text() === "发布活动 ↗")
      ?.trigger("click");
    expect(wrapper.get("[role=alert]").text()).toContain("请先保存");
    expect(wrapper.text()).not.toContain("发布这场活动？");
    expect(fetch).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
