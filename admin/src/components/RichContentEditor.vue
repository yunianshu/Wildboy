<script setup lang="ts">
import { askConfirm } from "../confirm";
import { computed, nextTick, ref, watch, onUnmounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, request, currentUser, errorMessage } from "../api";
import UiState from "./UiState.vue";
import ImageUpload from "./ImageUpload.vue";
import ContentBlockList from "./ContentBlockList.vue";
import AppIcon from "./AppIcon.vue";
import FormModal from "./FormModal.vue";
import WechatFragmentDialog from "./WechatFragmentDialog.vue";
import { cleanWechatPreview, readWechatClipboard } from "../wechatPaste";
type Block = {
  type: "text" | "image" | "table" | "wechat";
  text?: string;
  url?: string;
  caption?: string;
  rows?: string[][];
};
const props = defineProps<{
  path: string;
  disabled?: boolean;
  managedNavigation?: boolean;
}>();
const emit = defineEmits<{ saved: [version: number]; close: [] }>();
const labels = {
  text: "文字",
  image: "图片",
  table: "表格",
  wechat: "公众号片段",
};
const insertTypes = ["text", "image", "table"] as const;
const fragment = ref<{
  key?: number;
  initial?: string;
  paste?: string;
  at: number;
}>();
let nextKey = 0;
const blocks = ref<(Block & { key: number })[]>([]),
  version = ref(0),
  busy = ref(false),
  error = ref(""),
  loaded = ref(false),
  dirty = ref(false);
