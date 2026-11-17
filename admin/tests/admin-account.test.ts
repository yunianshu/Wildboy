import * as confirmation from "../src/confirm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import AdminAccountView from "../src/views/AdminAccountView.vue";
import { acceptAuth, clearSession, currentUser } from "../src/api";
const dto = {
  configured: false,
  username: "",
  version: 0,
  canConfigure: true,
  configurationBlockReason: null,
};
const response = (data: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearSession();
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((w) => w.unmount());
  clearSession();
  vi.unstubAllGlobals();
});
async function render(fetcher: any) {
  vi.stubGlobal("fetch", fetcher);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/settings/admin-account", component: AdminAccountView },
      { path: "/login", component: { template: "<p>登录</p>" } },
      { path: "/activities", component: { template: "<p>活动</p>" } },
    ],
  });
  await router.push("/settings/admin-account");
  await router.isReady();
  const w = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router], stubs: { teleport: true } } },
  );
  wrappers.push(w);
  await flushPromises();
  return { w, router };
}
async function fill(w: VueWrapper, password = "ExamplePassword123") {
  if (!w.find('input[name="adminUsername"]').exists())
    await w
      .findAll("button")
      .find((b) => b.text() === "修改账号")!
      .trigger("click");
  await w.get('input[name="adminUsername"]').setValue("new-admin");
  await w.get('input[name="currentPassword"]').setValue("CurrentExample123");
  await w.get('input[name="newPassword"]').setValue(password);
  await w.get('input[name="confirmPassword"]').setValue(password);
}
describe("persistent admin account settings", () => {
  it("does not expose a writable form to a demo password-ineligible identity", async () => {
    const f = vi.fn(async () =>
      response({
        ...dto,
        canConfigure: false,
        configurationBlockReason: "PASSWORD_LOGIN_REQUIRED",
      }),
    );
    const { w } = await render(f);
    expect(w.find("form").exists()).toBe(false);
    expect(w.find("input").exists()).toBe(false);
    expect(w.text()).toContain("演示身份无法设置");
    expect(w.text()).toContain("使用密码登录");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("a settings-load failure has retry but no fake configuration or editable form", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "暂不可用" }, 503))
      .mockResolvedValueOnce(response(dto));
    const { w } = await render(f);
    expect(w.get('[role="alert"]').text()).toContain("暂不可用");
    expect(w.find("form").exists()).toBe(false);
    await w
      .findAll("button")
      .find((b) => b.text() === "重新读取")!
      .trigger("click");
    await flushPromises();
    expect(w.find("form").exists()).toBe(false);
    await fill(w);
    expect(w.find("form").exists()).toBe(true);
    expect(w.text()).toContain("当前未配置");
    expect(w.text()).not.toContain("已更新");
  });
  it("validates confirmation and UTF-8 password bytes before sending any credential mutation", async () => {
    const f = vi.fn(async () => response(dto));
    const { w } = await render(f);
    await fill(w);
    await w
      .get('input[name="confirmPassword"]')
      .setValue("DifferentPassword123");
    await w.get("form").trigger("submit");
    expect(w.get('[role="alert"]').text()).toContain("不一致");
    await fill(w, "A123456789" + "密".repeat(22));
    await w.get("form").trigger("submit");
    expect(w.get('[role="alert"]').text()).toContain("72 字节");
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("sends the exact server DTO, preserves the current session and clears all passwords only on success", async () => {
    const storage = vi.spyOn(Storage.prototype, "setItem");
    const f = vi.fn(async (_: string, o: RequestInit = {}) =>
      response(
        o?.method === "PUT"
          ? { ...dto, configured: true, username: "new-admin", version: 1 }
          : dto,
      ),
    );
    const { w } = await render(f);
    await fill(w);
    await w.get("form").trigger("submit");
    await flushPromises();
    const call = f.mock.calls.find(([, o]) => o?.method === "PUT")!;
    expect(call[0]).toBe("/api/v1/admin/settings/admin-account");
    expect(JSON.parse(String(call[1]!.body))).toEqual({
      username: "new-admin",
      currentPassword: "CurrentExample123",
      newPassword: "ExamplePassword123",
      version: 0,
    });
    expect(currentUser.value?.id).toBe("admin");
    expect(storage).not.toHaveBeenCalled();
    expect(w.find("#admin-account-form").exists()).toBe(false);
    for (const field of ["currentPassword", "newPassword", "confirmPassword"])
      expect(w.find('input[name="' + field + '"]').exists()).toBe(false);
    expect(w.text()).toContain("其他管理员登录已退出");
    expect(w.text()).toContain("入口已启用");
  });
  it("current-password failure preserves the session and inputs without reporting success", async () => {
    const f = vi.fn(async (_: string, o: RequestInit = {}) =>
      o?.method === "PUT"
        ? response(
            {
              code: "CURRENT_PASSWORD_INVALID",
              message: "当前管理员密码不正确",
            },
            400,
          )
        : response(dto),
    );
    const { w } = await render(f);
    await fill(w);
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain("密码不正确");
    expect(currentUser.value?.id).toBe("admin");
    expect(
      (w.get('input[name="newPassword"]').element as HTMLInputElement).value,
    ).toBe("ExamplePassword123");
    expect(w.find(".success-box").exists()).toBe(false);
  });
  it("version conflict retains input and prevents overwrite attempts until reloaded", async () => {
    const f = vi.fn(async (_: string, o: RequestInit = {}) =>
      o?.method === "PUT"
        ? response({ code: "STALE_VERSION" }, 409)
        : response(dto),
    );
    const { w } = await render(f);
    await fill(w);
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain("不会自动覆盖");
    expect(
      w
        .findAll("button")
        .find((b) => b.text() === "验证并保存")!
        .attributes("disabled"),
    ).toBeDefined();
    await w.get("form").trigger("submit");
    expect(f.mock.calls.filter(([, o]) => o?.method === "PUT")).toHaveLength(1);
  });
  it("rate limit failure is visible and never replays a password request automatically", async () => {
    const f = vi.fn(async (_: string, o: RequestInit = {}) =>
      o?.method === "PUT"
        ? response({ code: "RATE_LIMITED" }, 429)
        : response(dto),
    );
    const { w } = await render(f);
    await fill(w);
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain("过于频繁");
    expect(f.mock.calls.filter(([, o]) => o?.method === "PUT")).toHaveLength(1);
    expect(
      (w.get('input[name="newPassword"]').element as HTMLInputElement).value,
    ).toBe("ExamplePassword123");
  });
  it("a late save after logout cannot repopulate credentials or show success", async () => {
    let release: (v: unknown) => void = () => {};
    const f = vi.fn((_: string, o: RequestInit = {}) =>
      o?.method === "PUT"
        ? new Promise((r) => (release = r))
        : Promise.resolve(response(dto)),
    );
    const { w } = await render(f);
    await fill(w);
    await w.get("form").trigger("submit");
    clearSession();
    release(
      response({ ...dto, configured: true, username: "new-admin", version: 1 }),
    );
    await flushPromises();
    expect(w.find("input").exists()).toBe(false);
    expect(w.find(".success-box").exists()).toBe(false);
    expect(w.text()).not.toContain("new-admin");
  });
  it("declining navigation preserves an unsaved account draft", async () => {
    const f = vi.fn(async () => response(dto));
    const { w, router } = await render(f);
    await fill(w);
    vi.spyOn(confirmation, "askConfirm").mockResolvedValue(false);
    await router.push("/activities");
    expect(router.currentRoute.value.path).toBe("/settings/admin-account");
    expect(
      (w.get('input[name="adminUsername"]').element as HTMLInputElement).value,
    ).toBe("new-admin");
  });
});
