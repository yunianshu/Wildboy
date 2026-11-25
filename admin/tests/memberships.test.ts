import * as confirmation from "../src/confirm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import MembershipsView from "../src/views/MembershipsView.vue";
import { acceptAuth, clearSession } from "../src/api";
const baseTier = {
  id: "tier-1",
  name: "白银",
  sortOrder: 0,
  enabled: true,
  version: 3,
  rules: ["ACTIVITY", "SHOP"].map((scope) => ({
    scope,
    enabled: false,
    pricingMode: "DISCOUNT",
    pricingValue: 10000,
  })),
};
const baseUser = {
  id: "user-1",
  nickname: "小野",
  customerType: "GUEST",
  tierId: null as string | null,
  tierName: null as string | null,
  tierEnabled: false,
  version: 2,
  createdAt: "2026-11-01T00:00:00Z",
};
let tier: typeof baseTier,
  user: typeof baseUser,
  fetcher: ReturnType<typeof vi.fn>,
  wrappers: VueWrapper[];
function button(w: VueWrapper, label: string) {
  return w.findAll("button").find((b) => b.text() === label)!;
}
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => data,
});
const writes = () => fetcher.mock.calls.filter((c: any) => c[1]?.method);
beforeEach(() => {
  vi.restoreAllMocks();
  clearSession();
  wrappers = [];
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
  vi.spyOn(confirmation, "askConfirm").mockResolvedValue(true);
  tier = structuredClone(baseTier);
  user = { ...baseUser };
  fetcher = vi.fn(async (url: string, options: any = {}) => {
    if (options.method) {
      const body = JSON.parse(options.body);
      if (url.includes("/tiers")) {
        tier = { ...tier, ...body, version: tier.version + 1 };
        return ok(structuredClone(tier));
      }
      user = { ...user, ...body, version: user.version + 1 };
      return ok({ ...user });
    }
    if (url.endsWith("/tiers")) return ok([structuredClone(tier)]);
    return ok({
      items: [{ ...user }],
      page: 0,
      size: 20,
      total: 21,
      hasMore: !url.includes("page=1"),
    });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => {
  wrappers.forEach((w) => w.unmount());
  vi.unstubAllGlobals();
});
async function view() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: MembershipsView },
      { path: "/other", component: { template: "<div>other</div>" } },
      { path: "/login", component: { template: "<div>login</div>" } },
    ],
  });
  await router.push("/");
  const w = mount(
    { template: "<RouterView />" },
    { global: { plugins: [router] } },
  );
  wrappers.push(w);
  await flushPromises();
  return { w, router };
}
async function submit(w: VueWrapper) {
  await w.get('[role="dialog"] form').trigger("submit");
  await flushPromises();
}
describe("membership administration", () => {
  it("loads real users and paginates using the applied server search", async () => {
    const { w } = await view();
    expect(w.text()).toContain("小野");
    await w.get('[aria-label="搜索用户"]').setValue("小野 &");
    await w.get('[aria-label="筛选身份"]').setValue("MEMBER");
    await w.get("form").trigger("submit");
    await flushPromises();
    expect(
      fetcher.mock.calls.some((c: any) =>
        c[0].includes(
          "query=%E5%B0%8F%E9%87%8E+%26&customerType=MEMBER&page=0",
        ),
      ),
    ).toBe(true);
    await w.get('[aria-label="搜索用户"]').setValue("未提交");
    await button(w, "下一页").trigger("click");
    await flushPromises();
    expect(fetcher.mock.calls.at(-1)![0]).toContain(
      "query=%E5%B0%8F%E9%87%8E+%26&customerType=MEMBER&page=1",
    );
    expect(button(w, "下一页").attributes("disabled")).toBeDefined();
  });
  it("creates disabled-by-default independent rules with clear yuan and discount conversion", async () => {
    const { w } = await view();
    await button(w, "新建等级").trigger("click");
    await w.get('[aria-label="等级名称"]').setValue("黄金");
    for (const scope of ["ACTIVITY", "SHOP"])
      expect(
        (w.get(`[aria-label="${scope}启用优惠"]`).element as HTMLInputElement)
          .checked,
      ).toBe(false);
    await w.get('[aria-label="ACTIVITY启用优惠"]').setValue(true);
    await w.get('[aria-label="ACTIVITY定价值"]').setValue("8");
    await submit(w);
    expect(w.text()).toContain("请选择活动多人优惠范围");
    expect(writes()).toHaveLength(0);
    await w.get('[aria-label="活动多人优惠范围"]').setValue("ACCOUNT_ALL");
    await w.get('[aria-label="SHOP启用优惠"]').setValue(true);
    await w.get('[aria-label="SHOP定价方式"]').setValue("FIXED");
    await w.get('[aria-label="SHOP定价值"]').setValue("12.34");
    expect(w.text()).not.toContain("课程");
    expect(w.find('[aria-label^="COURSE"]').exists()).toBe(false);
    expect(w.findAll(".rule-card")).toHaveLength(2);
    await submit(w);
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].method).toBe("POST");
    expect(JSON.parse(writes()[0][1].body).rules).toHaveLength(2);
    expect(JSON.parse(writes()[0][1].body)).toMatchObject({
      version: null,
      rules: [
        {
          scope: "ACTIVITY",
          participantPricing: "ACCOUNT_ALL",
          enabled: true,
          pricingMode: "DISCOUNT",
          pricingValue: 8000,
        },
        {
          scope: "SHOP",
          enabled: true,
          pricingMode: "FIXED",
          pricingValue: 1234,
        },
      ],
    });
  });
  it.each([
    ["ACTIVITY", "DISCOUNT", "8", 8000],
    ["ACTIVITY", "FIXED", "12.34", 1234],
    ["ACTIVITY", "REDUCTION", "5", 500],
    ["SHOP", "DISCOUNT", "8.5", 8500],
    ["SHOP", "FIXED", "12.34", 1234],
    ["SHOP", "REDUCTION", "5", 500],
  ])(
    "saves %s %s pricing independently without introducing other scopes",
    async (scope, mode, value, expected) => {
      const { w } = await view();
      expect(w.text()).not.toContain("课程");
      await button(w, "编辑等级").trigger("click");
      await w.get(`[aria-label="${scope}启用优惠"]`).setValue(true);
      if (scope === "ACTIVITY")
        await w.get('[aria-label="活动多人优惠范围"]').setValue("ONE_BENEFIT");
      await w.get(`[aria-label="${scope}定价方式"]`).setValue(mode);
      await w.get(`[aria-label="${scope}定价值"]`).setValue(value);
      await submit(w);
      expect(writes()).toHaveLength(1);
      expect(writes()[0][1].method).toBe("PUT");
      const payload = JSON.parse(writes()[0][1].body);
      expect(payload.version).toBe(3);
      expect(payload.rules).toHaveLength(2);
      expect(payload.rules.map((r: { scope: string }) => r.scope)).toEqual([
        "ACTIVITY",
        "SHOP",
      ]);
      expect(
        payload.rules.find((r: { scope: string }) => r.scope === scope),
      ).toEqual({
        scope,
        enabled: true,
        pricingMode: mode,
        pricingValue: expected,
        participantPricing: scope === "ACTIVITY" ? "ONE_BENEFIT" : null,
      });
      expect(
        payload.rules.find((r: { scope: string }) => r.scope !== scope),
      ).toEqual({
        scope: scope === "ACTIVITY" ? "SHOP" : "ACTIVITY",
        enabled: false,
        pricingMode: "DISCOUNT",
        pricingValue: 10000,
        participantPricing: null,
      });
      expect(w.text()).not.toContain("课程");
      expect(w.findAll(".rule-card")).toHaveLength(2);
    },
  );
  it("validates discount range, amounts and disabled tier membership", async () => {
    tier.enabled = false;
    const { w } = await view();
    await button(w, "编辑等级").trigger("click");
    await w.get('[aria-label="SHOP启用优惠"]').setValue(true);
    await w.get('[aria-label="SHOP定价值"]').setValue(11);
    await submit(w);
    expect(w.text()).toContain("请输入 0.001–10 折");
    await w.get('[aria-label="SHOP定价方式"]').setValue("FIXED");
    await w.get('[aria-label="SHOP定价值"]').setValue("1.001");
    await submit(w);
    expect(w.text()).toContain("最多两位小数");
    expect(writes()).toHaveLength(0);
    await button(w, "关闭").trigger("click");
    await button(w, "编辑身份").trigger("click");
    await w.get('[aria-label="用户身份"]').setValue("MEMBER");
    await submit(w);
    expect(w.text()).toContain("会员必须选择启用的等级");
    expect(
      w.get('option[value="tier-1"]').attributes("disabled"),
    ).toBeDefined();
    expect(writes()).toHaveLength(0);
  });
  it("assigns an enabled membership, then clears it for a leader without role escalation", async () => {
    const { w } = await view();
    await button(w, "编辑身份").trigger("click");
    await w.get('[aria-label="用户身份"]').setValue("MEMBER");
    await w.get('[aria-label="会员等级"]').setValue("tier-1");
    await submit(w);
    expect(JSON.parse(writes()[0][1].body)).toEqual({
      customerType: "MEMBER",
      tierId: "tier-1",
      version: 2,
    });
    await w.get('[aria-label="用户身份"]').setValue("LEADER");
    await submit(w);
    expect(JSON.parse(writes()[1][1].body)).toEqual({
      customerType: "LEADER",
      tierId: null,
      version: 3,
    });
    expect(w.text()).toContain("领队不获得管理员权限");
  });
  it("saves tier disable and uses optimistic version without an extra wizard", async () => {
    const { w } = await view();
    await button(w, "编辑等级").trigger("click");
    await w.get('[aria-label="启用等级"]').setValue(false);
    await submit(w);
    expect(writes()[0][1].method).toBe("PUT");
    expect(JSON.parse(writes()[0][1].body)).toMatchObject({
      enabled: false,
      version: 3,
    });
  });
  it("blocks overwrite on conflict and reloads the current version before retry", async () => {
    const { w } = await view();
    await button(w, "编辑等级").trigger("click");
    await w.get('[aria-label="等级名称"]').setValue("本地名称");
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({}),
    });
    await submit(w);
    expect(w.text()).toContain("不会自动覆盖");
    await submit(w);
    expect(writes()).toHaveLength(1);
    tier.version = 8;
    tier.name = "远程名称";
    await button(w, "采用最新资料").trigger("click");
    await flushPromises();
    expect(
      (w.get('[aria-label="等级名称"]').element as HTMLInputElement).value,
    ).toBe("远程名称");
    await submit(w);
    expect(JSON.parse(writes()[1][1].body).version).toBe(8);
  });
  it("keeps the pricing draft editable when a tier name already exists", async () => {
    const { w } = await view();
    await button(w, "新建等级").trigger("click");
    const name = w.get('[aria-label="等级名称"]');
    await name.setValue("重名等级");
    await w.get('[aria-label="SHOP启用优惠"]').setValue(true);
    await w.get('[aria-label="SHOP定价值"]').setValue("8.5");
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({
        code: "TIER_NAME_EXISTS",
        message: "等级名称已存在",
      }),
    });
    await submit(w);
    expect(w.get('[role="dialog"] [role="alert"]').text()).toContain(
      "等级名称已存在",
    );
    expect(
      w.get('[role="dialog"] fieldset').attributes("disabled"),
    ).toBeUndefined();
    await name.setValue("修正后的等级");
    await submit(w);
    expect(JSON.parse(writes()[1][1].body)).toMatchObject({
      name: "修正后的等级",
      rules: expect.arrayContaining([
        {
          scope: "SHOP",
          enabled: true,
          pricingMode: "DISCOUNT",
          pricingValue: 8500,
          participantPricing: null,
        },
      ]),
    });
  });
  it("preserves dirty edits on cancelled close, route navigation and page unload", async () => {
    const { w, router } = await view();
    await button(w, "编辑等级").trigger("click");
    await w.get('[aria-label="等级名称"]').setValue("未保存");
    vi.mocked(confirmation.askConfirm).mockResolvedValue(false);
    await button(w, "关闭").trigger("click");
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    await router.push("/other");
    expect(router.currentRoute.value.path).toBe("/");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    vi.mocked(confirmation.askConfirm).mockResolvedValue(true);
    await router.push("/other");
    expect(router.currentRoute.value.path).toBe("/other");
  });
  it("prevents duplicate saves, blocks close while saving and discards late logout responses", async () => {
    const { w } = await view();
    await button(w, "编辑身份").trigger("click");
    let finish!: (value: any) => void;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await w.get('[role="dialog"] form').trigger("submit");
    await w.get('[role="dialog"] form').trigger("submit");
    expect(writes()).toHaveLength(1);
    await button(w, "关闭").trigger("click");
    expect(w.find('[role="dialog"]').exists()).toBe(true);
    clearSession();
    await flushPromises();
    finish(ok(user));
    await flushPromises();
    expect(w.find('[role="dialog"]').exists()).toBe(false);
    expect(w.find("tbody").exists()).toBe(false);
  });
  it("shows a permission error, retries failed loading, and clears data on expiry", async () => {
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    const { w } = await view();
    expect(w.text()).toContain("没有执行此操作的权限");
    window.dispatchEvent(new Event("focus"));
    await flushPromises();
    expect(w.text()).toContain("小野");
    await button(w, "编辑身份").trigger("click");
    fetcher.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await submit(w);
    expect(w.find("tbody").exists()).toBe(false);
    expect(w.find('[role="dialog"]').exists()).toBe(false);
  });
});
