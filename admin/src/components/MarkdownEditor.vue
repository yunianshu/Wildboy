<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { request, currentUser, errorMessage } from "../api";

// 有道云风格的 Markdown 编辑器（Vditor WYSIWYG 模式），替换文章的块编辑器。
// 存储：article.markdown（服务端用 commonmark 渲染白名单 HTML 给小程序）。
// 接口与 RichContentEditor 保持一致，ArticlesView 仅换组件名。
const props = defineProps<{
  path: string;
  disabled?: boolean;
  managedNavigation?: boolean;
  /** 编辑页签是否可见：Vditor 需要可见容器才能正确布局，隐藏时延迟初始化。 */
  active?: boolean;
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
  () => props.active,
  (visible) => {
    if (visible) void maybeInit();
  },
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
  if (inited || !loaded.value || props.active === false || !host.value) return;
  inited = true;
  void nextTick(() => {
    vditor = new Vditor(host.value as HTMLElement, {
      cdn: "/vditor",
      lang: "zh_CN",
      mode: "wysiwyg",
      value: markdown,
      height: 480,
      placeholder: "用 Markdown 记录行程、装备与注意事项…",
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
function canLeave() {
  return !dirty.value || window.confirm("图文尚未保存，确定离开吗？");
}
defineExpose({ canLeave, dirty, busy, loaded });
onBeforeRouteLeave(
  (to) => props.managedNavigation || to.path === "/login" || canLeave(),
);
onUnmounted(() => {
  generation++;
  vditor?.destroy();
  vditor = null;
});
</script>
<template>
  <section class="editor-section rich-editor">
    <h2>图文正文 · Markdown</h2>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <button
      v-if="!loaded"
      class="secondary button"
      :disabled="busy"
      @click="load"
    >
      重新加载图文
    </button>
    <div v-show="loaded" class="md-editor-wrap">
      <div
        ref="host"
        class="md-editor"
        aria-label="图文正文（Markdown 编辑器）"
      ></div>
      <div class="rich-tools md-editor-tools">
        <span class="muted md-editor-hint"
          >支持 Markdown 与图片上传；正文由系统渲染为小程序页面。</span
        >
        <button
          type="button"
          class="primary button"
          :disabled="busy || disabled || !loaded"
          @click="save"
        >
          {{ busy ? "保存中…" : "保存图文" }}
        </button>
      </div>
    </div>
  </section>
</template>
<style scoped>
.md-editor-wrap {
  margin-top: 4px;
}
.md-editor-tools {
  margin-top: 12px;
  justify-content: flex-end;
}
.md-editor-hint {
  margin-right: auto;
  font-size: 11px;
}
</style>
