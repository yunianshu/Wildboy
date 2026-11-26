import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import TemplatesView from "../src/views/TemplatesView.vue";
import { acceptAuth, clearSession } from "../src/api";

beforeEach(() => {
  acceptAuth({
    token: "test",
    user: { id: "admin", nickname: "管理员", role: "ADMIN" },
  });
});
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
const button = (w: any, text: string) =>
  w.findAll("button").find((b: any) => b.text() === text)!;

it("contains template form focus and Escape closes without creating a template", async () => {
  const fetcher = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ items: [], hasMore: false }),
  }));
  vi.stubGlobal("fetch", fetcher);
  const w = mount(TemplatesView, {
    attachTo: document.body,
    global: { stubs: { RouterLink: true } },
  });
  await flushPromises();
  const open = button(w, "新建模板");
  open.element.focus();
  await open.trigger("click");
  await flushPromises();
  const dialog = w.get('[role="dialog"]');
  expect(dialog.element.contains(document.activeElement)).toBe(true);
  button(w, "保存").element.focus();
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
  );
  expect(document.activeElement?.getAttribute("aria-label")).toBe("关闭弹窗");
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  await flushPromises();
  expect(w.find('[role="dialog"]').exists()).toBe(false);
  expect(document.activeElement).toBe(open.element);
  expect(fetcher.mock.calls).toHaveLength(2);
  w.unmount();
});

it("a template load failure stays an error rather than an empty catalogue", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ message: "模板服务暂不可用" }),
    })),
  );
  const w = mount(TemplatesView, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain("模板服务暂不可用");
  expect(w.text()).not.toContain("暂无模板");
  w.unmount();
});

it("views the selected saved template without writing or generating a draft", async () => {
  const activity = {
    title: "山海徒步",
    category: "WEEKLY",
    coverUrl: "/assets/cover.jpg",
    galleryUrls: ["/assets/route.jpg"],
    summary: "沿步道徒步",
    description: "请带水与雨衣",
    location: "厦门",
    meetingPoint: "地铁站",
    boardingPoints: ["会展中心"],
    navigationPoints: [{ id: "point", label: "东门", address: "环岛路" }],
    capacity: 12,
    priceCents: 12000,
    identityRequired: true,
    startAt: "2027-01-10T09:00:00+08:00",
    endAt: "2027-01-10T11:30:00+08:00",
    registrationDeadline: "2027-01-09T09:00:00+08:00",
  };
  const fetcher = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      items: [
        { id: "one", name: "沿海模板", activity, version: 2 },
        {
          id: "two",
          name: "第二模板",
          activity: { ...activity, priceCents: 0 },
          version: 1,
        },
      ],
      hasMore: false,
    }),
  }));
  vi.stubGlobal("fetch", fetcher);
  const w = mount(TemplatesView, {
    attachTo: document.body,
    global: { stubs: { RouterLink: true } },
  });
  await flushPromises();
  const previews = w.findAll("button").filter((b) => b.text() === "查看模板");
  previews[1]!.element.focus();
  await previews[1]!.trigger("click");
  const detail = w.get('[role="dialog"]');
  for (const text of [
    "模板详情：第二模板",
    "厦门",
    "地铁站",
    "会展中心",
    "东门 · 环岛路",
    "12 人",
    "免费报名",
    "2 小时 30 分钟",
    "24 小时",
    "请带水与雨衣",
  ])
    expect(detail.text()).toContain(text);
  expect(detail.get('img[alt="活动封面"]').attributes("src")).toBe(
    "/assets/cover.jpg",
  );
  expect(detail.find("form").exists()).toBe(false);
  await button(w, "关闭").trigger("click");
  await flushPromises();
  expect(w.find('[role="dialog"]').exists()).toBe(false);
  expect(document.activeElement).toBe(previews[1]!.element);
  await previews[0]!.trigger("click");
  expect(w.get('[role="dialog"]').text()).toContain("¥120.00 / 人");
  clearSession();
  await flushPromises();
  expect(w.find('[role="dialog"]').exists()).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  w.unmount();
});

it("edits template content directly, keeps it open on conflict, and displays the saved snapshot", async () => {
  const activity = {
    title: "旧路线",
    category: "WEEKLY",
    coverUrl: "/assets/cover.jpg",
    galleryUrls: [],
    summary: "旧摘要",
    description: "旧说明",
    location: "厦门",
    meetingPoint: "东门",
    capacity: 20,
    priceCents: 8000,
    identityRequired: false,
    startAt: "2027-02-01T09:00:00+08:00",
    endAt: "2027-02-01T11:00:00+08:00",
    registrationDeadline: "2027-02-01T08:00:00+08:00",
  };
  const item = { id: "t-one", name: "周末活动", activity, version: 3 };
  let conflict = true;
  const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
    const writing = init?.method === "PUT";
    const ok = !writing || !conflict;
    return {
      ok,
      status: ok ? 200 : 409,
      json: async () =>
        writing
          ? ok
            ? {
                ...item,
                version: 4,
                activity: {
                  ...activity,
                  title: "新路线",
                  priceCents: 12550,
                  endAt: "2027-02-01T12:00:00+08:00",
                },
              }
            : { message: "模板已更新，请刷新" }
          : { items: [item], hasMore: false },
    };
  });
  vi.stubGlobal("fetch", fetcher);
  const w = mount(TemplatesView, { global: { stubs: { RouterLink: true } } });
  await flushPromises();
  await button(w, "编辑模板").trigger("click");
  const dialog = w.get('[role="dialog"]');
  const field = (label: string) =>
    dialog
      .findAll("label")
      .find((x) => x.text().startsWith(label))!
      .get("input");
  expect((field("活动标题").element as HTMLInputElement).value).toBe("旧路线");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await field("活动标题").setValue("新路线");
  await field("每人费用").setValue("125.50");
  await field("活动时长").setValue("180");
  await dialog.get("form").trigger("submit");
  await flushPromises();
  expect(dialog.get('[role="alert"]').text()).toContain("不会自动覆盖");
  expect((field("活动标题").element as HTMLInputElement).value).toBe("新路线");
  const update = fetcher.mock.calls[1]!;
  expect(update[0]).toContain("/admin/templates/t-one/content");
  const payload = JSON.parse(update[1]!.body as string);
  expect(payload).toMatchObject({
    title: "新路线",
    priceCents: 12550,
    durationMinutes: 180,
    version: 3,
  });
  expect(payload).not.toHaveProperty("deadlineLeadMinutes");
  expect(payload).not.toHaveProperty("sourceId");
  conflict = false;
  await dialog.get("form").trigger("submit");
  await flushPromises();
  expect(w.find('[role="dialog"]').exists()).toBe(false);
  expect(w.text()).toContain("模板已保存");
  expect(w.text()).toContain("新路线");
  await button(w, "查看模板").trigger("click");
  expect(w.get('[role="dialog"]').text()).toContain("3 小时");
  expect(fetcher).toHaveBeenCalledTimes(3);
  w.unmount();
});
