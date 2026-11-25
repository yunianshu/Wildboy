<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { request, currentUser, errorMessage } from "../api";
import AppIcon from "./AppIcon.vue";
const props = defineProps<{
  disabled?: boolean;
  label?: string;
  preview?: string;
  previewAlt?: string;
}>();
const emit = defineEmits<{ uploaded: [url: string]; busy: [value: boolean] }>();
const busy = ref(false),
  error = ref("");
const input = ref<HTMLInputElement>();
const dragging = ref(false);
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
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 4 * 1024 * 1024
  ) {
    error.value = "请选择 4MB 内 JPG/PNG 图片";
    return;
  }
  const actor = currentUser.value;
  busy.value = true;
  emit("busy", true);
  error.value = "";
  try {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
    if (!alive || currentUser.value !== actor) return;
    const result = await request<{ url: string }>("/admin/media", {
      method: "POST",
      body: JSON.stringify({ dataBase64: data }),
    });
    if (alive && currentUser.value === actor) emit("uploaded", result.url);
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
    @dragover="dragOver"
    @dragleave="dragLeave"
    @drop="drop"
  >
    <button
      type="button"
      class="drop-zone"
      :class="{ 'is-dragging': dragging, 'has-preview': !!preview }"
      :disabled="disabled || busy"
      :aria-label="label || '上传图片'"
      @click="input?.click()"
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
        <small v-if="!disabled && !preview">JPG / PNG，最大 4 MB</small>
      </span>
    </button>
    <input
      ref="input"
      type="file"
      hidden
      accept="image/png,image/jpeg"
      :disabled="disabled || busy"
      @change="pick"
    />
    <p v-if="busy" class="upload-status" role="status">正在上传图片…</p>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
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
.upload-status {
  margin: 6px 0 0;
}
</style>
