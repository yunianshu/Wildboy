<script setup lang="ts">
import { askConfirm } from "../confirm";
import { ref, watch, onUnmounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { request, currentUser, errorMessage } from "../api";
import UiState from "./UiState.vue";
import ImageUpload from "./ImageUpload.vue";
type Block = {
  type: "text" | "image" | "table";
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
const emit = defineEmits<{ saved: [version: number] }>();
const blocks = ref<Block[]>([]),
  version = ref(0),
  busy = ref(false),
  error = ref(""),
  loaded = ref(false),
  dirty = ref(false);
let generation = 0;
async function load() {
  const n = ++generation,
    actor = currentUser.value;
  blocks.value = [];
  loaded.value = false;
  dirty.value = false;
  error.value = "";
  busy.value = true;
  try {
    const d = await request<{ blocks: Block[]; version: number }>(props.path);
    if (n === generation && actor === currentUser.value) {
      blocks.value = d.blocks;
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
function add(type: Block["type"]) {
  if (blocks.value.length >= 30) return;
  blocks.value.push(
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
  );
  dirty.value = true;
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
function move(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= blocks.value.length) return;
  [blocks.value[i], blocks.value[j]] = [blocks.value[j], blocks.value[i]];
  dirty.value = true;
}
async function remove(block: Block) {
  const hasContent = block.text?.trim() || block.url || block.caption?.trim()
    || block.rows?.some((row) => row.some((cell) => cell.trim()));
  const n = generation;
  if (hasContent && !(await askConfirm("删除这段图文？"))) return;
  const index = blocks.value.indexOf(block);
  if (n !== generation || index < 0 || busy.value || props.disabled) return;
  blocks.value.splice(index, 1);
  dirty.value = true;
}
async function save() {
  if (busy.value || !loaded.value || props.disabled) return;
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const d = await request<{ blocks: Block[]; version: number }>(props.path, {
      method: "PUT",
      body: JSON.stringify({ blocks: blocks.value, version: version.value }),
    });
    if (n === generation && actor === currentUser.value) {
      blocks.value = d.blocks;
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
defineExpose({ canLeave, dirty, busy, loaded });
onBeforeRouteLeave(
  async (to) =>
    props.managedNavigation || to.path === "/login" || (await canLeave()),
);
</script>
<template>
  <section class="editor-section rich-editor">
    <h2>图文详情</h2>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <UiState v-if="!loaded && busy" kind="loading" compact>正在读取图文…</UiState>
    <button
      v-if="!loaded && !busy"
      class="secondary button"
      :disabled="busy"
      @click="load"
    >
      重新加载图文
    </button>
    <fieldset :disabled="busy || disabled || !loaded">
      <div v-for="(block, i) in blocks" :key="i" class="rich-block">
        <div class="rich-tools">
          <strong
            >{{ i + 1 }} ·
            {{
              block.type === "text"
                ? "文字"
                : block.type === "image"
                  ? "图片"
                  : "表格"
            }}</strong
          ><button type="button" @click="move(i, -1)" :disabled="i === 0">
            上移</button
          ><button
            type="button"
            @click="move(i, 1)"
            :disabled="i === blocks.length - 1"
          >
            下移</button
          ><button
            type="button"
            class="danger-outline"
            @click="remove(block)"
          >
            删除
          </button>
        </div>
        <textarea
          v-if="block.type === 'text'"
          v-model="block.text"
          maxlength="10000"
          rows="4"
          aria-label="图文文字"
          @input="dirty = true"
        />
        <template v-else-if="block.type === 'image'"
          ><ImageUpload
            :disabled="busy || disabled"
            @uploaded="
              block.url = $event;
              dirty = true;
            " /><input
            v-model="block.caption"
            maxlength="300"
            placeholder="图片说明（选填）"
            @input="dirty = true" /><img
            v-if="block.url"
            :src="block.url"
            alt="图片预览"
            style="max-width: 100%; max-height: 240px"
        /></template>
        <label v-else
          >表格（Tab 分列，Shift+Tab 离开）<textarea
            @keydown.tab="insertColumnSeparator(i, $event)"
            :value="block.rows?.map((r) => r.join('\t')).join('\n')"
            rows="5"
            @input="table(i, $event)"
          />
        </label>
      </div>
      <div class="rich-tools">
        <button
          type="button"
          @click="add('text')"
          :disabled="blocks.length >= 30"
        >
          ＋ 文字</button
        ><button
          type="button"
          @click="add('image')"
          :disabled="blocks.length >= 30"
        >
          ＋ 图片</button
        ><button
          type="button"
          @click="add('table')"
          :disabled="blocks.length >= 30"
        >
          ＋ 表格</button
        ><button type="button" class="primary button" @click="save">
          {{ busy ? "保存中…" : "保存图文" }}
        </button>
      </div>
    </fieldset>
  </section>
</template>
<style scoped>
.rich-block {
  margin: 20px 0;
  padding: 16px;
  border: 1px solid var(--rf-soft);
  border-radius: 12px;
}
.rich-tools {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}
.rich-tools strong {
  margin-right: auto;
}
.rich-editor textarea,
.rich-editor input {
  display: block;
  width: 100%;
  margin-top: 12px;
}
.rich-editor fieldset {
  border: 0;
  padding: 0;
}
</style>
