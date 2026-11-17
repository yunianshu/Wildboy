<script setup lang="ts">
import { askConfirm } from "../confirm";
import { nextTick, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { request, currentUser, errorMessage } from "../api";

// 有道云风格的 Markdown 编辑器（Vditor WYSIWYG 模式），内嵌在文章编辑页文档流中。
// 保存动作由页面顶栏触发（expose save），组件只负责正文内容的加载、编辑与上传。
// 存储：article.markdown（服务端用 commonmark 渲染白名单 HTML 给小程序）。
const props = defineProps<{
  path: string;
  disabled?: boolean;
  managedNavigation?: boolean;
  /** 编辑器高度（px），默认 520。 */
  height?: number;
}>();
const emit = defineEmits<{ saved: [version: number] }>();

const host = ref<HTMLElement | null>(null);
const version = ref(0);
const busy = ref(false);
const error = ref("");
const loaded = ref(false);
const dirty = ref(false);
let generation = 0;
let vditor: Vditor | null = null;
let markdown = "";
let inited = false;
let applying = false;

async function load() {
  const n = ++generation,
    actor = currentUser.value;
  loaded.value = false;
  dirty.value = false;
  error.value = "";
  busy.value = true;
  try {
    const d = await request<{ markdown: string; version: number }>(props.path);
    if (n === generation && actor === currentUser.value) {
      markdown = d.markdown ?? "";
      version.value = d.version;
      loaded.value = true;
      await nextTick();
      maybeInit();
      if (vditor) {
        applying = true;
        vditor.setValue(markdown);
        applying = false;
      }
    }
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
watch(
  () => props.path,
  () => void load(),
  { immediate: true },
);
watch(
  () => props.disabled,
  () => syncDisabled(),
);
function syncDisabled() {
  if (!vditor) return;
  if (props.disabled) vditor.disabled();
  else vditor.enable();
}
async function handleUpload(files: File[]): Promise<string | null> {
  const file = files?.[0];
  if (!file) return null;
  if (file.size > 4 * 1024 * 1024) {
    error.value = "请选择 4MB 内 JPG/PNG 图片";
    return null;
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
    if (currentUser.value !== actor) return null;
    const result = await request<{ url: string }>("/admin/media", {
      method: "POST",
      body: JSON.stringify({ dataBase64: data }),
    });
    return `![](${result.url})\n`;
  } catch (e) {
    error.value = errorMessage(e);
    return null;
  } finally {
    busy.value = false;
  }
}
function maybeInit() {
  if (inited || !loaded.value || !host.value) return;
  inited = true;
  void nextTick(() => {
    vditor = new Vditor(host.value as HTMLElement, {
      cdn: "/vditor",
      lang: "zh_CN",
      mode: "wysiwyg",
      value: markdown,
      height: props.height ?? 520,
      placeholder: "开始写正文…输入 / 呼出格式菜单，或直接粘贴图片",
      cache: { enable: false },
      toolbar: [
        "headings",
        "bold",
        "italic",
        "strike",
        "|",
        "list",
        "ordered-list",
        "check",
        "outdent",
        "indent",
        "|",
        "quote",
        "code",
        "inline-code",
        "link",
        "table",
        "|",
        "undo",
        "redo",
        "|",
        "upload",
        "line",
        "|",
        "edit-mode",
        "fullscreen",
      ],
      upload: {
        accept: "image/jpeg, image/png",
        multiple: false,
        // vditor 的 handler 类型是 Promise<string>|Promise<null> 联合，先返回
        // Promise<string|null> 再收窄。
        handler(files) {
          return handleUpload(files) as unknown as
            Promise<string> | Promise<null>;
        },
      },
      input: () => {
        if (!applying) dirty.value = true;
      },
      after: () => {
        applying = true;
        vditor?.setValue(markdown);
        applying = false;
        syncDisabled();
        // 供端到端验收等待编辑器就绪
        if (host.value) host.value.dataset.vditorReady = "1";
      },
    });
  });
}
async function save() {
  if (busy.value || !loaded.value || props.disabled || !vditor) return;
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const d = await request<{ markdown: string; version: number }>(props.path, {
      method: "PUT",
      body: JSON.stringify({
        markdown: vditor.getValue(),
        version: version.value,
      }),
    });
    if (n === generation && actor === currentUser.value) {
      markdown = d.markdown;
      version.value = d.version;
      dirty.value = false;
      emit("saved", d.version);
    }
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
async function canLeave() {
  return !dirty.value || (await askConfirm("图文尚未保存，确定离开吗？"));
}
defineExpose({ canLeave, dirty, busy, loaded, save });
onBeforeRouteLeave(
  async (to) =>
    props.managedNavigation || to.path === "/login" || (await canLeave()),
);
onUnmounted(() => {
  generation++;
  vditor?.destroy();
  vditor = null;
});
</script>
<template>
  <section class="md-editor">
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <button
      v-if="!loaded"
      class="secondary button"
      :disabled="busy"
      @click="load"
    >
      重新加载图文
    </button>
    <div
      ref="host"
      class="md-canvas"
      aria-label="图文正文（Markdown 编辑器）"
    ></div>
  </section>
</template>
<style scoped>
.md-editor {
  margin-top: 4px;
}
/* 定制 vditor 皮肤：去掉默认边框与阴影，融入文档画布。 */
.md-editor :deep(.vditor) {
  border: 0;
  border-radius: 10px;
  box-shadow: 0 0 0 1px var(--admin-line);
  background: var(--admin-surface);
}
.md-editor :deep(.vditor-toolbar) {
  background: var(--admin-surface);
  border-bottom: 1px solid var(--admin-hairline);
  border-radius: 10px 10px 0 0;
  padding: 4px 8px;
}
.md-editor :deep(.vditor-toolbar--pin) {
  border-radius: 10px 10px 0 0;
}
.md-editor :deep(.vditor-toolbar svg) {
  fill: var(--admin-muted);
}
.md-editor :deep(.vditor-toolbar .vditor-toolbar__item:hover svg),
.md-editor :deep(.vditor-toolbar .vditor-toolbar__item--current svg) {
  fill: var(--admin-primary);
}
.md-editor :deep(.vditor-content) {
  border-radius: 0 0 10px 10px;
}
.md-editor :deep(.vditor-wysiwyg) {
  font-size: 16px;
  line-height: 1.85;
  color: var(--admin-body);
  padding: 20px 24px;
}
.md-editor :deep(.vditor-wysiwyg h1) {
  font-size: 25px;
  font-weight: 800;
  letter-spacing: -0.01em;
}
.md-editor :deep(.vditor-wysiwyg h2) {
  font-size: 20px;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.md-editor :deep(.vditor-wysiwyg h3) {
  font-size: 17px;
  font-weight: 700;
}
.md-editor :deep(.vditor-wysiwyg blockquote) {
  border-left: 3px solid var(--admin-primary);
  background: rgba(236, 253, 245, 0.6);
  border-radius: 0 8px 8px 0;
  padding: 8px 16px;
  color: var(--rf-primary-text);
}
.md-editor :deep(.vditor-wysiwyg table) {
  border-collapse: collapse;
}
.md-editor :deep(.vditor-wysiwyg table thead th) {
  background: var(--admin-paper);
}
.md-editor :deep(.vditor-wysiwyg th),
.md-editor :deep(.vditor-wysiwyg td) {
  border: 0;
  border-bottom: 1px solid var(--admin-hairline);
}
.md-editor :deep(.vditor-wysiwyg img) {
  border-radius: 8px;
}
.md-editor :deep(.vditor-wysiwyg code) {
  background: var(--admin-paper);
}
</style>
