<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { currentUser, errorMessage } from "../api";
import { askConfirm } from "../confirm";
import { uploadAdminImage } from "../image-upload";
import {
  deleteAdminMedia,
  formatFileSize,
  formatMediaTime,
  getAdminMediaReferences,
  listAdminMedia,
  mediaCategoryLabels,
  mediaCategoryOptions,
  mediaFilterTabs,
  updateAdminMedia,
  type MediaAsset,
  type MediaCategory,
  type MediaCategoryFilter,
  type MediaReference,
} from "../media";
import AppIcon from "../components/AppIcon.vue";
import FormModal from "../components/FormModal.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";

const category = ref<MediaCategoryFilter>("ALL");
const keyword = ref("");
const items = ref<MediaAsset[]>([]);
const counts = ref<Record<string, number>>({});
const page = ref(0);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const error = ref("");
const notice = ref("");

const uploading = ref(false);
const uploadProgress = ref("");
const dragging = ref(false);
const uploadInput = ref<HTMLInputElement>();

const activeAsset = ref<MediaAsset | null>(null);
const editName = ref("");
const editCategory = ref<MediaCategory>("UNCATEGORIZED");
const detailBusy = ref(false);
const detailError = ref("");
const refsLoading = ref(false);
const assetRefs = ref<MediaReference[]>([]);
const refsChecked = ref(false);
const copiedId = ref("");

let epoch = 0;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;

function reset() {
  epoch++;
  if (searchTimer) clearTimeout(searchTimer);
  if (noticeTimer) clearTimeout(noticeTimer);
  items.value = [];
  counts.value = {};
  loading.value = false;
  uploading.value = false;
  error.value = "";
  activeAsset.value = null;
}

watch(currentUser, (u, old) => {
  if (u !== old) {
    reset();
    if (u) void load(0);
  }
});

onUnmounted(reset);

function flashNotice(text: string) {
  notice.value = text;
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => {
    notice.value = "";
  }, 3000);
}

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
      size: 24,
    });
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = result.items;
    counts.value = result.counts || {};
    total.value = result.total;
    page.value = result.page;
    hasMore.value = result.hasMore;
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

const uploadTargetCategory = computed<MediaCategory>(() =>
  category.value === "ALL" ? "UNCATEGORIZED" : category.value,
);

function triggerUpload() {
  if (!uploading.value) uploadInput.value?.click();
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  input.value = "";
  if (files.length) void uploadFiles(files);
}

function onDragOver(event: DragEvent) {
  if (!event.dataTransfer?.types.includes("Files")) return;
  event.preventDefault();
  dragging.value = !uploading.value;
}

