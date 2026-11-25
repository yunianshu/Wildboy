<script setup lang="ts">
import { shallowRef } from "vue";
import ContentBlockList from "./ContentBlockList.vue";
import { cleanWechatPreview } from "../wechatPaste";
import { decodeWechatFence } from "./wechatFence";
const props = defineProps<{ elements: Element[]; disabled?: boolean }>();
const emit = defineEmits<{
  change: [elements: Element[]];
  edit: [index: number];
}>();
let nextKey = 0;
function describe(element: Element) {
  const tag = element.tagName;
  const image = element.querySelector("img");
  const wechat = element.querySelector("pre > code.language-wildboy-wechat");
  if (wechat) {
    const preview = document.createElement("template");
    preview.innerHTML = cleanWechatPreview(
      decodeWechatFence(wechat.textContent ?? ""),
    );
    return {
      key: ++nextKey,
      element,
      label: "公众号片段",
      summary: preview.content.textContent?.trim() || "公众号图片",
    };
  }
  const text =
    element.querySelector("pre > code")?.textContent ||
    element.textContent?.trim() ||
    "";
  let label = "段落";
  if (/^H[1-6]$/.test(tag)) label = "标题";
  else if (tag === "BLOCKQUOTE") label = "引用";
  else if (tag === "UL" || tag === "OL") label = "列表";
  else if (tag === "TABLE") label = "表格";
  else if (tag === "HR") label = "分隔线";
  else if (element.matches("pre, [data-type='code-block']")) label = "代码";
  else if (image && !text) label = "图片";
  return {
    key: ++nextKey,
    element,
    label,
    summary: text || image?.alt || label,
  };
}
const rows = shallowRef(props.elements.map(describe));
const notice = shallowRef("");
function apply(next: typeof rows.value) {
  rows.value = next;
  emit(
    "change",
    next.map((row) => row.element),
  );
}
function move(from: number, to: number) {
  if (props.disabled) return;
  const next = [...rows.value];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  apply(next);
  notice.value = `已移至第 ${to + 1} 块`;
}
function copy(index: number) {
  if (props.disabled) return;
  const next = [...rows.value];
  next.splice(
    index + 1,
    0,
    describe(next[index].element.cloneNode(true) as Element),
  );
  apply(next);
  emit("edit", index + 1);
}
</script>
<template>
  <div class="arranger">
    <p role="status">
      {{
        notice ||
        (rows.length
          ? "拖动把手排序，点击内容继续编辑。"
          : "正文为空，返回写作后可添加内容。")
      }}
    </p>
    <ContentBlockList
      :items="rows"
      :disabled="disabled"
      @move="move"
      @copy="copy"
    >
      <template #default="{ index }">
        <button
          type="button"
          class="block-summary"
          :disabled="disabled"
          @click="emit('edit', index)"
          :aria-label="`编辑第${index + 1}块：${rows[index].label}`"
        >
          {{ rows[index].summary }}
        </button>
      </template>
    </ContentBlockList>
  </div>
</template>
<style scoped>
.arranger {
  padding: 14px;
  background: var(--rf-bg);
  border: 1px solid var(--rf-line);
  border-radius: 8px;
}
.arranger p {
  margin: 0 0 12px;
  color: var(--rf-muted);
  font-size: 13px;
}
.block-summary {
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 4px 14px 12px;
  color: var(--rf-ink);
  background: transparent;
  border: 0;
  text-align: left;
  font-weight: 400;
  font-size: 14px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.block-summary:enabled:hover {
  color: var(--rf-primary-text);
}
</style>
