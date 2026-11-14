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
