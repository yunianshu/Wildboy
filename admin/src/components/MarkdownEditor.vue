<script setup lang="ts">
import { uploadAdminImage } from "../image-upload";
import UiState from "./UiState.vue";
import AppIcon from "./AppIcon.vue";
import { askConfirm } from "../confirm";
import { computed, nextTick, onUnmounted, ref, shallowRef, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { ApiError, request, currentUser, errorMessage } from "../api";
import MarkdownBlockOrganizer from "./MarkdownBlockOrganizer.vue";
import WechatFragmentDialog from "./WechatFragmentDialog.vue";
import { cleanWechatPreview, readWechatClipboard } from "../wechatPaste";
import { decodeWechatFence, encodeWechatFence } from "./wechatFence";
import { serializeBlockOrder } from "./markdownBlockOrder";

// Markdown 编辑器（Vditor WYSIWYG 模式），内嵌在内容编辑页文档流中。
// 保存动作由所属编辑页触发（expose save），组件只负责正文内容的加载、编辑与上传。
// 服务端把 Markdown 转成小程序原生渲染使用的结构化节点。
const props = defineProps<{
  path?: string;
  disabled?: boolean;
  managedNavigation?: boolean;
  /** 编辑器高度（px），默认 520。 */
  height?: number;
  placeholder?: string;
  components?: boolean;
}>();
const emit = defineEmits<{ saved: [version: number] }>();

const host = ref<HTMLElement | null>(null);
const version = ref(0);
const loading = ref(false);
const busy = ref(false);
const error = ref("");
const versionConflict = ref(false);
const loaded = ref(false);
const dirty = ref(false);
const ready = ref(false);
const choosingImage = ref(false);
const fragment = shallowRef<{
  index?: number;
  initial?: string;
  paste?: string;
  placement?: Placement;
}>();
const writeBusy = computed(
  () => busy.value || choosingImage.value || !!fragment.value,
);
const workflowBusy = computed(() => loading.value || writeBusy.value);
const body = ref<HTMLElement>();
const imageInput = ref<HTMLInputElement>();
const markerTop = ref<number>();
const fragmentValidation = ref("");
const articleLimit = 200000;
const arranged = shallowRef<Element[] | null>(null);
const componentMime = "application/x-wildboy-article-component";
const contentComponents = [
  { kind: "text", label: "段落" },
  { kind: "image", label: "图片" },
  { kind: "table", label: "表格" },
  { kind: "quote", label: "引用" },
  { kind: "line", label: "分隔线" },
] as const;
const shapeComponents = [
  { kind: "circle", label: "圆形" },
  { kind: "square", label: "方形" },
  { kind: "triangle", label: "三角形" },
] as const;
type ComponentKind = (
  typeof contentComponents | typeof shapeComponents
)[number]["kind"];
type ShapeKind = (typeof shapeComponents)[number]["kind"];
type Placement = { editor: HTMLElement; before: Element | null };
const snippets: Partial<Record<ComponentKind, string>> = {
  text: "在此输入正文",
  table: "| 表头 1 | 表头 2 |\n| --- | --- |\n|  |  |\n|  |  |",
  quote: "> 在此输入引用",
  line: "***",
};
let imagePlacement: Placement | undefined;
let generation = 0;
let vditor: Vditor | null = null;
let markdown = "";
let inited = false;
let disposed = false;
let applying = false;

async function load() {
  const n = ++generation,
    actor = currentUser.value;
  loaded.value = false;
  dirty.value = false;
  error.value = "";
  arranged.value = null;
  fragment.value = undefined;
  versionConflict.value = false;
  loading.value = true;
  try {
    const d = props.path
      ? await request<{ markdown: string; version: number }>(props.path)
      : { markdown: "", version: 0 };
    if (n === generation && actor === currentUser.value) {
      markdown = d.markdown ?? "";
      version.value = d.version;
      loaded.value = true;
      await nextTick();
      maybeInit();
      if (vditor && ready.value) {
        applying = true;
        vditor.setValue(markdown);
        markdown = vditor.getValue();
        applying = false;
      }
    }
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) loading.value = false;
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
  if (!vditor || !ready.value) return;
  if (props.disabled) vditor.disabled();
  else vditor.enable();
}
function activeEditor() {
  if (!vditor || !ready.value) return;
  const mode = vditor.getCurrentMode();
  return host.value?.querySelector<HTMLElement>(
    mode === "sv" ? "pre.vditor-sv" : `.vditor-${mode} pre.vditor-reset`,
  );
}
function canInsert() {
  return ready.value && loaded.value && !workflowBusy.value && !props.disabled;
}
function readElements() {
  // Lute parses whole top-level Markdown elements, including nested lists and fenced code.
  const template = document.createElement("template");
  const value = editorValue();
  if (vditor && value?.trim())
    template.innerHTML = vditor.vditor.lute.Md2VditorDOM(value);
  return Array.from(template.content.children);
}
function editorValue() {
  const value = vditor?.getValue() ?? "";
  if (
    value.startsWith("---\n") &&
    vditor?.getCurrentMode?.() === "wysiwyg" &&
    activeEditor()?.firstElementChild?.tagName === "HR"
  ) {
    return value.replace(/^---/, "***");
  }
  return value;
}
function startArrange() {
  if (canInsert()) arranged.value = readElements();
}
function applyArrangement(elements: Element[]) {
  if (!canInsert() || !vditor) return;
  vditor.setValue(serializeBlockOrder(elements, vditor.vditor.lute));
  syncDirty();
}
async function resumeWriting(index?: number) {
  arranged.value = null;
  await nextTick();
  const editor = activeEditor();
  if (!editor || !vditor) return;
  vditor.focus();
  if (index === undefined) return;
  const initial = readElements()[index]?.querySelector(
    "pre > code.language-wildboy-wechat",
  )?.textContent;
  if (initial) {
    fragment.value = { index, initial: decodeWechatFence(initial) };
    return;
  }
  const element = editor.children[index];
  if (!element) return;
  const target = element.querySelector("td, th, li, code") ?? element;
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  element.scrollIntoView({ block: "nearest" });
}
function pasteWechat(event: ClipboardEvent) {
  if (!props.components || !canInsert()) return;
  const paste = readWechatClipboard(event);
  if (!paste) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  fragment.value = { paste, placement: selectedPlacement() };
}
function applyWechat(html: string) {
  const draft = fragment.value;
  if (!draft || props.disabled || !vditor) return;
  const elements = readElements();
  const fence = "```";
  const value =
    fence + "wildboy-wechat\n" + encodeWechatFence(html) + "\n" + fence;
  if (draft.index === undefined) {
    const template = document.createElement("template");
    template.innerHTML = vditor.vditor.lute.Md2VditorDOM(value);
    const imported = template.content.firstElementChild;
    if (!imported) return;
    const target = draft.placement;
    const before = target?.before
      ? Array.from(target.editor.children).indexOf(target.before)
      : -1;
    elements.splice(before >= 0 ? before : elements.length, 0, imported);
  } else {
    const code = elements[draft.index]?.querySelector(
      "pre > code.language-wildboy-wechat",
    );
    if (!code) return;
    code.textContent = encodeWechatFence(html);
  }
  const next = serializeBlockOrder(elements, vditor.vditor.lute);
  if (next.length > articleLimit) {
    fragmentValidation.value =
      "加入片段后正文超过 20 万字符。请精简本次粘贴的内容，或分篇保存。";
    return;
  }
  fragment.value = undefined;
  fragmentValidation.value = "";
  vditor.setValue(next);
  syncDirty();
}
function renderWechat(panel: HTMLElement) {
  const preview = document.createElement("div");
  preview.className = "wechat-fragment-preview wechat-prose";
  preview.innerHTML = cleanWechatPreview(
    decodeWechatFence(panel.firstElementChild?.textContent ?? ""),
  );
  preview.inert = true;
  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "wechat-fragment-edit";
  edit.textContent = "编辑公众号片段";
  panel.replaceChildren(preview, edit);
}
function editWechat(event: MouseEvent) {
  const target =
    event.target instanceof Element
      ? event.target.closest(".vditor-wysiwyg__block, .vditor-ir__node")
      : null;
  const code = target?.querySelector("pre > code.language-wildboy-wechat");
  if (!target || !code || !canInsert()) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const index = Array.from(activeEditor()?.children ?? []).indexOf(target);
  if (index >= 0)
    fragment.value = {
      index,
      initial: decodeWechatFence(code.textContent ?? ""),
    };
}
function selectedPlacement(): Placement | undefined {
  const editor = activeEditor();
  if (!editor) return;
  const anchor = window.getSelection()?.anchorNode;
  const block = Array.from(editor.children).find((child) =>
    child.contains(anchor ?? null),
  );
  return { editor, before: block?.nextElementSibling ?? null };
}
function placeMarkdown(value: string, placement?: Placement) {
  const editor = activeEditor();
  if (!editor || !vditor) return;
  const before =
    placement?.editor === editor && placement.before?.parentElement === editor
      ? placement.before
      : null;
  const range = document.createRange();
  const selection = window.getSelection();
  if (!selection) return;
  vditor.focus();
  if (vditor.getCurrentMode() === "sv") {
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    vditor.insertMD(`\n\n${value}\n\n`);
  } else {
    // Vditor merges single paragraphs into the current block unless given an empty insertion point.
    const anchor = document.createElement("p");
    anchor.dataset.block = "0";
    anchor.append(document.createElement("br"));
    editor.insertBefore(anchor, before);
    range.setStart(anchor, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    vditor.insertMD(value);
    if (!anchor.textContent && anchor.firstElementChild?.tagName === "BR")
      anchor.remove();
  }
  dirty.value = true;
}
function shapePng(kind: ShapeKind) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 240;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法生成形状，请重试。");
  const colors = getComputedStyle(canvas.ownerDocument.documentElement);
  context.fillStyle = colors.getPropertyValue("--rf-soft").trim();
  context.strokeStyle = colors.getPropertyValue("--rf-primary").trim();
  context.lineWidth = 5;
  context.lineJoin = "round";
  context.beginPath();
  if (kind === "circle") context.arc(120, 120, 86, 0, Math.PI * 2);
  else if (kind === "square") context.rect(34, 34, 172, 172);
  else {
    context.moveTo(120, 27);
    context.lineTo(216, 200);
    context.lineTo(24, 200);
    context.closePath();
  }
  context.fill();
  context.stroke();
  return canvas.toDataURL("image/png").split(",")[1];
}
async function uploadImage(
  image: File | string,
  placement?: Placement,
  caption = "",
) {
  if (!canInsert()) return;
  const actor = currentUser.value;
  const n = generation;
  busy.value = true;
  error.value = "";
  try {
    const isCurrent = () =>
      generation === n && currentUser.value === actor && !props.disabled;
    const result =
      typeof image === "string"
        ? await request<{ url: string }>("/admin/media", {
            method: "POST",
            body: JSON.stringify({ dataBase64: image }),
          })
        : await uploadAdminImage(image, isCurrent);
    if (!result || !isCurrent()) return;
    if (
      !/^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpe?g|webp)$/.test(
        result.url,
      )
    ) {
      throw new Error("图片地址无效，请重试。");
    }
    placeMarkdown(`![${caption}](${result.url})`, placement);
  } catch (e) {
    if (generation === n && currentUser.value === actor)
      error.value = errorMessage(e);
  } finally {
    if (generation === n) busy.value = false;
  }
}
function insertComponent(kind: ComponentKind, placement = selectedPlacement()) {
  if (!canInsert()) return;
  error.value = "";
  if (kind === "image") {
    choosingImage.value = true;
    imagePlacement = placement;
    imageInput.value?.click();
    return;
  }
  const shape = shapeComponents.find((component) => component.kind === kind);
  if (shape) {
    try {
      void uploadImage(shapePng(shape.kind), placement, shape.label);
    } catch (e) {
      error.value = errorMessage(e);
    }
    return;
  }
  const value = snippets[kind];
  if (value) placeMarkdown(value, placement);
}
function pickImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  const target = imagePlacement;
  cancelImage();
  if (file) void uploadImage(file, target);
}
function cancelImage() {
  choosingImage.value = false;
  imagePlacement = undefined;
}
function startDrag(event: DragEvent, kind: ComponentKind) {
  if (!canInsert() || !event.dataTransfer) return;
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(componentMime, kind);
}
function dragPlacement(event: DragEvent): Placement | undefined {
  const editor = activeEditor();
  if (!editor) return;
  const blocks = Array.from(editor.children);
  const before =
    blocks.find((block) => {
      const rect = block.getBoundingClientRect();
      return event.clientY < rect.top + rect.height / 2;
    }) ?? null;
  return { editor, before };
}
function acceptsDrag(event: DragEvent) {
  return event.dataTransfer?.types.some(
    (type) => type === "Files" || (props.components && type === componentMime),
  );
}
function stopDrag() {
  markerTop.value = undefined;
}
function dragOver(event: DragEvent) {
  if (!acceptsDrag(event)) return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = canInsert() ? "copy" : "none";
  if (!canInsert() || !body.value) return;
  const target = dragPlacement(event);
  if (!target) return;
  const canvas = body.value.getBoundingClientRect();
  const editor = target.editor.getBoundingClientRect();
  const edge =
    target.before?.getBoundingClientRect().top ??
    target.editor.lastElementChild?.getBoundingClientRect().bottom ??
    event.clientY;
  markerTop.value =
    Math.min(editor.bottom - 4, Math.max(editor.top + 4, edge)) - canvas.top;
}
function dragLeave(event: DragEvent) {
  if (
    !(event.relatedTarget instanceof Node) ||
    !body.value?.contains(event.relatedTarget)
  )
    stopDrag();
}
function drop(event: DragEvent) {
  stopDrag();
  if (!acceptsDrag(event) || !event.dataTransfer) return;
  event.preventDefault();
  event.stopPropagation();
  if (!canInsert()) return;
  const target = dragPlacement(event);
  const file = event.dataTransfer.files[0];
  if (file) {
    void uploadImage(file, target);
    return;
  }
  const kind = event.dataTransfer.getData(componentMime);
  const component = [...contentComponents, ...shapeComponents].find(
    (item) => item.kind === kind,
  );
  if (component) insertComponent(component.kind, target);
}
function maybeInit() {
  if (inited || !loaded.value || !host.value) return;
  inited = true;
  void nextTick(() => {
    if (!host.value) return;
    vditor = new Vditor(host.value, {
      cdn: "/vditor",
      lang: "zh_CN",
      mode: "wysiwyg",
      customRenders: [{ language: "wildboy-wechat", render: renderWechat }],
      value: markdown,
      height: props.height ?? 520,
      placeholder:
        props.placeholder || "开始写正文…输入 / 呼出格式菜单，或直接粘贴图片",
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
        async handler(files) {
          if (files[0]) await uploadImage(files[0], selectedPlacement());
          return null;
        },
      },
      input: syncDirty,
      after: () => {
        if (disposed) {
          vditor?.destroy();
          vditor = null;
          return;
        }
        applying = true;
        vditor?.setValue(markdown);
        if (vditor) markdown = vditor.getValue();
        applying = false;
        ready.value = true;
        syncDisabled();
        // 供端到端验收等待编辑器就绪
        if (host.value) host.value.dataset.vditorReady = "1";
      },
    });
  });
}
function syncDirty() {
  if (!applying && loaded.value && vditor)
    dirty.value = editorValue() !== markdown;
}
function validateLength() {
  if (props.components && editorValue().length > articleLimit) {
    error.value = "正文超过 20 万字符，请精简后再保存。";
    return false;
  }
  return true;
}
function readContent() {
  if (!loaded.value || !vditor) return null;
  return { markdown: editorValue(), version: version.value };
}
function markSaved(
  content: { markdown?: string; version: number },
  previousVersion: number,
) {
  if (version.value !== previousVersion) return;
  version.value = content.version;
  if (content.markdown !== undefined) {
    markdown = content.markdown;
    dirty.value = !!vditor && editorValue() !== markdown;
  }
}
async function save() {
  const content = readContent();
  if (workflowBusy.value || props.disabled || !content || !props.path) return;
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const d = await request<{ markdown: string; version: number }>(props.path, {
      method: "PUT",
      body: JSON.stringify(content),
    });
    if (n === generation && actor === currentUser.value) {
      markSaved(d, content.version);
      emit("saved", d.version);
    }
  } catch (e) {
    if (n === generation) {
      versionConflict.value = e instanceof ApiError && e.status === 409;
      error.value = errorMessage(e);
    }
  } finally {
    if (n === generation) busy.value = false;
  }
}
async function canLeave() {
  if (writeBusy.value) return false;
  syncDirty();
  return !dirty.value || (await askConfirm("图文尚未保存，确定离开吗？"));
}
function openWechatPaste() {
  if (canInsert()) fragment.value = { placement: selectedPlacement() };
}
defineExpose({
  openWechatPaste,
  canLeave,
  dirty,
  busy: workflowBusy,
  writeBusy,
  loaded,
  ready,
  save,
  load,
  readContent,
  validateLength,
  markSaved,
  versionConflict,
});
onBeforeRouteLeave(
  async (to) =>
    props.managedNavigation || to.path === "/login" || (await canLeave()),
);
onUnmounted(() => {
  generation++;
  disposed = true;
  if (ready.value) {
    vditor?.destroy();
    vditor = null;
  }
});
</script>
<template>
  <section class="md-editor">
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <UiState v-if="!loaded && loading" kind="loading" compact
      >正在读取正文…</UiState
    >
    <button
      v-if="!loaded && !loading"
      class="secondary button"
      :disabled="busy"
      @click="load"
    >
      重试
    </button>
    <div class="md-layout">
      <nav v-if="components" class="writing-tools" aria-label="正文编辑方式">
        <button
          type="button"
          :aria-pressed="!arranged"
          :disabled="!canInsert()"
          @click="arranged && resumeWriting()"
        >
          <AppIcon name="text" :size="16" />写正文
        </button>
        <button
          type="button"
          :aria-pressed="!!arranged"
          :disabled="!canInsert()"
          @click="!arranged && startArrange()"
        >
          <AppIcon name="grip" :size="16" />整理内容块
        </button>
      </nav>
      <MarkdownBlockOrganizer
        v-if="arranged"
        :elements="arranged"
        :disabled="!canInsert()"
        @change="applyArrangement"
        @edit="resumeWriting"
      />
      <aside
        v-if="components"
        v-show="!arranged"
        class="component-panel"
        aria-label="正文组件"
      >
        <div class="component-grid">
          <button
            v-for="item in contentComponents"
            :key="item.kind"
            type="button"
            class="component-button"
            :disabled="!canInsert()"
            :draggable="canInsert()"
            @dragstart="startDrag($event, item.kind)"
            @dragend="stopDrag"
            @click="insertComponent(item.kind)"
          >
            <AppIcon :name="item.kind" />{{ item.label }}
          </button>
        </div>
        <button
          type="button"
          class="component-button"
          :disabled="!canInsert()"
          @click="fragment = { placement: selectedPlacement() }"
        >
          <AppIcon name="document" :size="16" />粘贴公众号
        </button>
        <details class="shape-menu">
          <summary>形状</summary>
          <div class="component-grid">
            <button
              v-for="item in shapeComponents"
              :key="item.kind"
              type="button"
              class="component-button"
              :disabled="!canInsert()"
              :draggable="canInsert()"
              @dragstart="startDrag($event, item.kind)"
              @dragend="stopDrag"
              @click="insertComponent(item.kind)"
            >
              <AppIcon :name="item.kind" />{{ item.label }}
            </button>
          </div>
        </details>
        <input
          ref="imageInput"
          type="file"
          hidden
          accept="image/png,image/jpeg"
          @change="pickImage"
          @cancel="cancelImage"
        />
      </aside>
      <div
        v-show="!arranged"
        ref="body"
        class="md-body"
        @input="syncDirty"
        @paste.capture="pasteWechat"
        @click.capture="editWechat"
        @dragover.capture="dragOver"
        @dragleave="dragLeave"
        @drop.capture="drop"
      >
        <div
          ref="host"
          class="md-canvas"
          aria-label="图文正文（Markdown 编辑器）"
        ></div>
        <span
          v-if="markerTop !== undefined"
          class="component-insertion"
          :style="{ top: markerTop + 'px' }"
          aria-hidden="true"
        ></span>
      </div>
    </div>
    <WechatFragmentDialog
      v-if="fragment"
      :initial="fragment.initial"
      :paste="fragment.paste"
      :validation="fragmentValidation"
      @apply="applyWechat"
      @close="
        fragment = undefined;
        fragmentValidation = '';
      "
    />
  </section>
