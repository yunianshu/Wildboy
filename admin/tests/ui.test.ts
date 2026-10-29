import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import LoginView from "../src/views/LoginView.vue";
import ActivitiesView from "../src/views/ActivitiesView.vue";
import ConfirmDialog from "../src/components/ConfirmDialog.vue";
import { clearSession, currentUser } from "../src/api";
async function mounted(component: any, path = "/login") {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: LoginView },
      { path: "/activities", component: ActivitiesView },
      { path: "/activities/new", component: { template: "<div>NEW</div>" } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return {
    wrapper: mount(component, { global: { plugins: [router] } }),
    router,
  };
}
beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
describe("real component flows", () => {
  it("keeps login concise while retaining account labels and privacy guidance", async () => {
    const { wrapper } = await mounted(LoginView);
    expect(wrapper.get("h2").text()).toBe("管理员登录");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    expect(wrapper.find('input[autocomplete="username"]').exists()).toBe(true);
    expect(
      wrapper.find('input[autocomplete="current-password"]').exists(),
    ).toBe(true);
    expect(wrapper.get(".login-note").text()).toContain("刷新后需重新登录");
    expect(wrapper.get(".login-note").text()).toContain(
      "请勿在公共设备上展示报名名单",
    );
    wrapper.unmount();
  });
  it("shows failure and never navigates on failed login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "账号或密码错误" }),
      }),
    );
    const { wrapper, router } = await mounted(LoginView);
    await wrapper.get("input[name=username]").setValue("admin");
    await wrapper.get("input[name=password]").setValue("bad");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("账号或密码错误");
    expect(router.currentRoute.value.path).toBe("/login");
    expect(currentUser.value).toBeNull();
    wrapper.unmount();
  });
  it("authenticates and navigates only after successful admin response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          token: "t",
          user: { id: "a", nickname: "管理员", role: "ADMIN" },
        }),
      }),
    );
    const { wrapper, router } = await mounted(LoginView);
    await wrapper.get("input[name=username]").setValue("admin");
    await wrapper.get("input[name=password]").setValue("safe");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.path).toBe("/activities");
    expect(currentUser.value?.role).toBe("ADMIN");
    wrapper.unmount();
  });
  it("loads empty activities with create action and disables next page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [],
          total: 0,
          page: 0,
          size: 12,
          hasMore: false,
        }),
      }),
    );
    const { wrapper } = await mounted(ActivitiesView, "/activities");
    await flushPromises();
    expect(wrapper.text()).toContain("当前页暂无匹配活动");
    expect(wrapper.find(".workspace-note").exists()).toBe(false);
    expect(wrapper.find('a[href="/activities/new"]').exists()).toBe(true);
    expect(
      wrapper
        .findAll("button")
        .find((b) => b.text() === "下一页")
        ?.attributes("disabled"),
    ).toBeDefined();
    wrapper.unmount();
  });
  it("cancel dialog emits no confirmation and Escape cancels", async () => {
    const wrapper = mount(ConfirmDialog, {
      props: {
        title: "发布？",
        description: "检查内容",
        confirmLabel: "确认发布",
      },
      global: { stubs: { teleport: true } },
    });
    await wrapper.findAll("button")[0]?.trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(wrapper.emitted("cancel")).toHaveLength(2);
    wrapper.unmount();
  });
});
