<script setup lang="ts">
import { computed, ref } from "vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  options: { id: string; title: string; imageUrl?: string; detail?: string }[];
  itemLabel: string;
  disabled: boolean;
}>();
const ids = defineModel<string[]>({ required: true });
const rows = computed(() => {
  const byId = new Map(props.options.map((item) => [item.id, item]));
  return ids.value.map(
    (id) =>
      byId.get(id) ?? {
        id,
        title: `${props.itemLabel} (${id.slice(0, 8)})`,
        imageUrl: "",
        detail: "",
      },
  );
});
const sourceId = ref("");
const targetId = ref("");

function swap(first: string, second: string) {
  const from = ids.value.indexOf(first);
  const to = ids.value.indexOf(second);
  if (props.disabled || from < 0 || to < 0 || from === to) return;
  const next = [...ids.value];
  next[from] = second;
  next[to] = first;
  ids.value = next;
}

function start(event: DragEvent, id: string) {
  if (props.disabled || ids.value.length < 2) return event.preventDefault();
  sourceId.value = id;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }
}

function over(event: DragEvent, id: string) {
  if (!sourceId.value || props.disabled) return;
  event.preventDefault();
  targetId.value = id;
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function clear() {
  sourceId.value = "";
  targetId.value = "";
}

function drop(event: DragEvent, id: string) {
  if (!sourceId.value) return;
  event.preventDefault();
  swap(sourceId.value, id);
  clear();
}
</script>

<template>
  <div class="featured-rank-grid" @dragend="clear">
    <div
      v-for="(row, index) in rows"
      :key="row.id"
      class="featured-rank-card"
      :class="{
        'is-dragging': sourceId === row.id,
        'is-target': targetId === row.id && sourceId !== row.id,
      }"
      :draggable="rows.length > 1 && !disabled"
      @dragstart="start($event, row.id)"
      @dragover="over($event, row.id)"
      @dragleave="targetId === row.id && (targetId = '')"
      @drop="drop($event, row.id)"
    >
      <div class="rank-head">
        <span class="rank-number">第 {{ index + 1 }} 位</span>
        <AppIcon v-if="rows.length > 1" name="grip" :size="18" />
      </div>
      <img v-if="row.imageUrl" :src="row.imageUrl" alt="" draggable="false" />
      <strong>{{ row.title }}</strong>
      <small v-if="row.detail">{{ row.detail }}</small>
      <div class="rank-actions">
        <button
          type="button"
          class="text-button"
          :disabled="disabled || index === 0"
          @click="swap(row.id, ids[index - 1]!)"
        >
          前移
        </button>
        <button
          type="button"
          class="text-button"
          :disabled="disabled || index === rows.length - 1"
          @click="swap(row.id, ids[index + 1]!)"
        >
          后移
        </button>
        <button
          type="button"
          class="text-button danger-text"
          :disabled="disabled"
          @click="ids = ids.filter((id) => id !== row.id)"
        >
          移出
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.featured-rank-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 220px), 1fr));
  gap: 10px;
}
.featured-rank-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 10px;
  background: #fff;
  overflow-wrap: anywhere;
}
.featured-rank-card[draggable="true"] {
  cursor: grab;
}
.featured-rank-card.is-dragging {
  opacity: 0.55;
  cursor: grabbing;
}
.featured-rank-card.is-target {
  outline: 2px dashed var(--rf-primary);
  outline-offset: -2px;
  background: var(--rf-soft);
}
.rank-head,
.rank-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rank-head {
  justify-content: space-between;
  color: var(--rf-muted);
}
.rank-number {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rf-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}
.featured-rank-card img {
  width: 100%;
  height: 96px;
  object-fit: cover;
  border-radius: 6px;
}
.rank-actions {
  margin-top: auto;
}
.danger-text {
  color: var(--rf-danger);
}
</style>
