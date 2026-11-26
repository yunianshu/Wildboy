import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import NavigationPointsField from "../src/components/NavigationPointsField.vue";
import { coordinate, loadNavigationMap } from "../src/navigation-map";

vi.mock("../src/navigation-map", async (loadOriginal) => ({
  ...(await loadOriginal<typeof import("../src/navigation-map")>()),
  loadNavigationMap: vi.fn(),
}));

let wrapper: VueWrapper;
const mockLoad = vi.mocked(loadNavigationMap);
const destroy = vi.fn();
const setCenter = vi.fn();
const setPosition = vi.fn();
const placeSearch = vi.fn();
const geocode = vi.fn();
const lnglat = (lng: number, lat: number) => ({
  getLng: () => lng,
  getLat: () => lat,
});
let clickMap: (event: { lnglat: ReturnType<typeof lnglat> }) => void;
const sdk = {
  Map: class {
    on(_event: string, callback: typeof clickMap) {
      clickMap = callback;
    }
    destroy = destroy;
    setCenter = setCenter;
  },
  Marker: class {
    setPosition = setPosition;
  },
  PlaceSearch: class {
    search = placeSearch;
  },
  Geocoder: class {
    getAddress = geocode;
  },
};

function setup(key = "synthetic-test-key") {
  vi.stubEnv("VITE_AMAP_JS_KEY", key);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
  );
  mockLoad.mockResolvedValue(sdk);
  wrapper = mount(NavigationPointsField, {
    props: { modelValue: [] },
    attachTo: document.body,
  });
  return wrapper;
}
function button(name: string) {
  return wrapper.findAll("button").find((el) => el.text() === name)!;
}
const latitude = () =>
  wrapper.get<HTMLInputElement>('[placeholder="如 24.501111"]');
const longitude = () =>
  wrapper.get<HTMLInputElement>('[placeholder="如 118.126666"]');
const label = () =>
  wrapper.get<HTMLInputElement>('[placeholder="如：岛内SM一期北门"]');
const address = () =>
  wrapper.get<HTMLInputElement>('[placeholder="导航面板展示的详细地址"]');

async function open() {
  await button("添加导航点").trigger("click");
  await button("地图选点").trigger("click");
  await flushPromises();
}

afterEach(() => {
  wrapper?.unmount();
  mockLoad.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Web navigation map", () => {
  it("keeps coordinate paste available without loading a provider when configuration is absent", async () => {
    setup("");
    await button("添加导航点").trigger("click");
    expect(button("地图选点").attributes("disabled")).toBeDefined();
    expect(mockLoad).not.toHaveBeenCalled();
    const paste = wrapper.get<HTMLInputElement>(
      '[placeholder="例如 24.5011, 118.1266"]',
    );
    await paste.setValue("24.5011, 118.1266");
    expect(latitude().element.value).toBe("24.501100");
    expect(longitude().element.value).toBe("118.126600");
  });

  it("searches from inside the pop-up and only adds after both confirmations", async () => {
    setup();
    placeSearch.mockImplementation((_keyword, done) =>
      done("complete", {
        poiList: {
          pois: [
            {
              name: "试验步道入口",
              address: "厦门市某步道",
              location: lnglat(118.089425, 24.479834),
            },
            { name: "接收位置无效", location: lnglat(118, 99) },
          ],
        },
      }),
    );
    await open();
    await wrapper.get('[aria-label="搜索地图地址"]').setValue("厦门 步道");
    await button("搜索").trigger("click");
    expect(placeSearch.mock.calls.at(-1)?.[0]).toBe("厦门 步道");
    expect(wrapper.text()).not.toContain("接收位置无效");
    await wrapper.get(".map-results button").trigger("click");
    expect(setCenter).toHaveBeenCalledWith([118.089425, 24.479834]);
    expect(latitude().element.value).toBe("");
    await button("使用此地址").trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(destroy).toHaveBeenCalled();
    await button("确认添加导航点").trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]?.[0]).toEqual([
      expect.objectContaining({
        label: "试验步道入口",
        address: "厦门市某步道",
        latitude: 24.479834,
        longitude: 118.089425,
      }),
    ]);
  });

  it("uses the last click only, retaining the selected coordinates when no address is found", async () => {
    setup();
    geocode.mockImplementation(() => {});
    await open();
    await label().setValue("东门");
    await address().setValue("旧地址");
    clickMap({ lnglat: lnglat(118.1, 24.5) });
    clickMap({ lnglat: lnglat(118.5, 24.7) });
    await flushPromises();
    expect(button("使用此地址").attributes("disabled")).toBeDefined();
    geocode.mock.calls[0]![1]("complete", {
      regeocode: { formattedAddress: "迟到地址" },
    });
    geocode.mock.calls[1]![1]("no_data", {});
    await flushPromises();
    expect(wrapper.text()).not.toContain("迟到地址");
    expect(wrapper.text()).toContain("没查到详细地址");
    expect(setPosition).toHaveBeenCalledWith([118.5, 24.7]);
    await button("使用此地址").trigger("click");
    expect(latitude().element.value).toBe("24.700000");
    expect(longitude().element.value).toBe("118.500000");
    expect(label().element.value).toBe("东门");
    expect(address().element.value).toBe("");
  });

  it("cancels without changing typed data and ignores late map replies", async () => {
    setup();
    geocode.mockImplementation(() => {});
    await open();
    await latitude().setValue("24.5");
    clickMap({ lnglat: lnglat(118.2, 24.7) });
    await button("取消选点").trigger("click");
    geocode.mock.calls.at(-1)?.[1]("complete", {
      regeocode: { formattedAddress: "迟到地址" },
    });
    expect(latitude().element.value).toBe("24.5");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("offers a non-destructive fallback when the SDK does not load", async () => {
    setup();
    mockLoad.mockRejectedValue(new Error("unavailable"));
    await open();
    expect(wrapper.get(".error-box").text()).toContain("地图未能加载");
    expect(button("使用此地址").attributes("disabled")).toBeDefined();
    await button("取消选点").trigger("click");
    expect(latitude().element.disabled).toBe(false);
  });

  it("validates coordinates before calling external services", () => {
    expect(coordinate(118, 91)).toBeNull();
    expect(coordinate(NaN, 24)).toBeNull();
    expect(coordinate("118", 24)).toBeNull();
    expect(coordinate(118, 24)).toEqual([118, 24]);
  });
});
