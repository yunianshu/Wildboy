import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import RichContentEditor from "../src/components/RichContentEditor.vue";
import ImageUpload from "../src/components/ImageUpload.vue";
beforeEach(() => vi.unstubAllGlobals());
describe("structured content", () => {
  it("loads version, edits and saves safe text blocks without HTML rendering", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          blocks: [{ type: "text", text: "<script>bad()</script>" }],
          version: 2,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          blocks: [{ type: "text", text: "新文字" }],
          version: 3,
        }),
      });
    vi.stubGlobal("fetch", fetch);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: "/", component: { template: "<div />" } }],
    });
    await router.push("/");
    const w = mount(RichContentEditor, {
      props: { path: "/admin/activities/a/content" },
      global: { plugins: [router] },
    });
    await flushPromises();
    expect(w.find("script").exists()).toBe(false);
    await w.get("textarea").setValue("新文字");
    await w
      .findAll("button")
      .find((b) => b.text() === "保存图文")!
      .trigger("click");
    await flushPromises();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({
      blocks: [{ type: "text", text: "新文字" }],
      version: 2,
    });
    w.unmount();
  });
  it("rejects oversized uploads before sending a request", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const w = mount(ImageUpload);
    const input = w.get("input");
    Object.defineProperty(input.element, "files", {
      value: [{ name: "large.png", type: "image/png", size: 5000000 }],
    });
    await input.trigger("change");
    expect(w.text()).toContain("4MB");
    expect(fetch).not.toHaveBeenCalled();
    w.unmount();
  });
});