function onDragLeave(event: DragEvent) {
  const target = event.currentTarget as HTMLElement;
  if (
    !(event.relatedTarget instanceof Node) ||
    !target.contains(event.relatedTarget)
  ) {
    dragging.value = false;
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false;
  const files = Array.from(event.dataTransfer?.files || []);
  if (!files.length) return;
  event.preventDefault();
  void uploadFiles(files);
}

async function uploadFiles(files: File[]) {
  if (uploading.value || !currentUser.value) return;
  const actor = currentUser.value;
  const n = epoch;
  uploading.value = true;
  error.value = "";
  let succeeded = 0;
  const failures: string[] = [];
  try {
    for (let i = 0; i < files.length; i++) {
      if (n !== epoch || currentUser.value !== actor) return;
      uploadProgress.value = `正在上传 ${i + 1} / ${files.length}…`;
      try {
        const res = await uploadAdminImage(
          files[i],
          () => n === epoch && currentUser.value === actor,
          { category: uploadTargetCategory.value },
        );
        if (res) succeeded++;
      } catch (e) {
        failures.push(`${files[i].name}：${errorMessage(e)}`);
      }
    }
    if (succeeded > 0) {
      flashNotice(`已成功上传 ${succeeded} 张图片`);
      await load(0);
    }
    if (failures.length) {
      error.value = failures.slice(0, 3).join("；");
    }
  } finally {
    if (n === epoch) {
      uploading.value = false;
      uploadProgress.value = "";
    }
  }
}

async function openDetail(asset: MediaAsset) {
  activeAsset.value = asset;
  editName.value = asset.name;
  editCategory.value = asset.category;
  detailError.value = "";
  assetRefs.value = [];
  refsChecked.value = false;
  refsLoading.value = true;
  const id = asset.id;
  try {
    const check = await getAdminMediaReferences(id);
    if (activeAsset.value?.id === id) {
      assetRefs.value = check.references;
      refsChecked.value = true;
    }
  } catch (e) {
    if (activeAsset.value?.id === id) {
      detailError.value = errorMessage(e);
    }
  } finally {
    if (activeAsset.value?.id === id) {
      refsLoading.value = false;
    }
  }
}

function closeDetail() {
  if (detailBusy.value) return;
  activeAsset.value = null;
}

const detailDirty = computed(() => {
  if (!activeAsset.value) return false;
  return (
    editName.value.trim() !== activeAsset.value.name ||
    editCategory.value !== activeAsset.value.category
  );
});

async function saveDetail() {
  const asset = activeAsset.value;
  const trimmed = editName.value.trim();
  if (!asset || !trimmed || detailBusy.value) return;
  detailBusy.value = true;
  detailError.value = "";
  try {
    const updated = await updateAdminMedia(asset.id, {
      name: trimmed,
      category: editCategory.value,
    });
    activeAsset.value = updated;
    editName.value = updated.name;
    editCategory.value = updated.category;
    flashNotice("素材信息已更新");
    await load(page.value);
  } catch (e) {
    detailError.value = errorMessage(e);
  } finally {
    detailBusy.value = false;
  }
}

async function removeAsset(asset: MediaAsset) {
  if (detailBusy.value) return;
  const confirmed = await askConfirm({
    title: "删除图片素材？",
    description: `将永久删除「${asset.name}」。如果该图片已被活动、商品、文章或首页引用，系统会自动阻止删除。`,
    confirmLabel: "确认删除",
    danger: true,
  });
  if (!confirmed) return;
  detailBusy.value = true;
  detailError.value = "";
  error.value = "";
  try {
    await deleteAdminMedia(asset.id);
    if (activeAsset.value?.id === asset.id) activeAsset.value = null;
    flashNotice("图片已删除");
    const nextPage =
      items.value.length === 1 && page.value > 0 ? page.value - 1 : page.value;
    await load(nextPage);
  } catch (e) {
    const msg = errorMessage(e);
    if (activeAsset.value?.id === asset.id) {
      detailError.value = msg;
      try {
        const check = await getAdminMediaReferences(asset.id);
        assetRefs.value = check.references;
        refsChecked.value = true;
      } catch {
        // Ignore follow-up reference refresh errors.
      }
    } else {
      error.value = msg;
    }
  } finally {
    detailBusy.value = false;
  }
}

async function copyUrl(asset: MediaAsset) {
  try {
    await navigator.clipboard.writeText(asset.url);
    copiedId.value = asset.id;
    flashNotice("已复制图片路径");
    setTimeout(() => {
      if (copiedId.value === asset.id) copiedId.value = "";
    }, 1800);
  } catch {
    error.value = "复制失败，请手动选中路径复制。";
  }
}

onMounted(() => {
  void load(0);
});
</script>

<template>
  <main
    class="page-shell media-page"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <header class="page-head">
      <div>
        <h1>素材库</h1>
        <p class="page-subtitle">
          集中管理所有已上传图片，支持分类检索、在各编辑页直接复用与防误删校验。
        </p>
      </div>
      <div class="page-head-actions">
        <button
          type="button"
          class="secondary"
          :disabled="loading"
          @click="load(page)"
        >
          <AppIcon name="refresh" :size="15" />刷新
        </button>
        <button
          type="button"
          class="primary"
          :disabled="uploading"
          @click="triggerUpload"
        >
          <AppIcon name="upload" :size="16" />
          {{ uploading ? uploadProgress || "上传中…" : "上传图片" }}
        </button>
        <input
          ref="uploadInput"
          type="file"
          hidden
          multiple
          accept="image/png,image/jpeg"
          :disabled="uploading"
          @change="onFileChange"
        />
      </div>
    </header>

    <section class="surface media-toolbar">
      <div class="media-tabs" role="tablist" aria-label="素材分类">
        <button
          v-for="tab in mediaFilterTabs"
          :key="tab.value"
          type="button"
          role="tab"
          class="media-tab"
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
      <div class="media-search-wrap">
        <input
          v-model="keyword"
          type="search"
          placeholder="搜索图片名称或文件名…"
          aria-label="搜索图片名称或文件名"
        />
      </div>
    </section>

    <div v-if="dragging" class="drop-banner" role="status">
      <AppIcon name="upload" :size="20" />
      <span>
        松开鼠标即可上传到「{{ mediaCategoryLabels[uploadTargetCategory] }}」
      </span>
    </div>

    <p v-if="notice" class="notice-box" role="status">{{ notice }}</p>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>

    <section class="surface media-content">
      <UiState v-if="loading && !items.length" kind="loading">
        <p>正在加载素材库…</p>
      </UiState>
      <UiState v-else-if="!loading && !items.length" kind="empty">
        <p>
          {{
            keyword.trim()
              ? "没有找到匹配的图片素材。"
              : "当前分类下暂无图片，点击右上角「上传图片」或直接拖入图片到页面即可上传。"
          }}
        </p>
      </UiState>

      <div v-else class="media-grid" :class="{ 'is-loading': loading }">
        <article v-for="asset in items" :key="asset.id" class="media-card">
          <button
            type="button"
            class="media-thumb"
            :aria-label="`查看 ${asset.name}`"
            @click="openDetail(asset)"
          >
            <img
              :src="asset.url"
              :alt="asset.name"
              loading="lazy"
              referrerpolicy="no-referrer"
            />
            <span class="media-cat-badge">{{
              mediaCategoryLabels[asset.category]
            }}</span>
          </button>
          <div class="media-info">
            <strong class="media-name" :title="asset.name">{{
              asset.name
            }}</strong>
            <p class="media-specs">
              <span v-if="asset.width && asset.height"
                >{{ asset.width }}×{{ asset.height }}</span
              >
              <span>{{ formatFileSize(asset.sizeBytes) }}</span>
              <span>{{ formatMediaTime(asset.createdAt) }}</span>
            </p>
            <div class="media-actions">
              <button
                type="button"
                class="text-button"
                @click="copyUrl(asset)"
              >
                <AppIcon
                  :name="copiedId === asset.id ? 'check' : 'copy'"
                  :size="14"
                />
                {{ copiedId === asset.id ? "已复制" : "复制路径" }}
              </button>
              <button
                type="button"
                class="text-button"
                @click="openDetail(asset)"
              >
                管理
              </button>
              <button
                type="button"
                class="text-button danger-text"
                @click="removeAsset(asset)"
              >
                删除
              </button>
            </div>
          </div>
        </article>
      </div>

      <PaginationBar
        :page="page"
        :page-size="24"
        :total="total"
        :has-more="hasMore"
        :busy="loading"
        label="素材库分页"
        count-unit="张"
        @change="load"
      />
    </section>

    <FormModal
      v-if="activeAsset"
      size="lg"
      title="素材详情与管理"
      :busy="detailBusy"
      @close="closeDetail"
    >
      <div class="detail-layout">
        <div class="detail-preview">
          <img
            :src="activeAsset.url"
            :alt="activeAsset.name"
            referrerpolicy="no-referrer"
          />
        </div>
        <div class="detail-form">
          <label class="field">
            <span>图片名称</span>
            <input
              v-model="editName"
              type="text"
              maxlength="120"
              :disabled="detailBusy"
              placeholder="输入便于搜索的名称"
            />
          </label>
          <label class="field">
            <span>所属分类</span>
            <select v-model="editCategory" :disabled="detailBusy">
              <option
                v-for="opt in mediaCategoryOptions"
                :key="opt.value"
                :value="opt.value"
              >
                {{ opt.label }}
              </option>
            </select>
          </label>
          <dl class="detail-specs">
            <div>
              <dt>尺寸</dt>
              <dd>
                {{
                  activeAsset.width && activeAsset.height
                    ? `${activeAsset.width} × ${activeAsset.height} px`
                    : "未知"
                }}
              </dd>
            </div>
            <div>
              <dt>大小</dt>
              <dd>{{ formatFileSize(activeAsset.sizeBytes) }}</dd>
            </div>
            <div>
              <dt>上传时间</dt>
              <dd>{{ formatMediaTime(activeAsset.createdAt) }}</dd>
            </div>
            <div>
              <dt>图片路径</dt>
              <dd class="detail-url">
                <code>{{ activeAsset.url }}</code>
                <button
                  type="button"
                  class="text-button"
                  @click="copyUrl(activeAsset)"
                >
                  <AppIcon name="copy" :size="14" />复制
                </button>
              </dd>
            </div>
          </dl>

          <div class="detail-refs">
            <strong>引用状态</strong>
            <p v-if="refsLoading" class="muted-text">正在检查引用位置…</p>
            <template v-else-if="refsChecked">
              <p v-if="!assetRefs.length" class="ref-safe">
                当前未被活动、商品、文章或首页引用，可安全删除。
              </p>
              <div v-else class="ref-warning">
                <p>
                  正在被 {{ assetRefs.length }} 处内容引用，删除前请先替换：
                </p>
                <ul>
                  <li v-for="refItem in assetRefs" :key="`${refItem.type}-${refItem.id}`">
                    {{ refItem.label }}
                  </li>
                </ul>
              </div>
            </template>
          </div>

          <p v-if="detailError" class="error-box" role="alert">
            {{ detailError }}
          </p>
        </div>
      </div>

      <template #footer>
        <div class="detail-footer">
          <button
            type="button"
            class="danger"
            :disabled="detailBusy || refsLoading || assetRefs.length > 0"
            :title="
              assetRefs.length > 0
                ? '该图片正在被引用，无法删除'
                : '删除该图片素材'
            "
            @click="removeAsset(activeAsset)"
          >
            删除素材
          </button>
          <div class="detail-footer-right">
            <button
              type="button"
              class="secondary"
              :disabled="detailBusy"
              @click="closeDetail"
            >
              关闭
            </button>
            <button
              type="button"
              class="primary"
              :disabled="detailBusy || !detailDirty || !editName.trim()"
              @click="saveDetail"
            >
              {{ detailBusy ? "保存中…" : "保存修改" }}
            </button>
          </div>
        </div>
      </template>
    </FormModal>
  </main>
</template>

<style scoped>
.media-page {
  display: grid;
  gap: 16px;
}
.page-head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.page-head h1 {
  margin: 0;
  font-size: 22px;
}
.page-subtitle {
  margin: 4px 0 0;
  color: var(--rf-muted);
  font-size: 13px;
}
.page-head-actions {
  display: flex;
  gap: 8px;
}
.media-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
}
.media-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.media-tab {
  min-height: 34px;
  padding: 4px 12px;
  font-size: 13px;
  font-weight: 500;
  background: var(--rf-bg);
  border-color: var(--rf-line);
  color: var(--rf-muted);
}
.media-tab small {
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}
.media-tab.is-active {
  background: var(--rf-soft);
  border-color: var(--rf-primary);
  color: var(--rf-primary-text);
  font-weight: 600;
}
.media-search-wrap {
  flex: 0 1 260px;
  min-width: 180px;
}
.drop-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 16px;
  border: 2px dashed var(--rf-primary);
  border-radius: var(--rf-control-radius);
  background: var(--rf-soft);
  color: var(--rf-primary-text);
  font-weight: 600;
}
.notice-box {
  margin: 0;
  padding: 10px 14px;
  border-radius: var(--rf-control-radius);
  border: 1px solid var(--tone-success-border);
  background: var(--tone-success-bg);
  color: var(--tone-success);
  font-size: 13px;
}
.media-content {
  padding: 16px;
  display: grid;
  gap: 16px;
}
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 14px;
  transition: opacity 150ms ease;
}
.media-grid.is-loading {
  opacity: 0.6;
}
.media-card {
  display: grid;
  grid-template-rows: auto 1fr;
  border: 1px solid var(--rf-line);
  border-radius: var(--rf-control-radius);
  background: var(--rf-surface);
  overflow: hidden;
  transition: border-color 150ms ease, box-shadow 150ms ease;
}
.media-card:hover {
  border-color: var(--rf-primary);
  box-shadow: 0 4px 14px rgba(15, 36, 28, 0.06);
}
.media-thumb {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--rf-line);
  border-radius: 0;
  background: var(--rf-bg);
  overflow: hidden;
}
.media-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-cat-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(15, 36, 28, 0.72);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
}
.media-info {
  padding: 10px 12px;
  display: grid;
  gap: 6px;
  min-width: 0;
}
.media-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--rf-ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.media-specs {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  font-size: 11px;
  color: var(--rf-muted);
}
.media-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--rf-line);
}
.media-actions .text-button {
  min-height: 28px;
  padding: 2px 6px;
  font-size: 12px;
}
.danger-text {
  color: var(--rf-danger);
}
.detail-layout {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(260px, 1fr);
  gap: 18px;
  align-items: start;
}
.detail-preview {
  border: 1px solid var(--rf-line);
  border-radius: var(--rf-control-radius);
  background: var(--rf-bg);
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  max-height: 380px;
}
.detail-preview img {
  max-width: 100%;
  max-height: 360px;
  object-fit: contain;
  border-radius: 4px;
}
.detail-form {
  display: grid;
  gap: 12px;
}
.field {
  display: grid;
  gap: 4px;
}
.field span {
  font-size: 13px;
  font-weight: 600;
  color: var(--rf-ink);
}
.detail-specs {
  margin: 0;
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--rf-control-radius);
  background: var(--rf-bg);
  border: 1px solid var(--rf-line);
  font-size: 12px;
}
.detail-specs > div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
}
.detail-specs dt {
  color: var(--rf-muted);
}
.detail-specs dd {
  margin: 0;
  color: var(--rf-ink);
  word-break: break-all;
}
.detail-url {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.detail-url code {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detail-refs {
  display: grid;
  gap: 6px;
  font-size: 13px;
}
.muted-text {
  margin: 0;
  color: var(--rf-muted);
  font-size: 12px;
}
.ref-safe {
  margin: 0;
  padding: 8px 10px;
  border-radius: var(--rf-control-radius);
  background: var(--tone-success-bg);
  color: var(--tone-success);
  font-size: 12px;
}
.ref-warning {
  padding: 8px 10px;
  border-radius: var(--rf-control-radius);
  background: var(--tone-warning-bg);
  color: var(--tone-warning);
  font-size: 12px;
}
.ref-warning p {
  margin: 0 0 4px;
  font-weight: 600;
}
.ref-warning ul {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 2px;
}
.detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
}
.detail-footer-right {
  display: flex;
  gap: 8px;
}
@media (max-width: 720px) {
  .detail-layout {
    grid-template-columns: 1fr;
  }
}
</style>
