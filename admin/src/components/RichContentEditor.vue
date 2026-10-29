<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { request, currentUser, errorMessage } from "../api";
import ImageUpload from "./ImageUpload.vue";
type Block = {
  type: "text" | "image" | "table";
  text?: string;
  url?: string;
  caption?: string;
  rows?: string[][];
};
const props = defineProps<{ path: string; disabled?: boolean }>();
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
function move(i: number, delta: number) {
  const j = i + delta;
  if (j < 0 || j >= blocks.value.length) return;
  [blocks.value[i], blocks.value[j]] = [blocks.value[j], blocks.value[i]];
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
defineExpose({ canLeave });
onBeforeRouteLeave((to) => to.path === "/login" || canLeave());
</script>
<template>
  <section class="editor-section rich-editor">
    <h2>图文详情</h2>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>
    <button
      v-if="!loaded"
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
            @click="
              blocks.splice(i, 1);
              dirty = true;
            "
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
            v-model="block.url"
            placeholder="图片地址"
            aria-label="图文图片地址"
            @input="dirty = true" /><input
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
          >表格（每行一条，列用 Tab 分隔）<textarea
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
  border: 1px solid #dce2d8;
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
