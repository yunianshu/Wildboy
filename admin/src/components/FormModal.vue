<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  ref,
  useId,
} from "vue";

const props = withDefaults(
  defineProps<{
    size?: "sm" | "md" | "lg" | "xl";
    label?: string;
    busy?: boolean;
    confirmation?: boolean;
    title?: string;
  }>(),
  {
    size: "md",
    label: "对话框",
  },
);
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLElement>();
const headingId = ref<string>();
const generatedHeadingId = `modal-heading-${useId()}`;
const previousFocus = document.activeElement as HTMLElement | null;
let restoreFocus = false;

function isVisible(element: HTMLElement) {
  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    if (
      current.hidden ||
      current.inert ||
      current.getAttribute("aria-hidden") === "true"
    )
      return false;
    const style = getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}
function topDialog() {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="dialog"][aria-modal="true"]',
    ),
  )
    .filter(isVisible)
    .at(-1);
}
function isTopmost() {
  return (
    !!dialog.value &&
    (topDialog() === dialog.value || !dialog.value.isConnected)
  );
}
function close() {
  if (!props.busy) emit("close");
}
function focusableElements() {
  return Array.from(
    dialog.value?.querySelectorAll<HTMLElement>(
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable="true"]',
    ) || [],
  ).filter(
    (element) =>
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      isVisible(element),
  );
}
function keydown(event: KeyboardEvent) {
  if (!isTopmost()) return;
  if (event.key === "Escape") {
    if (
      globalThis.CSS?.supports?.("selector(select:open)") &&
      dialog.value?.querySelector("select:open")
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    close();
  } else if (event.key === "Tab") {
    const elements = focusableElements();
    const first = elements[0],
      last = elements.at(-1);
    const active = document.activeElement;
    if (!first || !dialog.value?.contains(active)) {
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
      if (!first) dialog.value?.focus();
    } else if (
      event.shiftKey &&
      (active === first || active === dialog.value)
    ) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
function containFocus(event: FocusEvent) {
  if (isTopmost() && !dialog.value?.contains(event.target as Node))
    dialog.value?.focus();
}
onMounted(() => {
  const heading = dialog.value?.querySelector<HTMLElement>("h1, h2, h3");
  if (heading) {
    if (!heading.id) heading.id = generatedHeadingId;
    headingId.value = heading.id;
  }
  if (isTopmost()) dialog.value?.focus({ preventScroll: true });
  document.addEventListener("keydown", keydown, true);
  document.addEventListener("focusin", containFocus);
});
onBeforeUnmount(() => {
  const remaining = topDialog();
  restoreFocus = !remaining || remaining === dialog.value;
});
onUnmounted(() => {
  document.removeEventListener("keydown", keydown, true);
  document.removeEventListener("focusin", containFocus);
  if (!restoreFocus) return;
  void nextTick(() => {
    const remaining = topDialog();
    if (
      previousFocus?.isConnected &&
      (!remaining || remaining.contains(previousFocus))
    )
      previousFocus.focus({ preventScroll: true });
    else remaining?.focus({ preventScroll: true });
  });
});
</script>
<template>
  <div
    class="form-modal-backdrop"
    :class="{ 'dialog-overlay': confirmation }"
    @click.self="close"
  >
    <section
      ref="dialog"
      class="form-modal"
      :class="[size === 'md' ? undefined : size, { dialog: confirmation }]"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="headingId"
      :aria-label="headingId ? undefined : label"
      tabindex="-1"
    >
      <header class="form-modal-header">
        <div v-if="$slots.title || title" class="form-modal-title">
          <slot name="title"
            ><h2>{{ title }}</h2></slot
          >
        </div>
        <button
          class="form-modal-close"
          type="button"
          aria-label="关闭弹窗"
          :disabled="busy"
          @click="close"
        >
          <AppIcon name="close" :size="16" />
        </button>
      </header>
      <div class="form-modal-body"><slot /></div>
      <footer v-if="$slots.footer" class="form-modal-footer">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
