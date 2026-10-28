import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import RosterView from "../src/views/RosterView.vue";
import { acceptAuth, clearSession } from "../src/api";

const activity = {
  id: "activity-1",
  title: "多人活动",
  category: "WEEKLY",
  coverUrl: "/assets/category-weekly.jpg",
  galleryUrls: [],
  summary: "测试",
  description: "测试",
  location: "厦门",
  meetingPoint: "集合点",
  startAt: "2099-01-01T09:00:00+08:00",
  endAt: "2099-01-01T12:00:00+08:00",
  registrationDeadline: "2098-12-31T18:00:00+08:00",
  capacity: 10,
  registeredCount: 2,
  status: "PUBLISHED",
  priceCents: 0,
  currency: "CNY",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};
const registration = {
  id: "registration-1",
  activityId: activity.id,
  activityTitle: activity.title,
  status: "CONFIRMED",
  createdAt: "2026-01-01T00:00:00Z",
  participants: [
    {
      id: "participant-1",
      participantName: "第一位",
      idNumber: "11010519491231002X",
      phone: "13800000000",
    },
    {
      id: "participant-2",
      participantName: "第二位",
      idNumber: "110105194912310038",
      phone: "13800000001",
    },
  ],
};

beforeEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("group roster", () => {
  it("renders every participant with masked identity and reveals on demand", async () => {
    acceptAuth({
      token: "test",
      user: { id: "admin", nickname: "管理员", role: "ADMIN" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (path: string) => ({
        ok: true,
        status: 200,
        json: async () =>
          path.endsWith("/reveal") ? registration.participants[0] : path.includes("/registrations?")
            ? {
                items: [registration],
                total: 1,
                page: 0,
                size: 20,
                hasMore: false,
              }
            : activity,
      })),
    );
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/activities/:id/roster", component: RosterView }],
    });
    await router.push("/activities/activity-1/roster");
    await router.isReady();
    const wrapper = mount(RosterView, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.text()).toContain("第一位");
    expect(wrapper.text()).toContain("第二位");
    expect(wrapper.text()).toContain("本单 2 人");
    expect(wrapper.text()).not.toContain("11010519491231002X");
    expect(wrapper.text()).not.toContain("13800000000");
    await wrapper.find(".phone-toggle").trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("11010519491231002X");
    expect(wrapper.text()).toContain("13800000000");
    wrapper.unmount();
  });
  it("ignores a late identity reveal after administrator logout", async () => {
    acceptAuth({token:"test",user:{id:"admin",nickname:"管理员",role:"ADMIN"}});
    let finish: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (path: string) => {
      if (path.endsWith("/reveal")) return await new Promise(resolve => { finish=resolve; });
      return {ok:true,status:200,json:async()=>path.includes("/registrations?") ? {items:[registration],total:1,page:0,size:20,hasMore:false} : activity};
    }));
    const router=createRouter({history:createMemoryHistory(),routes:[{path:"/activities/:id/roster",component:RosterView}]});
    await router.push("/activities/activity-1/roster"); await router.isReady();
    const wrapper=mount(RosterView,{global:{plugins:[router]}}); await flushPromises();
    await wrapper.find(".phone-toggle").trigger("click");
    clearSession();
    finish({ok:true,status:200,json:async()=>registration.participants[0]});
    await flushPromises();
    expect(wrapper.text()).not.toContain("11010519491231002X");
    expect(wrapper.text()).not.toContain("第一位");
    wrapper.unmount();
  });

});
