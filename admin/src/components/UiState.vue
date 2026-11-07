<script setup lang="ts">
import AppIcon from "./AppIcon.vue";
withDefaults(
  defineProps<{ kind?: "loading" | "empty" | "error"; compact?: boolean }>(),
  { kind: "empty", compact: false },
);
</script>
<template>
  <div
    class="ui-state"
    :class="['ui-state-' + kind, { 'ui-state-compact': compact }]"
    :role="kind === 'error' ? 'alert' : 'status'"
    :aria-busy="kind === 'loading' ? 'true' : undefined"
    aria-live="polite"
  >
    <span v-if="kind === 'loading'" class="state-spinner" aria-hidden="true" />
    <AppIcon v-else :name="kind === 'error' ? 'error' : 'empty'" :size="22" />
    <div class="ui-state-content"><slot /></div>
  </div>
</template>
