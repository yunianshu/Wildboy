<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, shallowRef } from "vue";
import { currentUser, errorMessage } from "../api";
import { askConfirm } from "../confirm";
import { cleanWechatPreview, importWechatHtml } from "../wechatPaste";
import FormModal from "./FormModal.vue";
import ImageUpload from "./ImageUpload.vue";
import "../styles/wechat-prose.css";
const props = defineProps<{
  initial?: string;
  paste?: string;
  validation?: string;
}>();
const emit = defineEmits<{ apply: [html: string]; close: [] }>();
const field = ref<HTMLElement>();
const uploading = ref(false);
const changed = ref(false);
const hasContent = ref(false);
const error = ref("");
const warnings = ref<string[]>([]);
const images = shallowRef<HTMLImageElement[]>([]);
const imageIndex = ref(0);
const replacement = ref<InstanceType<typeof ImageUpload>>();
const replacing = ref(false);
const actor = currentUser.value;
let alive = true;
onUnmounted(() => {
  alive = false;
});
function updateState() {
  images.value = Array.from(field.value?.querySelectorAll("img") ?? []);
  if (imageIndex.value >= images.value.length) imageIndex.value = 0;
  hasContent.value = !!(
    field.value?.textContent?.trim() ||
    field.value?.querySelector("img, hr, table")
  );
}
function imageClicked(event: MouseEvent) {
  if (
    !(event.target instanceof HTMLImageElement) ||
    uploading.value ||
    replacing.value
  )
    return;
  event.preventDefault();
  const index = images.value.indexOf(event.target);
  if (index < 0) return;
  imageIndex.value = index;
  replacement.value?.chooseFile();
}
function replaceImage(url: string) {
  const image = images.value[imageIndex.value];
  if (!image || !field.value?.contains(image)) return;
  image.setAttribute("src", url);
  changed.value = true;
}
async function ingest(html: string) {
  if (uploading.value || !field.value) return;
  uploading.value = true;
  error.value = "";
  try {
    const result = await importWechatHtml(html);
    if (!alive || actor !== currentUser.value || !field.value) return;
    if (!result.html.trim()) {
      error.value = "没有可导入的正文，请重新复制文章内容。";
      return;
    }
    // Insert at the selection while editing. The initial paste fills a new fragment.
    const content = document.createElement("template");
    content.innerHTML = cleanWechatPreview(result.html);
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (range && field.value.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const last = content.content.lastChild;
      range.insertNode(content.content);
      if (last) {
        range.setStartAfter(last);
        range.collapse(true);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    } else field.value.append(content.content);
    warnings.value = result.warnings;
    changed.value = true;
    updateState();
  } catch (cause) {
    if (alive && actor === currentUser.value) error.value = errorMessage(cause);
  } finally {
    if (alive) uploading.value = false;
  }
}
function paste(event: ClipboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  if (uploading.value) return;
  const data = event.clipboardData;
  const html = data?.getData("text/html");
  if (html) void ingest(html);
  else if (data)
    document.execCommand("insertText", false, data.getData("text/plain"));
}
async function close() {
  if (
    !uploading.value &&
    !replacing.value &&
    (!changed.value || (await askConfirm("放弃这次片段编辑？")))
  )
    emit("close");
}
onMounted(async () => {
  if (!field.value) return;
  field.value.innerHTML = cleanWechatPreview(props.initial ?? "");
  updateState();
  await nextTick();
  field.value?.focus();
  if (props.paste) await ingest(props.paste);
});
</script>
<template>
  <FormModal
    size="lg"
    title="公众号片段"
    :busy="uploading || replacing"
    @close="close"
  >
    <p class="fragment-hint">在下方粘贴公众号正文，可直接修改文字。</p>
    <div
      ref="field"
      class="fragment-field wechat-prose"
      role="textbox"
      aria-multiline="true"
      aria-label="公众号片段内容"
      :contenteditable="!uploading && !replacing"
      @click="imageClicked"
      @paste="paste"
      @drop.prevent
      @input="
        changed = true;
        updateState();
      "
    ></div>
    <div v-if="images.length" class="fragment-images">
      <label
        >片段图片
        <select
          v-model.number="imageIndex"
          :disabled="uploading || replacing"
          aria-label="选择要替换的图片"
        >
          <option v-for="(img, index) in images" :key="index" :value="index">
            第 {{ index + 1 }} 张{{ img.alt ? " · " + img.alt : "" }}
          </option>
        </select>
      </label>
      <ImageUpload
        ref="replacement"
        compact
        label="替换图片"
        :disabled="uploading || replacing"
        @busy="replacing = $event"
        @uploaded="replaceImage"
      />
    </div>
    <p v-if="uploading" role="status" class="fragment-hint">
      正在导入排版和图片…
    </p>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <p v-if="validation" role="alert" class="error-box">{{ validation }}</p>
    <p
      v-for="warning in warnings"
      :key="warning"
      class="fragment-hint"
      role="status"
    >
      {{ warning }}
    </p>
    <template #footer>
      <button
        class="secondary"
        type="button"
        :disabled="uploading || replacing"
        @click="close"
      >
        取消
      </button>
      <button
        class="primary"
        type="button"
        :disabled="uploading || replacing || !hasContent"
        @click="emit('apply', cleanWechatPreview(field?.innerHTML ?? ''))"
      >
        {{ initial ? "应用修改" : "插入正文" }}
      </button>
    </template>
  </FormModal>
</template>
<style scoped>
.fragment-hint {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--rf-muted);
}
.fragment-field {
  min-height: 160px;
  max-height: 55vh;
  overflow: auto;
  overflow-wrap: anywhere;
  padding: 16px;
  border: 1px solid var(--rf-field-line);
  border-radius: 8px;
  color: var(--rf-ink);
  background: var(--rf-surface);
  font-size: 16px;
  line-height: 1.7;
}
.fragment-field:empty::before {
  content: "粘贴公众号正文";
  color: var(--rf-muted);
  pointer-events: none;
}
.fragment-field :deep(img) {
  cursor: pointer;
  max-width: 100%;
  height: auto;
}
.fragment-images,
.fragment-images label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
}
.fragment-images {
  padding-block: 12px;
}
.fragment-images label {
  margin: 0;
  font-size: 13px;
  color: var(--rf-muted);
}
.fragment-images select {
  width: auto;
  max-width: 180px;
  margin: 0;
}
.fragment-images .image-upload {
  width: auto;
}
</style>
