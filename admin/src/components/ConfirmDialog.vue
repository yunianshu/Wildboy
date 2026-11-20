<script setup lang="ts">
import { ref, onMounted } from "vue";
import FormModal from "./FormModal.vue";
defineProps<{
  title: string;
  description: string;
  busy?: boolean;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  error?: string;
  confirmDisabled?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
const cancelButton = ref<HTMLButtonElement>();
onMounted(() => cancelButton.value?.focus());
</script>
<template>
  <Teleport to="body">
    <FormModal
      size="sm"
      :title="title"
      :busy="busy"
      confirmation
      @close="emit('cancel')"
    >
      <p class="dialog-description">{{ description }}</p>
      <p v-if="error" role="alert" class="error-box">{{ error }}</p>
      <template #footer>
        <div class="dialog-actions">
          <button
            ref="cancelButton"
            class="secondary"
            :disabled="busy"
            @click="emit('cancel')"
          >
            {{ cancelLabel || "取消" }}
          </button>
          <button
            :class="danger ? 'danger' : 'primary'"
            :disabled="busy || confirmDisabled"
            @click="emit('confirm')"
          >
            {{ busy ? "正在处理…" : confirmLabel }}
          </button>
        </div>
      </template>
    </FormModal>
  </Teleport>
</template>
