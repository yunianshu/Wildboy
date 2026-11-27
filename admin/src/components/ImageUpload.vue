<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { currentUser, errorMessage } from "../api";
import { uploadAdminImage } from "../image-upload";
import type { MediaAsset, MediaCategory } from "../media";
import AppIcon from "./AppIcon.vue";
import MediaPickerModal from "./MediaPickerModal.vue";
const props = defineProps<{
  disabled?: boolean;
  label?: string;
  preview?: string;
  previewAlt?: string;
  compact?: boolean;
  category?: MediaCategory;
  hideLibrary?: boolean;
}>();
const emit = defineEmits<{ uploaded: [url: string]; busy: [value: boolean] }>();
const busy = ref(false),
  error = ref(""),
  pickerOpen = ref(false);
const input = ref<HTMLInputElement>();
const dragging = ref(false);
function chooseFile() {
  if (!props.disabled && !busy.value) input.value?.click();
}
function openLibrary() {
  if (!props.disabled && !busy.value) {
    error.value = "";
    pickerOpen.value = true;
  }
}
function selectFromLibrary(asset: MediaAsset) {
  pickerOpen.value = false;
  if (!props.disabled && !busy.value) emit("uploaded", asset.url);
}
defineExpose({ chooseFile, openLibrary });
let alive = true;
onUnmounted(() => {
  alive = false;
});
function pick(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0];
  target.value = "";
  if (file) void upload(file);
}
function dragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  dragging.value = !busy.value && !props.disabled;
  event.dataTransfer.dropEffect = dragging.value ? "copy" : "none";
}
function dragLeave(event: DragEvent) {
  const zone = event.currentTarget as HTMLElement;
  if (
    !(event.relatedTarget instanceof Node) ||
    !zone.contains(event.relatedTarget)
  )
    dragging.value = false;
}
function drop(event: DragEvent) {
  dragging.value = false;
  const files = event.dataTransfer?.files;
  if (!files?.length && !event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  event.stopPropagation();
  if (busy.value || props.disabled || !files?.length) return;
  if (files.length !== 1) {
    error.value = "请一次上传一张图片。";
    return;
  }
  void upload(files[0]);
}
async function upload(file: File) {
  if (busy.value || props.disabled) return;
  const actor = currentUser.value;
  busy.value = true;
  emit("busy", true);
  error.value = "";
  try {
    const result = await uploadAdminImage(
      file,
      () => alive && currentUser.value === actor && !props.disabled,
      props.category ? { category: props.category } : undefined,
    );
    if (result && alive && currentUser.value === actor && !props.disabled)
      emit("uploaded", result.url);
  } catch (e) {
    if (alive && currentUser.value === actor) error.value = errorMessage(e);
  } finally {
    if (alive) {
      busy.value = false;
      emit("busy", false);
    }
  }
}
</script>
<template>
  <div
    class="image-upload"
    :class="{ 'is-compact': compact }"
    @dragover="dragOver"
    @dragleave="dragLeave"
    @drop="drop"
  >
    <div v-if="compact" class="compact-actions">
      <button
        type="button"
        class="drop-zone compact"
        :class="{ 'is-dragging': dragging }"
        :disabled="disabled || busy"
        :aria-label="label || '上传图片'"
        @click="chooseFile"
      >
        <AppIcon name="upload" :size="16" />{{ label || "上传图片" }}
      </button>
      <button
        v-if="!hideLibrary && !disabled"
        type="button"
        class="library-button compact"
        :disabled="disabled || busy"
        @click="openLibrary"
      >
        <AppIcon name="image" :size="15" />素材库
      </button>
    </div>
    <template v-else>
      <button
        type="button"
        class="drop-zone"
        :class="{ 'is-dragging': dragging, 'has-preview': !!preview }"
        :disabled="disabled || busy"
        :aria-label="label || '上传图片'"
        @click="chooseFile"
      >
        <span v-if="preview" class="upload-thumbnail">
          <img
            :src="preview"
            :alt="previewAlt || '已上传图片'"
            referrerpolicy="no-referrer"
          />
        </span>
        <AppIcon v-else name="upload" :size="24" />
        <span class="upload-copy">
          <strong>{{
            dragging
              ? "松开即可上传"
              : preview
                ? "已上传图片"
                : disabled
                  ? "暂无图片"
                  : "上传图片"
          }}</strong>
          <span v-if="!disabled && !dragging">
            {{ preview ? "点击替换，或拖入新图片" : "拖入图片或点击选择文件" }}
          </span>
          <small v-if="!disabled && !preview"
            >JPG / PNG，超出上传限制会自动压缩</small
          >
        </span>
      </button>
      <div v-if="!hideLibrary && !disabled" class="upload-secondary-row">
        <button
          type="button"
          class="library-button"
          :disabled="disabled || busy"
          @click="openLibrary"
        >
          <AppIcon name="image" :size="15" />从素材库选择
        </button>
      </div>
    </template>
    <input
      ref="input"
      type="file"
      hidden
      accept="image/png,image/jpeg"
      :disabled="disabled || busy"
      @change="pick"
    />
    <p v-if="busy" class="upload-status" role="status">正在处理并上传图片…</p>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <Teleport to="body">
      <MediaPickerModal
        v-if="pickerOpen"
        :default-category="category"
        :current-url="preview"
        @close="pickerOpen = false"
        @select="selectFromLibrary"
      />
    </Teleport>
  </div>
</template>
<style scoped>
.image-upload {
  width: 100%;
  min-width: 0;
}
.drop-zone {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 5px;
  width: 100%;
  min-height: 124px;
  padding: 14px 10px;
  border: 1px dashed var(--rf-field-line);
  border-radius: var(--rf-control-radius);
  background: var(--rf-bg);
  color: var(--rf-primary-text);
  text-align: center;
  white-space: normal;
}
.drop-zone:enabled:is(:hover, .is-dragging) {
  border-color: var(--rf-primary);
  background: var(--rf-soft);
}
.drop-zone.is-dragging {
  border-style: solid;
}
.drop-zone.compact {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: auto;
  min-height: 40px;
  padding: 6px 12px;
  background: var(--rf-surface);
  border-style: solid;
}
.drop-zone.has-preview {
  grid-template-columns: minmax(64px, min(34%, 148px)) minmax(0, 1fr);
  align-items: center;
  justify-items: stretch;
  gap: 12px;
  text-align: left;
}
.upload-thumbnail {
  aspect-ratio: 1;
  padding: 5px;
  border: 1px solid var(--rf-line);
  border-radius: var(--rf-control-radius);
  background: var(--rf-surface);
  overflow: hidden;
}
.upload-thumbnail img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.upload-copy {
  display: grid;
  gap: 3px;
  font-weight: 400;
}
.upload-copy strong {
  color: var(--rf-ink);
  font-size: 14px;
}
.drop-zone small,
.upload-status {
  color: var(--rf-muted);
  font-size: 12px;
}
.image-upload.is-compact {
  width: auto;
}
.compact-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.upload-secondary-row {
  margin-top: 8px;
  display: flex;
  justify-content: flex-start;
}
.library-button {
  min-height: 34px;
  padding: 5px 12px;
  font-size: 13px;
  font-weight: 500;
  background: var(--rf-surface);
  border-color: var(--rf-line);
  color: var(--rf-primary-text);
}
.library-button.compact {
  min-height: 40px;
  padding: 6px 12px;
}
.upload-status {
  margin: 6px 0 0;
}
</style>
