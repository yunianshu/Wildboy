<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
  busy?: boolean;
  label: string;
}>();
const emit = defineEmits<{ change: [page: number] }>();
const pageCount = computed(() =>
  props.total == null ? undefined : Math.max(1, Math.ceil(props.total / props.pageSize)),
);
</script>

<template>
  <nav class="pagination" :aria-label="label">
    <span v-if="pageCount != null">共 {{ total }} 条 · 第 {{ page + 1 }}/{{ pageCount }} 页</span>
    <span v-else>第 {{ page + 1 }} 页</span>
    <button type="button" class="secondary" :disabled="busy || page === 0" @click="emit('change', page - 1)">上一页</button>
    <button type="button" class="secondary" :disabled="busy || !hasMore" @click="emit('change', page + 1)">下一页</button>
  </nav>
</template>
