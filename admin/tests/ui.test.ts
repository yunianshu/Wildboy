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
  it("renders activity prices, paid order drawer triggers and free roster links", async () => {
    const rows = [
      {
        id: "paid",
        title: "收费路线",
        location: "山脊",
        coverUrl: "/cover.png",
        category: "WEEKLY",
        startAt: "2026-12-01T08:00:00+08:00",
        priceCents: 6801,
        registeredCount: 3,
        capacity: 20,
        pendingPaymentCount: 2,
        status: "PUBLISHED",
      },
      {
        id: "free",
        title: "免费路线",
        location: "公园",
        coverUrl: "/cover.png",
        category: "WEEKLY",
        startAt: "2026-12-02T08:00:00+08:00",
        priceCents: 0,
        registeredCount: 5,
        capacity: 10,
        pendingPaymentCount: 9,
        status: "DRAFT",
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: rows,
          total: 2,
          page: 0,
          size: 8,
          hasMore: false,
        }),
      }),
    );
    const { wrapper } = await mounted(ActivitiesView, "/activities");
    await flushPromises();
    expect(wrapper.findAll("table thead th")).toHaveLength(7);
    const records = wrapper.findAll("tbody tr");
    expect(records).toHaveLength(2);
    expect(records[0].text()).toContain("¥68.01");
    expect(records[0].text()).toContain("待支付 2 人");
    expect(records[0].get('button[aria-haspopup="dialog"]').text()).toBe("订单");
    expect(records[0].find('a[href="/activity-orders?activityId=paid"]').exists()).toBe(false);
    expect(
      records[1].find('a[href="/activities/free/registrations"]').exists(),
    ).toBe(true);
    expect(records[1].text()).not.toContain("待支付");
    expect(wrapper.get("h1").text()).toBe("活动管理");
    wrapper.unmount();
  });

  it("keeps login concise while retaining account labels and privacy guidance", async () => {
    const { wrapper } = await mounted(LoginView);
    expect(wrapper.get("h2").text()).toBe("管理员登录");
    expect(wrapper.find(".eyebrow").exists()).toBe(false);
    expect(wrapper.find('input[autocomplete="username"]').exists()).toBe(true);
    const password = wrapper.get('input[autocomplete="current-password"]');
    const visibility = wrapper.get('button[aria-controls="login-password"]');
    expect(password.attributes("type")).toBe("password");
    expect(visibility.attributes("aria-label")).toBe("显示密码");
    expect(visibility.text()).toBe("");
    await visibility.trigger("click");
    expect(password.attributes("type")).toBe("text");
    expect(visibility.attributes("aria-label")).toBe("隐藏密码");
    await visibility.trigger("click");
    expect(password.attributes("type")).toBe("password");
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
  it("clears a filtered empty activity list in one click and hides unnecessary pagination", async () => {
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
    const { wrapper, router } = await mounted(
      ActivitiesView,
      "/activities?status=PUBLISHED&title=测试&upcomingFull=1&page=3",
    );
    await flushPromises();
    expect(wrapper.text()).toContain("暂无匹配活动");
    expect(wrapper.text()).not.toContain("即将开始且满员");
    const url = new URL(
      String(vi.mocked(fetch).mock.calls[0][0]),
      "https://example.test",
    );
    expect(url.searchParams.get("upcomingFull")).toBeNull();
    expect(url.searchParams.get("status")).toBe("PUBLISHED");
    expect(url.searchParams.get("title")).toBe("测试");
    expect(url.searchParams.get("page")).toBe("0");
    expect(wrapper.find(".workspace-note").exists()).toBe(false);
    expect(wrapper.find('a[href="/activities/new"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="活动分页"]').exists()).toBe(false);
    const actions = wrapper
      .findAll("button")
      .filter((button) => button.text() === "清除筛选");
    expect(actions).toHaveLength(1);
    await actions[0].trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query.upcomingFull).toBeUndefined();
    expect(wrapper.get(".ui-state").text()).toBe("暂无活动");
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
