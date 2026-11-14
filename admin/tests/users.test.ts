import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import UsersView from "../src/views/UsersView.vue";
import { acceptAuth, clearSession, currentUser } from "../src/api";
import type { AdminUser, AdminUserDetail } from "../src/types";

const user: AdminUser = {
  id: "wechat-user-1",
  nickname: "同行人小林",
  realName: "林*",
  phone: "138****8000",
  role: "USER",
  accountSource: "WECHAT",
  wechatVerified: true,
  canChangeRole: true,
  roleChangeBlockReason: null,
  version: 3,
  profileCompleted: true,
  createdAt: "2026-10-01T00:00:00Z",
  profileUpdatedAt: "2026-10-02T00:00:00Z",
  registrationCount: 5,
  confirmedRegistrationCount: 3,
  lastRegistrationAt: "2026-10-30T00:00:00Z",
};
const otherUser: AdminUser = {
  ...user,
  id: "second-user",
  nickname: "另一位用户",
};
const registration = {
  id: "registration-1",
  activityId: "activity-1",
  activityTitle: "山野同行",
  status: "CONFIRMED" as const,
  createdAt: "2026-10-29T00:00:00Z",
  participants: [
    {
      id: "participant-1",
      participantName: "林*",
      phone: "138****8000",
      idNumber: "3502**********1234",
    },
    {
      id: "participant-2",
      participantName: "陈*",
      phone: "139****9000",
      idNumber: "",
    },
  ],
};
const list = (items: AdminUser[] = [user], page = 0, total = items.length) => ({
  items,
  page,
  total,
  size: 8,
  hasMore: (page + 1) * 8 < total,
});
const detail = (target = user, history = [registration]): AdminUserDetail => ({
  user: target,
  registrations: {
    items: history,
    page: 0,
    total: history.length,
    size: 4,
    hasMore: false,
  },
});
const response = (value: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => value,
});
const wrappers: VueWrapper[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearSession();
  acceptAuth({
    token: "test-admin",
    user: {
      id: "operator",
      nickname: "正式管理员",
      role: "ADMIN",
      accountSource: "PASSWORD",
    },
  });
});
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  clearSession();
  vi.unstubAllGlobals();
});
async function render(fetcher: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetcher);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/users", component: UsersView },
      {
        path: "/activity-orders",
        component: { template: "<p>活动订单</p>" },
      },
      {
        path: "/activities/:id/registrations",
        component: { template: "<p>活动名单</p>" },
      },
    ],
  });
  await router.push("/users");
  await router.isReady();
  const wrapper = mount(UsersView, {
    global: { plugins: [router], stubs: { teleport: true } },
  });
  wrappers.push(wrapper);
  await flushPromises();
  return wrapper;
}
function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll("button").find((item) => item.text() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
async function openDetail(wrapper: VueWrapper) {
  await button(wrapper, "查看用户").trigger("click");
  await flushPromises();
}
function roleWrites(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.filter(([, options]) => options?.method === "PUT");
}
function standardFetch(target = user) {
  return vi.fn(async (path: string) =>
    response(
      path.includes(`/users/${target.id}?`) ? detail(target) : list([target]),
    ),
  );
}

describe("user management and WeChat admin roles", () => {
  it("shows API account source, role, masked profile and counts without guessing from nickname", async () => {
    const password = {
      ...user,
      id: "password",
      nickname: "微信用户",
      accountSource: "PASSWORD" as const,
      role: "ADMIN" as const,
      wechatVerified: false,
      canChangeRole: false,
    };
    const fetcher = vi.fn(async (_path: string) =>
      response(list([user, password])),
    );
    const wrapper = await render(fetcher);
    expect(wrapper.get("table").text()).toContain("微信登录");
    expect(wrapper.get("table").text()).toContain("管理员密码账号");
    expect(wrapper.get("table").text()).toContain("普通用户");
    expect(wrapper.get("table").text()).toContain("管理员");
    expect(wrapper.get("table").text()).toContain("林*");
    expect(wrapper.get("table").text()).toContain("138****8000");
    expect(wrapper.get("table").text()).toContain("有效 3 / 全部 5");
    expect(
      new URL(fetcher.mock.calls[0]![0], "http://local").searchParams.get(
        "size",
      ),
    ).toBe("8");
    expect(roleWrites(fetcher)).toHaveLength(0);
  });
  it("applies encoded search/profile/role/source filters and keeps them on pagination", async () => {
    const fetcher = vi.fn(async (_path: string) =>
      response(list([user], 0, 16)),
    );
    const wrapper = await render(fetcher);
    await button(wrapper, "筛选用户").trigger("click");
    await wrapper.get('input[name="userQuery"]').setValue(" 小林 & 同行 ");
    await wrapper.get('select[name="profile"]').setValue("COMPLETE");
    await wrapper.get('select[name="role"]').setValue("ADMIN");
    await wrapper.get('select[name="accountSource"]').setValue("WECHAT");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    await button(wrapper, "下一页").trigger("click");
    await flushPromises();
    const params = new URL(fetcher.mock.calls.at(-1)![0], "http://local")
      .searchParams;
    expect(Object.fromEntries(params)).toEqual({
      page: "1",
      size: "8",
      query: "小林 & 同行",
      profile: "COMPLETE",
      role: "ADMIN",
      accountSource: "WECHAT",
    });
    expect(wrapper.find("form").exists()).toBe(false);
  });
  it("keeps load failure distinct from empty and offers a working retry", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ message: "用户读取失败" }, 503))
      .mockResolvedValueOnce(response(list([])));
    const wrapper = await render(fetcher);
    expect(wrapper.get('[role="alert"]').text()).toContain("用户读取失败");
    expect(wrapper.text()).not.toContain("没有匹配的用户");
    await button(wrapper, "重试").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("没有匹配的用户");
    await button(wrapper, "调整筛选").trigger("click");
    expect(wrapper.find('input[name="userQuery"]').exists()).toBe(true);
  });
  it("details default to masked profile, history keeps all participants and uses four records per page", async () => {
    const history = {
      ...detail(),
      registrations: { ...detail().registrations, total: 5, hasMore: true },
    };
    const fetcher = vi.fn(async (path: string) =>
      response(path.includes(`/users/${user.id}?`) ? history : list()),
    );
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    expect(button(wrapper, "资料与权限").attributes("aria-pressed")).toBe(
      "true",
    );
    expect(wrapper.get('[aria-label="用户资料与权限"]').text()).toContain(
      "138****8000",
    );
    expect(wrapper.find('[aria-label="用户报名历史"]').exists()).toBe(false);
    await button(wrapper, "报名历史 · 5").trigger("click");
    const section = wrapper.get('[aria-label="用户报名历史"]');
    expect(section.text()).toContain("林*");
    expect(section.text()).toContain("陈*");
    expect(section.text()).toContain("2 位参与人");
    expect(section.text()).toContain("证件已脱敏");
    expect(section.text()).not.toContain("3502");
    expect(section.get("a").attributes("href")).toBe(
      "/activities/activity-1/registrations",
    );
    await wrapper
      .get('select[name="registrationStatus"]')
      .setValue("CANCELLED");
    await flushPromises();
    await wrapper
      .get('[aria-label="报名历史分页"]')
      .findAll("button")[1]!
      .trigger("click");
    await flushPromises();
    const params = new URL(fetcher.mock.calls.at(-1)![0], "http://local")
      .searchParams;
    expect(Object.fromEntries(params)).toEqual({
      page: "1",
      size: "4",
      status: "CANCELLED",
    });
    expect(roleWrites(fetcher)).toHaveLength(0);
  });
  it("shows a pending paid booking in user history and links to the exact order", async () => {
    const customer = {
      ...user,
      registrationCount: 1,
      confirmedRegistrationCount: 0,
      pendingRegistrationCount: 1,
    };
    const paidHistory: AdminUserDetail = {
      ...detail(customer),
      registrations: {
        ...detail(customer).registrations,
        items: [
          {
            ...registration,
            id: "paid-order-1",
            source: "ACTIVITY_ORDER",
            status: "PENDING_PAYMENT",
            orderStatus: "PENDING_PAYMENT",
          },
        ],
      },
    };
    const fetcher = vi.fn(async (path: string) =>
      response(
        path.includes(`/users/${user.id}?`) ? paidHistory : list([customer]),
      ),
    );
    const wrapper = await render(fetcher);
    expect(wrapper.get("tbody").text()).toMatch(
      /有效 0 \/ 全部 1\s+· 待支付 1/,
    );
    await openDetail(wrapper);
    await button(wrapper, "报名历史 · 1").trigger("click");
    const history = wrapper.get('[aria-label="用户报名历史"]');
    expect(history.text()).toContain("待支付（名额保留）");
    expect(history.text()).not.toContain("暂无匹配的报名记录");
    expect(history.get("a").attributes("href")).toBe(
      "/activity-orders?activityId=activity-1&orderId=paid-order-1",
    );
    await wrapper
      .get('select[name="registrationStatus"]')
      .setValue("PENDING_PAYMENT");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)?.[0]).toContain("status=PENDING_PAYMENT");
  });
  it.each([
    { accountSource: "PASSWORD", wechatVerified: true, canChangeRole: true },
    { accountSource: "DEMO", wechatVerified: true, canChangeRole: true },
    { accountSource: "OTHER", wechatVerified: true, canChangeRole: true },
    { accountSource: "WECHAT", wechatVerified: false, canChangeRole: true },
    {
      id: "operator",
      role: "ADMIN",
      accountSource: "WECHAT",
      wechatVerified: true,
      canChangeRole: true,
    },
  ])(
    "never offers role changes for an ineligible target: %j",
    async (change) => {
      const target = { ...user, ...change } as AdminUser;
      const fetcher = standardFetch(target);
      const wrapper = await render(fetcher);
      await openDetail(wrapper);
      expect(
        wrapper
          .findAll("button")
          .some((item) => ["设为管理员", "撤销管理员"].includes(item.text())),
      ).toBe(false);
      expect(roleWrites(fetcher)).toHaveLength(0);
    },
  );
  it("obeys API read-only eligibility for a demo actor while preserving its admin session", async () => {
    acceptAuth({
      token: "demo",
      user: {
        id: "demo-actor",
        nickname: "演示管理员",
        role: "ADMIN",
        accountSource: "DEMO",
      },
    });
    const target = {
      ...user,
      canChangeRole: false,
      roleChangeBlockReason: "ROLE_MANAGEMENT_FORBIDDEN",
    };
    const fetcher = standardFetch(target);
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    expect(wrapper.text()).toContain("当前账号只可查看用户");
    expect(
      wrapper.findAll("button").some((item) => item.text() === "设为管理员"),
    ).toBe(false);
    expect(currentUser.value?.id).toBe("demo-actor");
    expect(roleWrites(fetcher)).toHaveLength(0);
  });
  it("requires a concrete user/impact confirmation, cancel sends nothing, success submits exact version", async () => {
    const promoted = { ...user, role: "ADMIN" as const, version: 4 };
    let saved = false;
    const fetcher = vi.fn(async (path: string, options: RequestInit = {}) => {
      if (options.method === "PUT") {
        saved = true;
        return response(promoted);
      }
      return response(
        path.includes(`/users/${user.id}?`)
          ? detail()
          : list([saved ? promoted : user]),
      );
    });
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    await button(wrapper, "设为管理员").trigger("click");
    const confirm = wrapper.get('.dialog[role="dialog"]');
    expect(confirm.text()).toContain(user.nickname);
    expect(confirm.text()).toContain(user.id);
    expect(confirm.text()).toContain("活动、报名名单、商品、订单和用户权限");
    expect(confirm.text()).toContain("现有登录会话将失效");
    await button(wrapper, "返回检查").trigger("click");
    expect(roleWrites(fetcher)).toHaveLength(0);
    await button(wrapper, "设为管理员").trigger("click");
    await button(wrapper, "确认设为管理员").trigger("click");
    await flushPromises();
    const write = roleWrites(fetcher)[0]!;
    expect(write[0]).toBe(`/api/v1/admin/users/${user.id}/role`);
    expect(JSON.parse(String(write[1].body))).toEqual({
      role: "ADMIN",
      version: 3,
    });
    expect(roleWrites(fetcher)).toHaveLength(1);
    expect(wrapper.text()).toContain("需重新微信登录");
    expect(button(wrapper, "撤销管理员").exists()).toBe(true);
    expect(wrapper.find('.dialog[role="dialog"]').exists()).toBe(false);
  });
  it("revoke confirmation preserves history and demotes with the current server version", async () => {
    const target = { ...user, role: "ADMIN" as const, version: 9 };
    const fetcher = vi.fn(async (path: string, options: RequestInit = {}) =>
      response(
        options.method === "PUT"
          ? { ...user, version: 10 }
          : path.includes(`/users/${user.id}?`)
            ? detail(target)
            : list([target]),
      ),
    );
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    await button(wrapper, "撤销管理员").trigger("click");
    expect(wrapper.get('.dialog[role="dialog"]').text()).toContain(
      "资料与历史报名保留",
    );
    await button(wrapper, "确认撤销管理员").trigger("click");
    await flushPromises();
    expect(JSON.parse(String(roleWrites(fetcher)[0]![1].body))).toEqual({
      role: "USER",
      version: 9,
    });
    expect(wrapper.text()).toContain("恢复为普通用户");
  });
  it("locks duplicate confirmation and refuses dismissal during a pending role request", async () => {
    let release!: (value: unknown) => void;
    const fetcher = vi.fn((path: string, options: RequestInit = {}) =>
      options.method === "PUT"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(
            response(path.includes(`/users/${user.id}?`) ? detail() : list()),
          ),
    );
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    await button(wrapper, "设为管理员").trigger("click");
    await button(wrapper, "确认设为管理员").trigger("click");
    expect(button(wrapper, "正在处理…").attributes("disabled")).toBeDefined();
    await button(wrapper, "正在处理…").trigger("click");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await flushPromises();
    expect(wrapper.find('.dialog[role="dialog"]').exists()).toBe(true);
    expect(roleWrites(fetcher)).toHaveLength(1);
    release(response({ ...user, role: "ADMIN", version: 4 }));
    await flushPromises();
    expect(wrapper.find('.dialog[role="dialog"]').exists()).toBe(false);
  });
  it("a stale version blocks overwrite, failed reload retains that lock, successful reload requires fresh confirmation", async () => {
    let getCount = 0;
    const fetcher = vi.fn(async (path: string, options: RequestInit = {}) => {
      if (options.method === "PUT")
        return response({ code: "STALE_VERSION" }, 409);
      if (path.includes(`/users/${user.id}?`)) {
        getCount++;
        return getCount === 2
          ? response({ message: "网络断开" }, 503)
          : response(detail(getCount >= 3 ? { ...user, version: 7 } : user));
      }
      return response(list());
    });
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    await button(wrapper, "设为管理员").trigger("click");
    await button(wrapper, "确认设为管理员").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("本次未覆盖");
    expect(button(wrapper, "设为管理员").attributes("disabled")).toBeDefined();
    await button(wrapper, "设为管理员").trigger("click");
    expect(roleWrites(fetcher)).toHaveLength(1);
    await button(wrapper, "重新读取并核对").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("网络断开");
    expect(button(wrapper, "设为管理员").attributes("disabled")).toBeDefined();
    await button(wrapper, "重新读取并核对").trigger("click");
    await flushPromises();
    expect(
      button(wrapper, "设为管理员").attributes("disabled"),
    ).toBeUndefined();
    expect(roleWrites(fetcher)).toHaveLength(1);
    await button(wrapper, "设为管理员").trigger("click");
    await button(wrapper, "确认设为管理员").trigger("click");
    await flushPromises();
    expect(JSON.parse(String(roleWrites(fetcher)[1]![1].body)).version).toBe(7);
    const getOptions = fetcher.mock.calls
      .filter(([path]) => path.includes(`/users/${user.id}?`))
      .at(-1)![1];
    expect(getOptions?.cache).toBe("no-store");
  });
  it.each(["network", "server"])(
    "unknown %s outcome never reports success or blindly retries",
    async (mode) => {
      const fetcher = vi.fn(async (path: string, options: RequestInit = {}) => {
        if (options.method === "PUT") {
          if (mode === "network") throw new TypeError("network down");
          return response({ message: "服务不可用" }, 503);
        }
        return response(
          path.includes(`/users/${user.id}?`) ? detail() : list(),
        );
      });
      const wrapper = await render(fetcher);
      await openDetail(wrapper);
      await button(wrapper, "设为管理员").trigger("click");
      await button(wrapper, "确认设为管理员").trigger("click");
      await flushPromises();
      expect(wrapper.text()).toContain("结果尚未确认");
      expect(wrapper.find(".success-box").exists()).toBe(false);
      await button(wrapper, "设为管理员").trigger("click");
      expect(roleWrites(fetcher)).toHaveLength(1);
    },
  );
  it("role-management-only denial keeps normal administrator access and shows read-only recovery", async () => {
    const fetcher = vi.fn(async (path: string, options: RequestInit = {}) =>
      options.method === "PUT"
        ? response(
            {
              code: "ROLE_MANAGEMENT_FORBIDDEN",
              message: "请使用正式管理员账号管理权限",
            },
            403,
          )
        : response(path.includes(`/users/${user.id}?`) ? detail() : list()),
    );
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    await button(wrapper, "设为管理员").trigger("click");
    await button(wrapper, "确认设为管理员").trigger("click");
    await flushPromises();
    expect(currentUser.value?.role).toBe("ADMIN");
    expect(wrapper.text()).toContain("当前账号只可查看用户");
    expect(
      wrapper.findAll("button").some((item) => item.text() === "设为管理员"),
    ).toBe(false);
    expect(roleWrites(fetcher)).toHaveLength(1);
  });
  it.each([401, 403])(
    "general %i permission failure clears profile/history and current session",
    async (status) => {
      let denied = false;
      const fetcher = vi.fn(async (path: string) =>
        path.includes(`/users/${user.id}?`)
          ? denied
            ? response({ code: "FORBIDDEN", message: "权限已失效" }, status)
            : response(detail())
          : response(list()),
      );
      const wrapper = await render(fetcher);
      await openDetail(wrapper);
      denied = true;
      await button(wrapper, "刷新资料").trigger("click");
      await flushPromises();
      expect(currentUser.value).toBeNull();
      expect(wrapper.text()).not.toContain(user.nickname);
      expect(wrapper.text()).not.toContain(user.phone);
      expect(wrapper.find('[aria-label="用户详情"]').exists()).toBe(false);
    },
  );
  it("closing and opening another user does not let an older detail response replace the new one", async () => {
    let release!: (value: unknown) => void;
    const fetcher = vi.fn((path: string) =>
      path.includes(`/users/${user.id}?`)
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(
            response(
              path.includes(`/users/${otherUser.id}?`)
                ? detail(otherUser)
                : list([user, otherUser]),
            ),
          ),
    );
    const wrapper = await render(fetcher);
    await button(wrapper, "查看用户").trigger("click");
    await button(wrapper, "关闭").trigger("click");
    await wrapper
      .findAll("button")
      .filter((item) => item.text() === "查看用户")[1]!
      .trigger("click");
    await flushPromises();
    release(response(detail()));
    await flushPromises();
    expect(wrapper.get('[aria-label="用户详情"]').text()).toContain(
      otherUser.nickname,
    );
    expect(wrapper.get('[aria-label="用户详情"]').text()).not.toContain(
      user.nickname,
    );
  });
  it("session replacement clears pending intent, filters and late results without changing the new actor", async () => {
    let release!: (value: unknown) => void;
    const fetcher = vi.fn((path: string, options: RequestInit = {}) =>
      options.method === "PUT"
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Promise.resolve(
            response(
              currentUser.value?.id === "next-actor"
                ? list([])
                : path.includes(`/users/${user.id}?`)
                  ? detail()
                  : list(),
            ),
          ),
    );
    const wrapper = await render(fetcher);
    await openDetail(wrapper);
    await button(wrapper, "设为管理员").trigger("click");
    await button(wrapper, "确认设为管理员").trigger("click");
    acceptAuth({
      token: "new-token",
      user: { id: "next-actor", nickname: "新管理员", role: "ADMIN" },
    });
    release(response({ ...user, role: "ADMIN", version: 4 }));
    await flushPromises();
    expect(currentUser.value?.id).toBe("next-actor");
    expect(wrapper.find('[aria-label="用户详情"]').exists()).toBe(false);
    expect(wrapper.text()).not.toContain(user.nickname);
    expect(wrapper.find(".success-box").exists()).toBe(false);
    expect(roleWrites(fetcher)).toHaveLength(1);
  });
});
