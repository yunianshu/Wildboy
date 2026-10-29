<script setup lang="ts">
withDefaults(defineProps<{ size?: "md" | "lg" | "xl" }>(), { size: "md" });
const emit = defineEmits<{ close: [] }>();
</script>
<template>
  <div class="form-modal-backdrop" @click.self="emit('close')">
    <section
      class="form-modal"
      :class="size === 'md' ? undefined : size"
      role="dialog"
      aria-modal="true"
    >
      <button
        class="form-modal-close"
        type="button"
        aria-label="关闭弹窗"
        @click="emit('close')"
      >
        ✕
      </button>
      <slot />
    </section>
  </div>
</template>
