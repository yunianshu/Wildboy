<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { request, currentUser, errorMessage } from "../api";
const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ uploaded: [url: string] }>();
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
    if (alive) busy.value = false;
  }
}
</script>
<template>
  <div class="image-upload">
    <label
      >上传图片<input
        type="file"
        accept="image/png,image/jpeg"
        :disabled="disabled || busy"
        @change="upload" /></label
    ><span v-if="busy">上传中…</span>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
  </div>
</template>
