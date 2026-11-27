<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { currentUser, errorMessage } from "../api";
import { uploadAdminImage } from "../image-upload";
import {
  formatFileSize,
  listAdminMedia,
  mediaCategoryLabels,
  mediaFilterTabs,
  type MediaAsset,
  type MediaCategory,
  type MediaCategoryFilter,
} from "../media";
import AppIcon from "./AppIcon.vue";
import FormModal from "./FormModal.vue";
import PaginationBar from "./PaginationBar.vue";
import UiState from "./UiState.vue";

const props = defineProps<{
  defaultCategory?: MediaCategory;
  currentUrl?: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [asset: MediaAsset];
}>();

const category = ref<MediaCategoryFilter>("ALL");
const keyword = ref("");
const items = ref<MediaAsset[]>([]);
const counts = ref<Record<string, number>>({});
const page = ref(0);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const uploading = ref(false);
const error = ref("");
const selected = ref<MediaAsset | null>(null);
const uploadInput = ref<HTMLInputElement>();

let epoch = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

onUnmounted(() => {
  epoch++;
  if (searchTimer) clearTimeout(searchTimer);
});

async function load(p = 0) {
  if (!currentUser.value) return;
  const n = ++epoch;
  const actor = currentUser.value;
  loading.value = true;
  error.value = "";
  try {
    const result = await listAdminMedia({
      category: category.value,
      q: keyword.value,
      page: p,
      size: 16,
    });
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = result.items;
    counts.value = result.counts || {};
    total.value = result.total;
    page.value = result.page;
    hasMore.value = result.hasMore;
    if (selected.value) {
      const stillThere = result.items.find((i) => i.id === selected.value?.id);
      if (stillThere) selected.value = stillThere;
    } else if (props.currentUrl) {
      const matched = result.items.find((i) => i.url === props.currentUrl);
      if (matched) selected.value = matched;
    }
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}

function selectCategory(next: MediaCategoryFilter) {
  if (category.value === next) return;
  category.value = next;
  void load(0);
}

watch(keyword, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void load(0);
  }, 240);
});

function triggerUpload() {
  if (!uploading.value) uploadInput.value?.click();
}

async function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || uploading.value || !currentUser.value) return;
  const actor = currentUser.value;
  const n = epoch;
  uploading.value = true;
  error.value = "";
  try {
    const targetCategory: MediaCategory =
      category.value !== "ALL"
        ? category.value
        : (props.defaultCategory ?? "UNCATEGORIZED");
    const created = await uploadAdminImage(
      file,
      () => n === epoch && currentUser.value === actor,
      { category: targetCategory },
    );
    if (created && n === epoch && currentUser.value === actor) {
      selected.value = created;
      await load(0);
    }
  } catch (e) {
    if (n === epoch) error.value = errorMessage(e);
  } finally {
    if (n === epoch) uploading.value = false;
  }
}

function confirmSelection() {
  if (selected.value) emit("select", selected.value);
}

function pickAndConfirm(asset: MediaAsset) {
  selected.value = asset;
  emit("select", asset);
}

onMounted(() => {
  void load(0);
});
</script>

