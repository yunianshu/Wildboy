import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import FormModal from "../src/components/FormModal.vue";
import DateTimeField from "../src/components/DateTimeField.vue";
import ConfirmDialog from "../src/components/ConfirmDialog.vue";

const wrappers: VueWrapper[] = [];
afterEach(async () => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  await flushPromises();
  document.body.replaceChildren();
});
function render(component: Parameters<typeof mount>[0], options = {}) {
  const wrapper = mount(component, { attachTo: document.body, ...options });
  wrappers.push(wrapper);
  return wrapper;
}
function press(key: string, shiftKey = false) {
  const event = new KeyboardEvent("keydown", {
    key,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement?.dispatchEvent(event);
  return event;
}

describe("form modal keyboard behavior", () => {
  it("names the dialog, moves focus inside and traps both Tab directions", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const wrapper = render(FormModal, {
      slots: {
        default:
          '<h2>编辑商品</h2><input aria-label="商品名称"><button class="save">保存</button><fieldset disabled><button>禁用操作</button></fieldset><button hidden>隐藏操作</button>',
      },
    });
    await flushPromises();
    const dialog = wrapper.get('[role="dialog"]');
    expect(document.activeElement).toBe(dialog.element);
    expect(dialog.attributes("aria-labelledby")).toBe(
      wrapper.get("h2").attributes("id"),
    );
    const close = wrapper.get<HTMLButtonElement>(".form-modal-close");
    const save = wrapper.get<HTMLButtonElement>(".save");
    close.element.focus();
    expect(press("Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(save.element);
    press("Tab");
    expect(document.activeElement).toBe(close.element);
    outside.focus();
    expect(document.activeElement).toBe(dialog.element);
    wrapper.unmount();
    wrappers.pop();
    await flushPromises();
    expect(document.activeElement).toBe(outside);
  });

  it("restores the clicked time field without scrolling to previously focused content", async () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    outside.focus();
    const wrapper = render(DateTimeField, {
      props: {
        id: "activity-start",
        label: "开始时间",
        modelValue: "2027-02-03T09:00",
      },
    });
    const trigger = wrapper.get<HTMLInputElement>("#activity-start-time");
    const focus = vi.spyOn(trigger.element, "focus");
    await trigger.trigger("mousedown");
    await trigger.trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(wrapper.get('[role="dialog"]').element);
    expect(press("Escape").defaultPrevented).toBe(true);
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    expect(focus.mock.calls).toEqual(
      [{ preventScroll: true }, { preventScroll: true }].map((options) => [
        options,
      ]),
    );
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("requests Escape closure without bypassing a consumer's draft guard", async () => {
    const close = vi.fn();
    const wrapper = render(FormModal, {
      props: { onClose: close, label: "编辑草稿" },
      slots: { default: '<input value="尚未保存的文字">' },
    });
    await flushPromises();
    expect(wrapper.get('[role="dialog"]').attributes("aria-label")).toBe(
      "编辑草稿",
    );
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
    expect(wrapper.get<HTMLInputElement>("input").element.value).toBe(
      "尚未保存的文字",
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it("closes only the top nested editor and restores its opener before the page opener", async () => {
    const wrapper = render(
      defineComponent({
        components: { FormModal },
        setup: () => ({ outer: ref(false), inner: ref(false) }),
        template:
          '<button class="open" @click="outer = true">编辑商品</button><FormModal v-if="outer" @close="outer = false"><h2>商品表单</h2><input value="商品草稿"><button class="open-inner" @click="inner = true">编辑图文</button></FormModal><FormModal v-if="inner" @close="inner = false"><h2>图文详情</h2><button>保存图文</button></FormModal>',
      }),
    );
    const opener = wrapper.get<HTMLButtonElement>(".open");
    opener.element.focus();
    await opener.trigger("click");
    const innerOpener = wrapper.get<HTMLButtonElement>(".open-inner");
    innerOpener.element.focus();
    await innerOpener.trigger("click");
    await flushPromises();
    const dialogs = wrapper.findAll('[role="dialog"]');
    expect(document.activeElement).toBe(dialogs[1]!.element);
    press("Escape");
    await flushPromises();
    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1);
    expect(wrapper.get<HTMLInputElement>("input").element.value).toBe(
      "商品草稿",
    );
    expect(document.activeElement).toBe(innerOpener.element);
    press("Escape");
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(opener.element);
  });

  it("leaves a teleported confirmation in control of Escape and restores the form", async () => {
    const wrapper = render(
      defineComponent({
        components: { FormModal, ConfirmDialog },
        setup: () => ({ confirm: ref(false), closed: ref(false) }),
        template:
          '<FormModal v-if="!closed" @close="closed = true"><h2>商品表单</h2><button class="confirm" @click="confirm = true">保存商品</button></FormModal><ConfirmDialog v-if="confirm" title="确认保存？" description="检查修改" confirm-label="确认" @cancel="confirm = false" />',
      }),
    );
    const opener = wrapper.get<HTMLButtonElement>(".confirm");
    opener.element.focus();
    await opener.trigger("click");
    await flushPromises();
    expect(
      document.querySelector(".dialog")?.contains(document.activeElement),
    ).toBe(true);
    press("Escape");
    await flushPromises();
    expect(document.querySelector(".dialog")).toBeNull();
    expect(wrapper.find(".form-modal").exists()).toBe(true);
    expect(document.activeElement).toBe(opener.element);
  });
});
