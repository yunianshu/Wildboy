<script setup lang="ts">
import { computed } from "vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
  busy?: boolean;
  label: string;
  countUnit?: string;
}>();
const emit = defineEmits<{ change: [page: number] }>();
const pageCount = computed(() =>
  props.total == null
    ? undefined
    : Math.max(1, Math.ceil(props.total / props.pageSize)),
);
</script>

<template>
  <nav v-if="page > 0 || hasMore" class="pagination" :aria-label="label">
    <span v-if="pageCount != null"
      >共 {{ total }} {{ countUnit || "条" }} · 第 {{ page + 1 }}/{{
        pageCount
      }}
      页</span
    >
    <span v-else>第 {{ page + 1 }} 页</span>
    <button
      type="button"
      class="secondary"
      :disabled="busy || page === 0"
      @click="emit('change', page - 1)"
    >
      <AppIcon name="back" :size="14" />上一页
    </button>
    <button
      type="button"
      class="secondary"
      :disabled="busy || !hasMore"
      @click="emit('change', page + 1)"
    >
      下一页<AppIcon name="arrow" :size="14" />
    </button>
  </nav>
  <p v-else-if="total" class="pagination-count">
    共 {{ total }} {{ countUnit || "条" }}
  </p>
</template>