const editor = ref<HTMLElement>();
const uploading = ref(false);
const conflict = ref(false);
const notice = ref("");
const working = computed(
  () => busy.value || uploading.value || !!fragment.value,
);
const locked = computed(() => working.value || props.disabled || !loaded.value);
const items = computed(() =>
  blocks.value.map(({ key, type }) => ({ key, label: labels[type] })),
);
function withKey(block: Block) {
  return { ...block, key: ++nextKey };
}
let generation = 0;
async function load() {
  const n = ++generation,
    actor = currentUser.value;
  blocks.value = [];
  loaded.value = false;
  dirty.value = false;
  conflict.value = false;
  notice.value = "";
  uploading.value = false;
  fragment.value = undefined;
  error.value = "";
  busy.value = true;
  try {
    const d = await request<{ blocks: Block[]; version: number }>(props.path);
    if (n === generation && actor === currentUser.value) {
      blocks.value = d.blocks.map(withKey);
      version.value = d.version;
      loaded.value = true;
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
onUnmounted(() => {
  generation++;
});
function focusBlock(index: number) {
  void nextTick(() => {
    const field = editor.value?.querySelector<HTMLElement>(
      `[data-block-field="${blocks.value[index]?.key}"]`,
    );
    field?.focus();
  });
}
function add(type: Block["type"]) {
  if (locked.value || blocks.value.length >= 30) return;
  blocks.value.push(
    withKey(
      type === "text"
        ? { type, text: "" }
        : type === "image"
          ? { type, url: "", caption: "" }
          : {
              type,
              rows: [
                ["", ""],
                ["", ""],
              ],
            },
    ),
  );
  dirty.value = true;
  notice.value = "";
  focusBlock(blocks.value.length - 1);
}
function copy(index: number) {
  if (locked.value || blocks.value.length >= 30) return;
  const source = blocks.value[index];
  const copy = withKey({
    ...source,
    rows: source.rows?.map((row) => [...row]),
  });
  blocks.value.splice(index + 1, 0, copy);
  dirty.value = true;
  notice.value = `已复制到第 ${index + 2} 块`;
  if (source.type === "wechat") editFragment(index + 1);
  else focusBlock(index + 1);
}
function editFragment(index: number) {
  const block = blocks.value[index];
  fragment.value = { key: block.key, initial: block.text, at: index };
}
function pasteFragment(event: ClipboardEvent) {
  if (locked.value) return;
  const paste = readWechatClipboard(event);
  if (!paste) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (blocks.value.length >= 30) {
    error.value = "已达 30 块上限，请先删除一块。";
    return;
  }
  const target =
    event.target instanceof Element
      ? event.target.closest(".content-block")
      : null;
  const index = Array.from(
    editor.value?.querySelectorAll(".content-block") ?? [],
  ).indexOf(target as Element);
  fragment.value = { paste, at: index < 0 ? blocks.value.length : index + 1 };
}
function applyFragment(html: string) {
  const draft = fragment.value;
  if (!draft) return;
  if (draft.key !== undefined) {
    const block = blocks.value.find((block) => block.key === draft.key);
    if (block) block.text = html;
  } else if (blocks.value.length < 30) {
    blocks.value.splice(draft.at, 0, withKey({ type: "wechat", text: html }));
  }
  dirty.value = true;
  notice.value = "公众号片段已更新";
  fragment.value = undefined;
}
function table(i: number, event: Event) {
  blocks.value[i].rows = (event.target as HTMLTextAreaElement).value
    .split("\n")
    .map((r) => r.split("\t"));
  dirty.value = true;
}
function insertColumnSeparator(i: number, event: KeyboardEvent) {
  if (event.shiftKey) return;
  event.preventDefault();
  const field = event.currentTarget as HTMLTextAreaElement;
  field.setRangeText("\t", field.selectionStart, field.selectionEnd, "end");
  table(i, event);
}
function move(from: number, to: number) {
  if (locked.value || to < 0 || to >= blocks.value.length || from === to)
    return;
  const [block] = blocks.value.splice(from, 1);
  blocks.value.splice(to, 0, block);
  dirty.value = true;
  notice.value = `已移至第 ${to + 1} 块`;
}
async function remove(block: (typeof blocks.value)[number]) {
  const hasContent =
    block.text?.trim() ||
    block.url ||
    block.caption?.trim() ||
    block.rows?.some((row) => row.some((cell) => cell.trim()));
  const n = generation;
  if (hasContent && !(await askConfirm("删除这段图文？"))) return;
  const index = blocks.value.indexOf(block);
  if (n !== generation || index < 0 || locked.value) return;
  blocks.value.splice(index, 1);
  dirty.value = true;
  notice.value = "已删除内容块";
}
async function save() {
  if (locked.value || conflict.value || !dirty.value) return;
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const d = await request<{ blocks: Block[]; version: number }>(props.path, {
      method: "PUT",
      body: JSON.stringify({
        blocks: blocks.value.map(({ key, ...block }) => block),
        version: version.value,
      }),
    });
    if (n === generation && actor === currentUser.value) {
      blocks.value = d.blocks.map(withKey);
      version.value = d.version;
      dirty.value = false;
      notice.value = "图文已保存";
      emit("saved", d.version);
    }
  } catch (e) {
    if (n === generation) {
      conflict.value = e instanceof ApiError && e.status === 409;
      error.value = errorMessage(e);
    }
  } finally {
    if (n === generation) busy.value = false;
  }
}
async function canLeave() {
  return (
    !working.value &&
    (!dirty.value || (await askConfirm("图文尚未保存，确定离开吗？")))
  );
}
async function reload() {
  if (await canLeave()) await load();
}
defineExpose({ canLeave, dirty, busy: working, loaded });
onBeforeRouteLeave(
  async (to) =>
    props.managedNavigation || to.path === "/login" || (await canLeave()),
);
</script>
<template>
  <FormModal size="lg" :busy="working" @close="emit('close')">
    <template #title
      ><div class="rich-heading">
        <h2>图文详情</h2>
        <small v-if="loaded">{{ blocks.length }} / 30 块</small>
      </div></template
    >
    <section ref="editor" class="rich-editor" @paste.capture="pasteFragment">
      <p v-if="error" role="alert" class="error-box">
        {{ error }}
        <button
          v-if="conflict"
          type="button"
          class="text-button"
          @click="reload"
        >
          重新加载
        </button>
      </p>
      <UiState v-if="!loaded && busy" kind="loading" compact
        >正在读取图文…</UiState
      >
      <button
        v-if="!loaded && !busy"
        type="button"
        class="secondary button"
        @click="load"
      >
        重试
      </button>
      <fieldset v-if="loaded" :disabled="locked">
        <div class="rich-add" aria-label="添加内容块">
          <button
            v-for="type in insertTypes"
            :key="type"
            class="secondary"
            type="button"
            :disabled="blocks.length >= 30"
            @click="add(type)"
          >
            <AppIcon :name="type" :size="16" />添加{{ labels[type] }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="blocks.length >= 30"
            @click="fragment = { at: blocks.length }"
          >
            <AppIcon name="document" :size="16" />粘贴公众号
          </button>
        </div>
        <p v-if="!blocks.length" class="empty-blocks">
          从一段行程文字、一张路线图或一份表格开始。
        </p>
        <p v-else class="rich-hint">
          {{
            blocks.length >= 30
              ? "已达 30 块上限，可继续编辑或排序。"
              : "拖动把手调整顺序，或使用上下箭头。"
          }}
        </p>
        <ContentBlockList
          :items="items"
          :disabled="locked"
          :at-limit="blocks.length >= 30"
          @move="move"
          @copy="copy"
        >
          <template #action="{ index }">
            <button
              type="button"
              class="block-delete"
              :aria-label="'删除第' + (index + 1) + '块'"
              @click="remove(blocks[index])"
            >
              删除
            </button>
          </template>
          <template #default="{ index }">
            <div class="block-fields">
              <textarea
                v-if="blocks[index].type === 'text'"
                v-model="blocks[index].text"
                :data-block-field="blocks[index].key"
                maxlength="10000"
                rows="3"
                aria-label="图文文字"
                placeholder="输入行程、装备或其他说明"
                @input="
                  dirty = true;
                  notice = '';
                "
              />
              <template v-else-if="blocks[index].type === 'image'">
                <ImageUpload
                  label="上传图文图片"
                  :preview="blocks[index].url"
                  preview-alt="图文图片"
                  :disabled="locked"
                  @busy="uploading = $event"
                  @uploaded="
                    blocks[index].url = $event;
                    dirty = true;
                    notice = '';
                  "
                />
                <input
                  v-model="blocks[index].caption"
                  :data-block-field="blocks[index].key"
                  maxlength="300"
                  aria-label="图片说明"
                  placeholder="图片说明（选填）"
                  @input="
                    dirty = true;
                    notice = '';
                  "
                />
              </template>
              <template v-else-if="blocks[index].type === 'wechat'">
                <div
                  class="wechat-preview wechat-prose"
                  inert
                  v-html="cleanWechatPreview(blocks[index].text ?? '')"
                ></div>
                <button
                  class="secondary"
                  type="button"
                  :data-block-field="blocks[index].key"
                  @click="editFragment(index)"
                >
                  编辑片段
                </button>
              </template>
              <label v-else class="rich-table-field"
                >每行一行数据，Tab 分列，Shift+Tab 离开
                <textarea
                  :data-block-field="blocks[index].key"
                  aria-label="图文表格"
                  @keydown.tab="insertColumnSeparator(index, $event)"
                  :value="
                    blocks[index].rows?.map((r) => r.join('\t')).join('\n')
                  "
                  rows="4"
                  @input="
                    table(index, $event);
                    notice = '';
                  "
                />
              </label>
            </div>
          </template>
        </ContentBlockList>
      </fieldset>
    </section>
    <template v-if="loaded" #footer
      ><div class="rich-footer">
        <span role="status">{{
          notice || (dirty ? "有未保存的修改" : "图文已保存")
        }}</span>
        <button
          type="button"
          class="primary button"
          :disabled="locked || !dirty || conflict"
          @click="save"
        >
          {{ busy ? "保存中…" : "保存图文" }}
        </button>
      </div></template
    >
  </FormModal>
  <WechatFragmentDialog
    v-if="fragment"
    :initial="fragment.initial"
    :paste="fragment.paste"
    @apply="applyFragment"
    @close="fragment = undefined"
  />
</template>
<style scoped>
.rich-editor,
.rich-editor fieldset {
  display: grid;
  gap: 14px;
  min-width: 0;
}
.rich-editor fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}
.rich-heading,
.rich-footer,
.rich-add {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rich-heading,
.rich-footer {
  justify-content: space-between;
}
.rich-heading h2 {
  margin: 0;
  font-size: 20px;
}
.rich-heading small,
.rich-hint,
.rich-footer span {
  color: var(--rf-muted);
  font-size: 13px;
}
.rich-add button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.rich-hint {
  margin: 0;
}
.empty-blocks {
  margin: 0;
  padding: 24px 16px;
  border: 1px dashed var(--rf-field-line);
  border-radius: 8px;
  text-align: center;
  color: var(--rf-muted);
  font-size: 14px;
}
.block-fields {
  display: grid;
  gap: 8px;
  padding: 0 12px 12px;
}
.rich-table-field {
  margin: 0;
  display: grid;
  gap: 6px;
  font-size: 12px;
  color: var(--rf-muted);
}
.block-fields textarea,
.block-fields input {
  width: 100%;
  margin: 0;
}
.rich-table-field textarea {
  color: var(--rf-ink);
  white-space: pre;
  tab-size: 8;
}
.wechat-preview {
  max-height: 300px;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.wechat-preview :deep(img) {
  max-width: 100%;
  height: auto;
}
</style>
