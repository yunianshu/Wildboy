import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import BoardingPointSettingsView from "../src/views/BoardingPointSettingsView.vue";

const pickerOrigin = "https://apis.map.qq.com";
const testKey = "synthetic-test-key";
const selection = {
  module: "locationPicker",
  latlng: { lat: 24.479834, lng: 118.089425 },
  poiname: "试验步道入口",
  poiaddress: "厦门市某步道",
};

let wrapper: VueWrapper;

async function openDraft(key = testKey) {
  vi.stubEnv("VITE_TENCENT_MAP_PICKER_KEY", key);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, options) => ({
      ok: true,
      status: 200,
      json: async () => (options?.body ? JSON.parse(options.body) : []),
    })),
  );
  wrapper = mount(BoardingPointSettingsView, {
    attachTo: document.body,
  });
  await flushPromises();
  await button("新增上车点").trigger("click");
}

function posted() {
  const call = vi
    .mocked(fetch)
    .mock.calls.find(([, options]) => options?.method === "POST");
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

function button(name: string) {
  return wrapper.findAll("button").find((el) => el.text() === name)!;
}

function input(placeholder: string) {
  return wrapper.get<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
}
const address = () => input("填写详细上车地址");
const latitude = () => input("如 24.501111");
const longitude = () => input("如 118.126666");

async function openPicker() {
  await button("地图选点").trigger("click");
  return wrapper.get<HTMLIFrameElement>("iframe").element;
}

function sendSelection(source: Window | null, options: MessageEventInit = {}) {
  window.dispatchEvent(
    new MessageEvent("message", {
      origin: pickerOrigin,
      source,
      data: selection,
      ...options,
    }),
  );
}

afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Tencent navigation point picker", () => {
  it("allows manual entry and coordinate paste without a map key", async () => {
    await openDraft("");
    expect(button("地图选点").element.disabled).toBe(true);
    expect(wrapper.find("iframe").exists()).toBe(false);

    await address().setValue("东门");
    await input("例如 24.5011, 118.1266").setValue("24.5011, 118.1266");
    expect(latitude().element.value).toBe("24.501100");
    expect(longitude().element.value).toBe("118.126600");
    await longitude().setValue("118.1234");
    await button("保存上车点").trigger("click");
    expect(posted()).toEqual(
      expect.objectContaining({
        name: "东门",
        latitude: 24.5011,
        longitude: 118.1234,
      }),
    );
  });

  it("fills an unnamed draft from the official picker and adds only on confirmation", async () => {
    await openDraft();
    const frame = await openPicker();
    const url = new URL(frame.src);
    expect(url.origin).toBe(pickerOrigin);
    expect(url.pathname).toBe("/tools/locpicker");
    expect(url.searchParams.get("key")).toBe(testKey);
    expect(url.searchParams.get("coordtype")).toBe("5");
    expect(frame.contentWindow).not.toBeNull();

    sendSelection(frame.contentWindow, { origin: "https://mapapi.qq.com" });
    await flushPromises();
    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(address().element.value).toBe(selection.poiaddress);
    expect(latitude().element.value).toBe("24.479834");
    expect(longitude().element.value).toBe("118.089425");
    expect(posted()).toBeUndefined();

    await button("保存上车点").trigger("click");
    expect(posted()).toEqual(
      expect.objectContaining({
        name: selection.poiaddress,
        address: selection.poiaddress,
        latitude: selection.latlng.lat,
        longitude: selection.latlng.lng,
      }),
    );
  });

  it("replaces the address and coordinates when a new point is selected", async () => {
    await openDraft();
    await address().setValue("原来地址");
    await latitude().setValue("24.5");
    await longitude().setValue("118.1");
    const frame = await openPicker();
    expect(new URL(frame.src).searchParams.get("coord")).toBe("24.5,118.1");

    sendSelection(frame.contentWindow);
    await flushPromises();
    expect(address().element.value).toBe(selection.poiaddress);
    expect(latitude().element.value).toBe("24.479834");
    expect(longitude().element.value).toBe("118.089425");
  });

  it("ignores unrelated windows, origins and invalid selections", async () => {
    await openDraft();
    const frame = await openPicker();
    sendSelection(frame.contentWindow, { origin: "https://example.test" });
    sendSelection(frame.contentWindow, {
      origin: "https://other.mapapi.qq.com",
    });
    sendSelection(window);
    sendSelection(frame.contentWindow, { data: null });
    sendSelection(frame.contentWindow, {
      data: { ...selection, module: "other" },
    });
    for (const latlng of [
      { lat: 91, lng: 118 },
      { lat: 24, lng: 181 },
      { lat: NaN, lng: 118 },
      { lat: "24", lng: 118 },
    ]) {
      sendSelection(frame.contentWindow, { data: { ...selection, latlng } });
    }
    await flushPromises();
    expect(wrapper.find("iframe").exists()).toBe(true);
    expect(latitude().element.value).toBe("");
    expect(longitude().element.value).toBe("");
    expect(address().element.value).toBe("");
    expect(posted()).toBeUndefined();
  });

  it("cancels without editing the draft and ignores replies from the closed picker", async () => {
    await openDraft();
    await address().setValue("东门");
    await latitude().setValue("24.5");
    await longitude().setValue("118.1");
    const source = (await openPicker()).contentWindow;
    await wrapper.get('[aria-label="关闭弹窗"]').trigger("click");
    expect(wrapper.find("iframe").exists()).toBe(false);
    sendSelection(source);
    await flushPromises();
    expect(address().element.value).toBe("东门");
    expect(latitude().element.value).toBe("24.5");
    expect(longitude().element.value).toBe("118.1");

    const reopened = await openPicker();
    sendSelection(source);
    await flushPromises();
    expect(wrapper.get("iframe").element).toBe(reopened);
    expect(latitude().element.value).toBe("24.5");
    expect(posted()).toBeUndefined();
  });

  it("shows the quota and lets an administrator continue with manual entry", async () => {
    await openDraft();
    expect(wrapper.text()).toContain("地点搜索每天 200 次");
    expect(wrapper.text()).toContain("各每天 6,000 次，每项每秒最多 5 次");
    await address().setValue("集合点");
    await openPicker();
    expect(wrapper.text()).toContain("如果提示配额用完");

    await button("手工输入").trigger("click");
    await flushPromises();
    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(document.activeElement).toBe(address().element);
    expect(address().element.value).toBe("集合点");
    await address().setValue("厦门市思明区");
    await latitude().setValue("24.5");
    await longitude().setValue("118.1");
    await button("保存上车点").trigger("click");
    expect(posted()).toEqual(
      expect.objectContaining({
        name: "厦门市思明区",
        address: "厦门市思明区",
        latitude: 24.5,
        longitude: 118.1,
      }),
    );
  });
});