</template>
<style scoped>
.md-editor {
  margin-top: 4px;
}
.md-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: 10px;
}
.md-body {
  position: relative;
  min-width: 0;
}
.component-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  align-items: flex-start;
}
.writing-tools,
.component-grid {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.writing-tools {
  width: fit-content;
  padding: 3px;
  background: var(--rf-bg);
  border: 1px solid var(--rf-line);
  border-radius: 8px;
}
.writing-tools button {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  background: transparent;
  border: 1px solid transparent;
  color: var(--rf-muted);
  font-size: 14px;
}
.writing-tools button[aria-pressed="true"] {
  color: var(--rf-primary-text);
  background: var(--rf-surface);
  border-color: var(--rf-line);
}
.shape-menu summary {
  padding: 8px 4px;
  cursor: pointer;
  color: var(--rf-muted);
  font-size: 13px;
}
.component-grid {
  gap: 6px;
}
.component-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding-inline: 10px;
  border: 1px solid var(--rf-line);
  background: var(--rf-surface);
  color: var(--rf-ink);
  font-size: 12px;
  white-space: nowrap;
}
.component-button .app-icon {
  flex-shrink: 0;
  color: var(--rf-primary-text);
}
.component-button:enabled:hover {
  border-color: var(--rf-primary);
  background: var(--rf-soft);
}
@media (pointer: fine) {
  .component-button[draggable="true"] {
    cursor: grab;
  }
}
.component-button:disabled .app-icon {
  color: inherit;
}
.component-insertion {
  position: absolute;
  z-index: 3;
  right: 12px;
  left: 12px;
  height: 2px;
  background: var(--rf-primary);
  pointer-events: none;
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
.md-editor :deep(.vditor-toolbar__item .vditor-tooltipped:focus-visible) {
  outline: 2px solid var(--rf-primary);
  outline-offset: -2px;
}
@media (max-width: 720px) {
  .md-editor :deep(.vditor-toolbar) {
    --toolbar-height: 36px;
  }
  .md-editor :deep(.vditor-toolbar__item) {
    padding: 0;
  }
  .md-editor :deep(.vditor-toolbar__item .vditor-tooltipped),
  .md-editor :deep(.vditor-toolbar__item input) {
    width: 36px;
    min-height: 36px;
    padding: 0;
  }
  .md-editor :deep(.vditor-toolbar__divider) {
    display: none;
  }
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
  border: 1px solid var(--rf-line);
  background: var(--rf-soft);
  border-radius: var(--rf-control-radius);
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
.md-editor
  :deep(
    .vditor-wysiwyg__block:has(code.language-wildboy-wechat)
      > .vditor-wysiwyg__pre
  ) {
  display: none !important;
}
.md-editor :deep(.wechat-fragment-preview) {
  max-height: 340px;
  overflow: hidden;
  overflow-wrap: anywhere;
  white-space: normal;
  font-family: var(--rf-font, system-ui, sans-serif);
  background: var(--rf-surface);
}
.md-editor :deep(.wechat-fragment-preview img) {
  max-width: 100%;
  height: auto;
}
.md-editor :deep(.wechat-fragment-edit) {
  margin: 6px 0;
  color: var(--rf-primary-text);
  border: 1px solid var(--rf-line);
  background: var(--rf-surface);
}
.md-editor :deep(.vditor-wysiwyg code) {
  background: var(--admin-paper);
}
</style>
