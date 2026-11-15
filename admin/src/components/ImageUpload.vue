<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { request, currentUser, errorMessage } from "../api";
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ uploaded: [url: string]; busy: [value: boolean] }>();
const busy = ref(false),
  error = ref("");
let alive = true;
onUnmounted(() => {
  alive = false;
});
async function upload(event: Event) {
  const target = event.target as HTMLInputElement,
    file = target.files?.[0];
  target.value = "";
  if (!file || busy.value || props.disabled) return;
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
  <div class="image-upload">
    <label class="upload-control" :class="{ 'is-disabled': disabled || busy }">
      <span class="upload-button">选择图片</span>
      <span class="upload-help">JPG / PNG，不超过 4MB</span>
      <input
        class="upload-input"
        type="file"
        aria-label="上传图片"
        accept="image/png,image/jpeg"
        :disabled="disabled || busy"
        @change="upload"
      />
    </label>
    <span v-if="busy" class="upload-progress">正在上传…</span>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
  </div>
</template>
<style scoped>
.image-upload {
  margin: 8px 0 18px;
}
.upload-control {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 10px 12px;
  margin: 0;
  border: 1px dashed #bdcec3;
  border-radius: 10px;
  background: #f8fbf9;
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}
.upload-control:hover {
  border-color: var(--admin-primary);
  background: var(--admin-tint);
}
.upload-control.is-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.upload-button {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid var(--admin-line);
  border-radius: 8px;
  color: var(--admin-primary);
  background: #fff;
  font-size: 12px;
  font-weight: 600;
}
.upload-help {
  color: var(--admin-muted);
  font-size: 11px;
  font-weight: 400;
}
.upload-input {
  position: absolute;
  width: 1px;
  height: 1px;
  min-height: 1px;
  padding: 0;
  margin: 0;
  opacity: 0;
  overflow: hidden;
}
.upload-control:focus-within {
  outline: 3px solid var(--admin-accent);
  outline-offset: 2px;
}
.upload-progress {
  display: block;
  margin-top: 7px;
  color: var(--admin-primary);
  font-size: 11px;
}
.image-upload .error-box {
  margin-bottom: 0;
}
</style>
