<script setup lang="ts">
import { ref } from "vue";
import AppIcon from "./AppIcon.vue";

const props = defineProps<{
  items: { key: number; label: string }[];
  disabled?: boolean;
  atLimit?: boolean;
}>();
const emit = defineEmits<{
  move: [from: number, to: number];
  copy: [index: number];
}>();
const draggedKey = ref<number>();
const dropEdge = ref<number>();
function clearDrag() {
  draggedKey.value = undefined;
  dropEdge.value = undefined;
}
function start(event: DragEvent, key: number) {
  if (!event.dataTransfer || props.disabled) return;
  draggedKey.value = key;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-wildboy-block", String(key));
}
function targetEdge(event: DragEvent, index: number) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  return index + Number(event.clientY >= box.top + box.height / 2);
}
function over(event: DragEvent, index: number) {
  if (draggedKey.value === undefined || props.disabled) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  dropEdge.value = targetEdge(event, index);
}
function drop(event: DragEvent, index: number) {
  if (draggedKey.value === undefined || props.disabled) return;
  event.preventDefault();
  const from = props.items.findIndex((item) => item.key === draggedKey.value);
  const edge = targetEdge(event, index);
  const to = from < edge ? edge - 1 : edge;
  clearDrag();
  if (from >= 0 && from !== to) emit("move", from, to);
}
</script>
<template>
  <ol
    class="content-blocks"
    aria-label="正文内容块"
    @dragend="clearDrag"
    @dragleave="!$el.contains($event.relatedTarget) && (dropEdge = undefined)"
  >
    <li
      v-for="(item, index) in items"
      :key="item.key"
      class="content-block"
      :class="{
        'drop-before': dropEdge === index,
        'drop-after': dropEdge === items.length && index === items.length - 1,
      }"
      @dragover="over($event, index)"
      @drop="drop($event, index)"
    >
      <div class="block-head">
        <span
          class="block-handle"
          :draggable="items.length > 1 && !disabled"
          title="拖动调整顺序"
          aria-hidden="true"
          @dragstart="start($event, item.key)"
        >
          <AppIcon name="grip" :size="18" />
        </span>
        <span class="block-title"
          ><small>{{ index + 1 }}</small
          >{{ item.label }}</span
        >
        <div class="block-actions">
          <button
            type="button"
            :disabled="disabled || index === 0"
            :aria-label="`上移第${index + 1}块`"
            title="上移"
            @click="emit('move', index, index - 1)"
          >
            <AppIcon name="up" :size="16" />
          </button>
          <button
            type="button"
            :disabled="disabled || index === items.length - 1"
            :aria-label="`下移第${index + 1}块`"
            title="下移"
            @click="emit('move', index, index + 1)"
          >
            <AppIcon name="down" :size="16" />
          </button>
          <button
            type="button"
            class="block-copy"
            :disabled="disabled || atLimit"
            :aria-label="`复制第${index + 1}块并编辑`"
            @click="emit('copy', index)"
          >
            <AppIcon name="copy" :size="15" />复制
          </button>
          <slot name="action" :index="index" />
        </div>
      </div>
      <slot :index="index" />
    </li>
  </ol>
</template>
<style scoped>
.content-blocks {
  display: grid;
  gap: 10px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.content-block {
  position: relative;
  min-width: 0;
  background: var(--rf-surface);
  border: 1px solid var(--rf-line);
  border-radius: 8px;
}
.content-block:focus-within {
  border-color: var(--rf-primary);
}
.content-block.drop-before::before,
.content-block.drop-after::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--rf-primary);
  border-radius: 3px;
}
.content-block.drop-before::before {
  top: -7px;
}
.content-block.drop-after::after {
  bottom: -7px;
}
.block-head,
.block-title,
.block-actions,
.block-actions button {
  display: flex;
  align-items: center;
}
.block-head {
  gap: 4px;
  flex-wrap: wrap;
  padding: 5px 8px;
}
.block-title {
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
}
.block-title small {
  font-size: 12px;
  color: var(--rf-muted);
  font-variant-numeric: tabular-nums;
}
.block-handle {
  display: grid;
  place-items: center;
  width: 26px;
  min-height: 36px;
  color: var(--rf-muted);
  user-select: none;
}
.block-handle[draggable="true"] {
  cursor: grab;
}
.block-handle:active {
  cursor: grabbing;
}
.block-actions {
  margin-left: auto;
  gap: 2px;
  flex-wrap: wrap;
}
.block-actions button,
.block-actions :deep(.block-delete) {
  justify-content: center;
  gap: 5px;
  min-width: 34px;
  min-height: 36px;
  padding: 4px 6px;
  background: transparent;
  border: 0;
  color: var(--rf-muted);
  border-radius: 5px;
  font-size: 13px;
}
.block-actions button:enabled:hover {
  color: var(--rf-primary-text);
  background: var(--rf-soft);
}
.block-actions button:disabled {
  opacity: 0.4;
}
.block-actions .block-copy {
  color: var(--rf-primary-text);
}
.block-actions :deep(.block-delete:enabled:hover) {
  color: var(--rf-danger);
}
@media (pointer: coarse) {
  .block-actions button,
  .block-actions :deep(.block-delete) {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>