<template>
  <FormModal
    size="xl"
    title="从素材库选择图片"
    :busy="uploading"
    @close="emit('close')"
  >
    <div class="picker-shell">
      <div class="picker-toolbar">
        <div class="picker-tabs" role="tablist" aria-label="素材分类">
          <button
            v-for="tab in mediaFilterTabs"
            :key="tab.value"
            type="button"
            role="tab"
            class="picker-tab"
            :class="{ 'is-active': category === tab.value }"
            :aria-selected="category === tab.value"
            @click="selectCategory(tab.value)"
          >
            <span>{{ tab.label }}</span>
            <small v-if="counts[tab.value] !== undefined">{{
              counts[tab.value]
            }}</small>
          </button>
        </div>
        <div class="picker-controls">
          <input
            v-model="keyword"
            type="search"
            class="picker-search"
            placeholder="搜索图片名称…"
            aria-label="搜索图片名称"
          />
          <button
            type="button"
            class="secondary"
            :disabled="uploading"
            @click="triggerUpload"
          >
            <AppIcon name="upload" :size="15" />
            {{ uploading ? "上传中…" : "上传新图" }}
          </button>
          <input
            ref="uploadInput"
            type="file"
            hidden
            accept="image/png,image/jpeg"
            :disabled="uploading"
            @change="handleUpload"
          />
        </div>
      </div>

      <p v-if="error" class="error-box" role="alert">{{ error }}</p>

      <UiState v-if="loading && !items.length" kind="loading" compact>
        <p>正在加载素材库…</p>
      </UiState>
      <UiState v-else-if="!loading && !items.length" kind="empty" compact>
        <p>
          {{
            keyword.trim()
              ? "没有匹配的图片素材，换个关键词试试。"
              : "当前分类下还没有图片，可以直接点击右上角「上传新图」。"
          }}
        </p>
      </UiState>

      <div v-else class="picker-grid" :class="{ 'is-loading': loading }">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="picker-card"
          :class="{
            'is-selected': selected?.id === item.id,
            'is-current': currentUrl === item.url,
          }"
          @click="selected = item"
          @dblclick="pickAndConfirm(item)"
        >
          <span class="picker-thumb">
            <img
              :src="item.url"
              :alt="item.name"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <span v-if="selected?.id === item.id" class="picker-check">
              <AppIcon name="check" :size="14" />
            </span>
            <span
              v-else-if="currentUrl === item.url"
              class="picker-current-tag"
            >
              当前
            </span>
          </span>
          <span class="picker-meta">
            <strong :title="item.name">{{ item.name }}</strong>
            <small>
              {{ mediaCategoryLabels[item.category] }}
              <template v-if="item.width && item.height">
                · {{ item.width }}×{{ item.height }}
              </template>
              · {{ formatFileSize(item.sizeBytes) }}
            </small>
          </span>
        </button>
      </div>

      <PaginationBar
        :page="page"
        :page-size="16"
        :total="total"
        :has-more="hasMore"
        :busy="loading"
        label="素材分页"
        count-unit="张"
        @change="load"
      />
    </div>

    <template #footer>
      <div class="picker-footer">
        <span class="picker-selection-hint">
          <template v-if="selected">
            已选：<strong>{{ selected.name }}</strong>
            <template v-if="selected.width && selected.height">
              （{{ selected.width }}×{{ selected.height }}）
            </template>
          </template>
          <template v-else>点击选择一张图片，双击可直接确认</template>
        </span>
        <div class="picker-footer-actions">
          <button type="button" class="secondary" @click="emit('close')">
            取消
          </button>
          <button
            type="button"
            class="primary"
            :disabled="!selected"
            @click="confirmSelection"
          >
            使用选中图片
          </button>
        </div>
      </div>
    </template>
  </FormModal>
</template>

<style scoped>
.picker-shell {
  display: grid;
  gap: 14px;
}
.picker-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.picker-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.picker-tab {
  min-height: 34px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 500;
  background: var(--rf-bg);
  border-color: var(--rf-line);
  color: var(--rf-muted);
}
.picker-tab small {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.picker-tab.is-active {
  background: var(--rf-soft);
  border-color: var(--rf-primary);
  color: var(--rf-primary-text);
  font-weight: 600;
}
.picker-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 260px;
  justify-content: flex-end;
}
.picker-search {
  max-width: 220px;
  min-height: 36px;
}
.picker-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 12px;
  transition: opacity 150ms ease;
}
.picker-grid.is-loading {
  opacity: 0.6;
}
.picker-card {
  display: grid;
  grid-template-rows: auto 1fr;
  align-content: start;
  padding: 6px;
  gap: 6px;
  text-align: left;
  background: var(--rf-surface);
  border: 1px solid var(--rf-line);
  border-radius: var(--rf-control-radius);
  font-weight: 400;
  color: var(--rf-ink);
  white-space: normal;
  min-height: 0;
}
.picker-card:hover {
  border-color: var(--rf-primary);
  background: var(--rf-bg);
}
.picker-card.is-selected {
  border-color: var(--rf-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--rf-primary) 24%, transparent);
  background: var(--rf-soft);
}
.picker-thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: calc(var(--rf-control-radius) - 2px);
  overflow: hidden;
  background: var(--rf-bg);
  border: 1px solid var(--rf-line);
}
.picker-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.picker-check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--rf-primary);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.picker-current-tag {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(15, 36, 28, 0.78);
  color: #fff;
  font-size: 11px;
  line-height: 1.5;
}
.picker-meta {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.picker-meta strong {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-meta small {
  font-size: 11px;
  color: var(--rf-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.picker-selection-hint {
  font-size: 13px;
  color: var(--rf-muted);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picker-selection-hint strong {
  color: var(--rf-ink);
}
.picker-footer-actions {
  display: flex;
  gap: 8px;
}
</style>
