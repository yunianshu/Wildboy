import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import App from "../src/App.vue";
import EditorView from "../src/views/EditorView.vue";
import LoginView from "../src/views/LoginView.vue";
import { acceptAuth, clearSession } from "../src/api";
const activity = {
  id: "one",
  title: "第一场活动",
  category: "WEEKLY",
  coverUrl: "/assets/category-weekly.jpg",
  galleryUrls: [],
  summary: "周末户外",
  description: "安全提示",
  location: "厦门",
  meetingPoint: "集合点",
  startAt: "2027-05-02T09:00:00+08:00",
  endAt: "2027-05-02T17:00:00+08:00",
  registrationDeadline: "2027-05-01T18:00:00+08:00",
  capacity: 20,
  priceCents: 0,
  registeredCount: 0,
  status: "DRAFT",
  currency: "CNY",
  version: 1,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
};
beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
async function render() {
  acceptAuth({
    token: "test",
    user: { id: "a", nickname: "管理员", role: "ADMIN" },
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: LoginView },
      { path: "/activities/:id/edit", component: EditorView },
      { path: "/activities", component: { template: "<div>LIST</div>" } },
    ],
  });
  await router.push("/activities/one/edit");
  await router.isReady();
  const wrapper = mount(App, {
    global: { plugins: [router], stubs: { teleport: true } },
  });
  await flushPromises();
  return { wrapper, router };
}
describe("sensitive navigation", () => {
  it("remounts editor when activity ID changes so prior content cannot update another activity", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (path: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          path.endsWith("/two")
            ? { ...activity, id: "two", title: "第二场活动" }
            : activity,
      })),
    );
    const { wrapper, router } = await render();
    expect(
      (wrapper.get('input[placeholder="活动名称"]').element as HTMLInputElement)
        .value,
    ).toBe("第一场活动");
    await router.push("/activities/two/edit");
    await flushPromises();
    expect(
      (wrapper.get('input[placeholder="活动名称"]').element as HTMLInputElement)
        .value,
    ).toBe("第二场活动");
    wrapper.unmount();
  });
  it("logout clears editor even with unsaved changes, without blocking behind leave confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => activity,
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { wrapper, router } = await render();
    await wrapper.get('input[placeholder="活动名称"]').setValue("未保存的标题");
    await wrapper
      .findAll("button")
      .find((b) => b.text() === "退出登录")
      ?.trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/login");
    expect(wrapper.find(".editor-workspace").exists()).toBe(false);
    expect(confirm).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
