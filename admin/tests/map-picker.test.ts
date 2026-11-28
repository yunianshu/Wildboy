import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { BoardingPointLocation } from "../src/types";
import BoardingPointSettingsView from "../src/views/BoardingPointSettingsView.vue";

const pickerOrigin = "https://apis.map.qq.com";
const selection = {
  module: "locationPicker",
  latlng: { lat: 24.479834, lng: 118.089425 },
  poiname: "试验步道入口",
  poiaddress: "厦门市某步道",
};
const original = {
  name: "原上车点标识",
  address: "原上车地址",
  latitude: 24.5,
  longitude: 118.1,
};
let wrapper: VueWrapper;

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}
async function openPage(rows: BoardingPointLocation[] = [original], key = "synthetic-test-key") {
  vi.stubEnv("VITE_TENCENT_MAP_PICKER_KEY", key);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_path, options) =>
      response(options?.body ? JSON.parse(String(options.body)) : rows),
    ),
  );
  wrapper = mount(BoardingPointSettingsView, { attachTo: document.body });
  await flushPromises();
}
function posts() {
  return vi
    .mocked(fetch)
    .mock.calls.filter(([, options]) => options?.method === "POST");
}
function button(name: string) {
  return wrapper.findAll("button").find((el) => el.text() === name)!;
}
function frame() {
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

describe("上车点一步选址保存", () => {
  it("opens one dialog and waits for explicit confirmation before saving", async () => {
    await openPage();
    expect(wrapper.find("[role=dialog]").exists()).toBe(false);
    await button("新增上车点").trigger("click");
    expect(wrapper.findAll("[role=dialog]")).toHaveLength(1);
    expect(
      wrapper.find(".form-modal-backdrop.map-picker-backdrop").exists(),
    ).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(
      /地图选点|手工输入|配额|经纬度|保存上车点/,
    );
    const url = new URL(frame().src);
    expect(url.origin + url.pathname).toBe(pickerOrigin + "/tools/locpicker");
    expect(url.searchParams.get("coordtype")).toBe("5");
    expect(frame().contentWindow).not.toBeNull();
    expect(button("保存").attributes("disabled")).toBeDefined();
    expect(posts()).toHaveLength(0);

    sendSelection(frame().contentWindow, { origin: "https://mapapi.qq.com" });
    await flushPromises();
    expect(posts()).toHaveLength(0);
    expect(wrapper.get(".picker-selection").text()).toContain(selection.poiname);
    expect(wrapper.get(".picker-selection").text()).toContain(selection.poiaddress);
    expect(button("保存").attributes("disabled")).toBeUndefined();
    await button("保存").trigger("click");
    await flushPromises();
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(String(posts()[0][1]?.body))).toEqual({
      name: selection.poiaddress,
      displayName: selection.poiname,
      address: selection.poiaddress,
      latitude: selection.latlng.lat,
      longitude: selection.latlng.lng,
    });
    expect(wrapper.find("[role=dialog]").exists()).toBe(false);
    const row = wrapper.findAll(".stop-list li").find((item) => item.text().includes(selection.poiname))!;
    expect(row.get(".stop-name").text()).toBe(selection.poiname);
    expect(row.get(".stop-detail").text()).toBe(selection.poiaddress);
    expect(wrapper.get("[role=status]").text()).toBe("上车点已保存");
  });

  it("edits a saved point using its original identifier and coordinates", async () => {
    await openPage();
    await button("编辑").trigger("click");
    expect(new URL(frame().src).searchParams.get("coord")).toBe("24.5,118.1");
    sendSelection(frame().contentWindow);
    await flushPromises();
    await button("保存").trigger("click");
    await flushPromises();
    expect(JSON.parse(String(posts()[0][1]?.body))).toMatchObject({
      name: original.name,
      displayName: selection.poiname,
      address: selection.poiaddress,
    });
    expect(wrapper.findAll(".stop-list li")).toHaveLength(1);
    expect(wrapper.get(".stop-list").text()).not.toContain(original.address);
  });

  it("shows stored title and address after reload; legacy and unnamed points do not duplicate the address", async () => {
    await openPage([{ ...original, displayName: selection.poiname, address: selection.poiaddress },
      { ...original, name: "legacy" }]);
    const [named, legacy] = wrapper.findAll(".stop-list li");
    expect(named.get(".stop-name").text()).toBe(selection.poiname);
    expect(named.get(".stop-detail").text()).toBe(selection.poiaddress);
    expect(legacy.get(".stop-name").text()).toBe(original.address);
    expect(legacy.find(".stop-detail").exists()).toBe(false);
    await button("新增上车点").trigger("click");
    sendSelection(frame().contentWindow, { data: { ...selection, poiname: "", poiaddress: "另一处详细地址" } });
    await flushPromises();
    await button("保存").trigger("click");
    await flushPromises();
    expect(JSON.parse(String(posts()[0][1]?.body))).toMatchObject({ displayName: "", address: "另一处详细地址" });
    const unnamed = wrapper.findAll(".stop-list li").find((item) => item.text().includes("另一处详细地址"))!;
    expect(unnamed.find(".stop-detail").exists()).toBe(false);
  });

  it("discards the old map check on cancellation and only accepts a fresh map selection", async () => {
    await openPage();
    await button("新增上车点").trigger("click");
    const source = frame().contentWindow;
    sendSelection(source);
    await flushPromises();
    await button("取消选中").trigger("click");
    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(wrapper.get(".picker-reset [role=status]").text()).toBe("未选择上车点");
    expect(wrapper.find(".picker-selection").exists()).toBe(false);
    expect(button("保存").attributes("disabled")).toBeDefined();
    expect(posts()).toHaveLength(0);
    await button("重新选址").trigger("click");
    const freshSource = frame().contentWindow;
    expect(freshSource).not.toBe(source);
    sendSelection(source);
    await flushPromises();
    expect(button("保存").attributes("disabled")).toBeDefined();
    sendSelection(freshSource, { data: { ...selection, poiname: "另一个地点" } });
    await flushPromises();
    expect(wrapper.get(".picker-selection strong").text()).toBe("另一个地点");
    await wrapper.get('[aria-label="关闭弹窗"]').trigger("click");
    expect(posts()).toHaveLength(0);
    expect(wrapper.find("[role=dialog]").exists()).toBe(false);
  });

  it("ignores unrelated windows, origins, malformed data and late replies", async () => {
    await openPage();
    const add = button("新增上车点");
    add.element.focus();
    await add.trigger("click");
    const source = frame().contentWindow;
    sendSelection(window);
    sendSelection(source, { origin: "https://example.test" });
    sendSelection(source, { origin: "https://other.mapapi.qq.com" });
    sendSelection(source, { data: null });
    sendSelection(source, { data: { ...selection, module: "other" } });
    for (const latlng of [
      { lat: 91, lng: 118 },
      { lat: 24, lng: 181 },
      { lat: NaN, lng: 118 },
      { lat: "24", lng: 118 },
    ])
      sendSelection(source, { data: { ...selection, latlng } });
    expect(posts()).toHaveLength(0);
    await wrapper.get('[aria-label="关闭弹窗"]').trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(add.element);
    await add.trigger("click");
    sendSelection(source);
    await flushPromises();
    expect(posts()).toHaveLength(0);
    expect(wrapper.find("[role=dialog]").exists()).toBe(true);
  });

  it("blocks duplicate confirms while saving and leaves the picker open on error", async () => {
    await openPage();
    let finish!: (value: unknown) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish;
        }),
    );
    await button("新增上车点").trigger("click");
    const source = frame().contentWindow;
    sendSelection(source);
    sendSelection(source);
    await flushPromises();
    expect(posts()).toHaveLength(0);
    await button("保存").trigger("click");
    await button("保存").trigger("click");
    await flushPromises();
    expect(posts()).toHaveLength(1);
    expect(
      wrapper.get('[aria-label="关闭弹窗"]').attributes("disabled"),
    ).toBeDefined();
    expect(wrapper.get(".picker-status").text()).toBe("正在保存上车点…");
    finish(response({ message: "保存失败" }, 500));
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("保存失败");
    expect(wrapper.get(".stop-list").text()).not.toContain(
      selection.poiaddress,
    );
    expect(frame().contentWindow).toBe(source);
    await button("保存").trigger("click");
    await flushPromises();
    expect(posts()).toHaveLength(2);
    expect(wrapper.find("[role=dialog]").exists()).toBe(false);
  });

  it("does not overwrite a saved address when adding a duplicate", async () => {
    await openPage([{ ...original, address: selection.poiaddress }]);
    await button("新增上车点").trigger("click");
    sendSelection(frame().contentWindow);
    await flushPromises();
    await button("保存").trigger("click");
    await flushPromises();
    expect(wrapper.get("[role=alert]").text()).toContain("这个上车地址已存在");
    expect(posts()).toHaveLength(0);
  });

  it("shows the real unconfigured state without opening an iframe or a manual form", async () => {
    await openPage([original], "");
    await button("新增上车点").trigger("click");
    expect(wrapper.get("[role=dialog]").text()).toContain("地图选址尚未配置");
    expect(wrapper.find("iframe").exists()).toBe(false);
    expect(wrapper.find("input").exists()).toBe(false);
    expect(posts()).toHaveLength(0);
  });
});
