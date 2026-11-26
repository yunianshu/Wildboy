<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import PaginationBar from "../components/PaginationBar.vue";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Page } from "../types";
import { articleStatusTone } from "../statusTone";
import AppIcon from "../components/AppIcon.vue";
import UiState from "../components/UiState.vue";
import FormModal from "../components/FormModal.vue";
// 文章编辑已迁移到独立页面 /articles/new 与 /articles/:id/edit（文档画布）。
type Article = {
  id: string;
  title: string;
  summary: string;
  coverUrl: string;
  activityId: string | null;
  status: "DRAFT" | "PUBLISHED";
  isOfficial: boolean;
  version: number;
};
const router = useRouter();
const copySource = ref<Article | null>(null);
const copyTitle = ref("");
const copyBusy = ref(false);
const copyError = ref("");
const copyConflict = ref(false);
const pendingCopies = new Map<
  string,
  { requestId: string; title: string; version: number }
>();
const copyUncertain = ref(false);
const items = ref<Article[]>([]),
  page = ref(0),
  pageTotal = ref<number>(),
  more = ref(false),
  loading = ref(false),
  error = ref("");
function articleError(e: unknown) {
  return e instanceof ApiError && e.status === 409
    ? "文章版本或状态已变化，请刷新后核对。"
    : errorMessage(e);
}
let epoch = 0;
function reset() {
  epoch++;
  items.value = [];
  loading.value = false;
  error.value = "";
  copySource.value = null;
  copyBusy.value = false;
  pendingCopies.clear();
}
watch(currentUser, (u, old) => {
  if (u !== old) {
    reset();
    if (u) void load();
  }
});
onUnmounted(reset);
async function load(p = 0) {
  if (loading.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value;
  loading.value = true;
  error.value = "";
  try {
    const result = await request<Page<Article>>(
      `/admin/articles?page=${p}&size=20`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = result.items;
    pageTotal.value = result.total;
    page.value = p;
    more.value = result.hasMore;
  } catch (e) {
    if (n === epoch) error.value = articleError(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
function edit(article: Article) {
  void router.push(`/articles/${article.id}/edit`);
}
function create() {
  void router.push("/articles/new");
}
function openCopy(article: Article) {
  const pending = pendingCopies.get(article.id);
  copySource.value = article;
  const suffix = "（副本）";
  copyTitle.value =
    pending?.title ??
    (article.title.length + suffix.length <= 120
      ? article.title + suffix
      : article.title);
  copyConflict.value = false;
  copyError.value = pending
    ? "上次保存结果待确认，重试后将打开同一份草稿。"
    : "";
  copyUncertain.value = !!pending;
}
function closeCopy() {
  if (copyBusy.value) return;
  copySource.value = null;
  if (copyConflict.value) void load(page.value);
}
async function saveCopy() {
  const source = copySource.value;
  const actor = currentUser.value;
  const title = copyTitle.value.trim();
  if (!source || !actor || !title || copyBusy.value || copyConflict.value)
    return;
  const n = epoch;
  const body = pendingCopies.get(source.id) ?? {
    title,
    version: source.version,
    requestId:
      globalThis.crypto?.randomUUID?.() ??
      `copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
  pendingCopies.set(source.id, body);
  copyBusy.value = true;
  copyError.value = "";
  try {
    const draft = await request<Article>(
      `/admin/articles/${encodeURIComponent(source.id)}/copy`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
    if (epoch !== n || actor !== currentUser.value) return;
    pendingCopies.delete(source.id);
    copySource.value = null;
    await router.push(`/articles/${draft.id}/edit`);
  } catch (e) {
    if (epoch !== n || actor !== currentUser.value) return;
    const knownFailure =
      e instanceof ApiError && e.status >= 400 && e.status < 500;
    if (knownFailure) pendingCopies.delete(source.id);
    copyUncertain.value = !knownFailure;
    copyConflict.value = e instanceof ApiError && e.status === 409;
    copyError.value = copyConflict.value
      ? "原文已更新，请返回列表刷新后重新复制。"
      : copyUncertain.value
        ? "保存结果待确认，请重试以打开同一份草稿。"
        : errorMessage(e);
  } finally {
    if (epoch === n) copyBusy.value = false;
  }
}
onMounted(() => void load());
useForegroundRefresh(() => {
  if (!loading.value) void load(page.value);
});
</script>
<template>
  <main class="workspace articles-workspace">
    <div class="page-heading">
      <h1>文章管理</h1>
      <div class="article-actions">
        <button class="primary" @click="create">
          <AppIcon name="plus" :size="16" />
          新建文章
        </button>
      </div>
    </div>
    <p v-if="error" class="error-box" role="alert">
      {{ error }}
      <button
        v-if="!items.length"
        type="button"
        class="text-button"
        :disabled="loading"
        @click="load(page)"
      >
        重试
      </button>
    </p>
    <UiState v-if="loading && !items.length" kind="loading" compact
      >正在读取文章…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact
      >暂无文章</UiState
    >
    <template v-if="items.length">
      <div class="table-scroll article-table">
        <table class="record-table" role="table" aria-label="文章">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader" scope="col">标题</th>
              <th role="columnheader" scope="col">状态</th>
              <th role="columnheader" scope="col">公开入口</th>
              <th role="columnheader" scope="col">操作</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr
              role="row"
              v-for="article in items"
              :key="article.id"
              class="article-row"
              @click="edit(article)"
            >
              <td role="cell" data-cell="title">
                <div class="article-identity">
                  <span class="article-cover" aria-hidden="true">
                    <AppIcon name="document" :size="20" />
                    <img
                      v-if="article.coverUrl"
                      :key="article.coverUrl"
                      :src="article.coverUrl"
                      alt=""
                      loading="lazy"
                      @error="($event.target as HTMLImageElement).hidden = true"
                    />
                  </span>
                  <div class="article-text">
                    <RouterLink
                      class="article-title"
                      :to="`/articles/${article.id}/edit`"
                      @click.stop
                    >
                      {{ article.title }}
                    </RouterLink>
                    <p v-if="article.summary" class="article-summary">
                      {{ article.summary }}
                    </p>
                  </div>
                </div>
              </td>
              <td role="cell" data-label="状态">
                <span
                  class="status-pill inline"
                  :class="`tone-${articleStatusTone(article.status)}`"
                >
                  {{ article.status === "PUBLISHED" ? "已发布" : "草稿" }}
                </span>
              </td>
              <td role="cell" data-label="公开入口" class="article-entry">
                {{
                  article.status === "DRAFT"
                    ? "—"
                    : article.isOfficial
                      ? "野小子官方介绍"
                      : "探索页文章"
                }}
              </td>
              <td role="cell" data-cell="actions">
                <div class="article-row-actions">
                  <RouterLink
                    class="text-button"
                    :to="`/articles/${article.id}/edit`"
                    @click.stop
                  >
                    编辑文章
                  </RouterLink>
                  <button
                    type="button"
                    class="text-button"
                    :aria-label="`复制文章「${article.title}」`"
                    @click.stop="openCopy(article)"
                  >
                    复制文章
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <PaginationBar
      v-if="pageTotal != null || more || page > 0"
      :page="page"
      :page-size="20"
      :total="pageTotal"
      :has-more="more"
      :busy="loading"
      label="文章分页"
      @change="load"
    />
    <FormModal
      v-if="copySource"
      title="复制文章"
      size="sm"
      :busy="copyBusy"
      @close="closeCopy"
    >
      <form
        id="copy-article-form"
        class="article-copy-form"
        @submit.prevent="saveCopy"
      >
        <p class="muted">沿用原文的正文、封面和关联活动。</p>
        <label for="copy-article-title">副本标题</label>
        <input
          id="copy-article-title"
          v-model="copyTitle"
          maxlength="120"
          required
          :disabled="copyBusy || copyUncertain || copyConflict"
        />
        <p v-if="copyError" class="error-box" role="alert">{{ copyError }}</p>
      </form>
      <template #footer>
        <div class="dialog-actions">
          <button
            class="secondary"
            type="button"
            :disabled="copyBusy"
            @click="closeCopy"
          >
            {{ copyConflict ? "返回并刷新" : "取消" }}
          </button>
          <button
            v-if="!copyConflict"
            class="primary"
            type="submit"
            form="copy-article-form"
            :disabled="copyBusy || !copyTitle.trim()"
          >
            {{
              copyBusy
                ? "正在保存…"
                : copyUncertain
                  ? "重试并打开"
                  : "保存草稿并编辑"
            }}
          </button>
        </div>
      </template>
    </FormModal>
  </main>
</template>
<style scoped>
.article-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.article-table table {
  table-layout: fixed;
}
.article-table th:nth-child(2) {
  width: 14%;
}
.article-table th:nth-child(3) {
  width: 19%;
}
.article-table th:last-child {
  width: 184px;
}
.article-row-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px 6px;
}
.article-row-actions .text-button {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 13px;
}
.article-copy-form {
  display: grid;
  gap: 8px;
}
.article-copy-form label,
.article-copy-form input {
  margin: 0;
}
.article-copy-form p {
  margin: 0 0 8px;
}
.article-title {
  display: inline-block;
  color: inherit;
  text-decoration: none;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.article-identity {
  display: flex;
  align-items: center;
  gap: 12px;
}
.article-cover {
  position: relative;
  display: grid;
  place-items: center;
  flex: 0 0 56px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--rf-soft);
  color: var(--rf-primary-text);
}
.article-cover img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.article-text {
  min-width: 0;
}
.article-summary {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--rf-muted);
  margin: 4px 0 0;
  font-size: 12px;
}
.article-entry {
  color: var(--admin-muted);
}
.article-row {
  cursor: pointer;
}
.article-row:hover .article-title {
  color: var(--rf-primary-text);
}
</style>
