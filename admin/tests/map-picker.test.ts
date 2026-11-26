import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import NavigationPointsField from "../src/components/NavigationPointsField.vue";

const origin = "https://apis.map.qq.com";
const chosen = {
  module: "locationPicker",
  latlng: { lat: 24.479834, lng: 118.089425 },
  poiname: "试验步道入口",
  poiaddress: "厦门市某步道",
};
let wrapper: VueWrapper;

function setup(key: string) {
  vi.stubEnv("VITE_TENCENT_MAP_PICKER_KEY", key);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
  );
  wrapper = mount(NavigationPointsField, {
    props: { modelValue: [] },
    attachTo: document.body,
  });
  return wrapper;
}
function button(name: string) {
  return wrapper.findAll("button").find((el) => el.text() === name)!;
}
afterEach(() => {
  wrapper?.unmount();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("web navigation point picker", () => {
  it("shows map unavailable without a dedicated key while allowing manual entry", async () => {
    const view = setup("");
    await button("添加导航点").trigger("click");
    expect(button("地图选点").attributes("disabled")).toBeDefined();
    expect(view.find("iframe").exists()).toBe(false);
    expect(view.find('[placeholder="如 24.501111"]').exists()).toBe(true);
  });

  it("accepts only the open Tencent picker window, fills the form, and uses the normal add action", async () => {
    const view = setup("synthetic-test-key");
    await button("添加导航点").trigger("click");
    await button("地图选点").trigger("click");
    const frame = view.get<HTMLIFrameElement>("iframe").element;
    const url = new URL(frame.src);
    expect(url.origin).toBe(origin);
    expect(url.pathname).toBe("/tools/locpicker");
    expect(url.searchParams.get("coordtype")).toBe("5");
    expect(frame.contentWindow).not.toBeNull();
    const send = (options: MessageEventInit) =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin,
          source: frame.contentWindow,
          data: chosen,
          ...options,
        }),
      );
    send({ origin: "https://example.test" });
    send({ source: window });
    send({ data: { ...chosen, latlng: { ...chosen.latlng, lat: 200 } } });
    await flushPromises();
    expect(view.find("iframe").exists()).toBe(true);
    expect(
      view.get<HTMLInputElement>('[placeholder="如 24.501111"]').element.value,
    ).toBe("");
    send({});
    await flushPromises();
    expect(view.find("iframe").exists()).toBe(false);
    expect(view.emitted("update:modelValue")).toBeUndefined();
    expect(
      view.get<HTMLInputElement>('[placeholder="如 24.501111"]').element.value,
    ).toBe("24.479834");
    expect(
      view.get<HTMLInputElement>('[placeholder="如：岛内SM一期北门"]').element
        .value,
    ).toBe(chosen.poiname);
    await button("确认添加导航点").trigger("click");
    expect(view.emitted("update:modelValue")?.[0]?.[0]).toEqual([
      expect.objectContaining({
        label: chosen.poiname,
        address: chosen.poiaddress,
        latitude: chosen.latlng.lat,
        longitude: chosen.latlng.lng,
      }),
    ]);
  });

  it("leaves handwritten coordinates intact on cancel and ignores a late result", async () => {
    const view = setup("synthetic-test-key");
    await button("添加导航点").trigger("click");
    const lat = view.get<HTMLInputElement>('[placeholder="如 24.501111"]');
    await lat.setValue("24.5");
    await view.get('[placeholder="如 118.126666"]').setValue("118.1");
    await button("地图选点").trigger("click");
    const frame = view.get<HTMLIFrameElement>("iframe").element;
    expect(new URL(frame.src).searchParams.get("coord")).toBe("24.5,118.1");
    const source = frame.contentWindow;
    await view.get('[aria-label="关闭弹窗"]').trigger("click");
    window.dispatchEvent(
      new MessageEvent("message", { origin, source, data: chosen }),
    );
    await flushPromises();
    expect(lat.element.value).toBe("24.5");
    expect(view.emitted("update:modelValue")).toBeUndefined();
  });
});
