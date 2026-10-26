<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
defineProps<{
  title: string;
  description: string;
  busy?: boolean;
  confirmLabel: string;
  danger?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>(),
  cancelButton = ref<HTMLButtonElement>(),
  dialog = ref<HTMLElement>();
const previousFocus = document.activeElement as HTMLElement | null;
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") emit("cancel");
  if (event.key === "Tab") {
    const buttons = dialog.value?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    if (!buttons?.length) return;
    const first = buttons[0],
      last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      last?.focus();
      event.preventDefault();
    } else if (!event.shiftKey && document.activeElement === last) {
      first?.focus();
      event.preventDefault();
    }
  }
}
onMounted(() => {
  cancelButton.value?.focus();
  document.addEventListener("keydown", keydown);
});
onUnmounted(() => {
  document.removeEventListener("keydown", keydown);
  previousFocus?.focus();
});
</script>
<template>
  <Teleport to="body"
    ><div class="dialog-overlay" @click.self="!busy && emit('cancel')">
      <section
        ref="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-heading"
      >
        <p class="eyebrow">PLEASE CONFIRM</p>
        <h2 id="confirmation-heading">{{ title }}</h2>
        <p>{{ description }}</p>
        <div class="dialog-actions">
          <button
            ref="cancelButton"
            class="secondary"
            :disabled="busy"
            @click="emit('cancel')"
          >
            返回检查</button
          ><button
            :class="danger ? 'danger' : 'primary'"
            :disabled="busy"
            @click="emit('confirm')"
          >
            {{ busy ? "正在处理…" : confirmLabel }}
          </button>
        </div>
      </section>
    </div></Teleport
  >
</template>
