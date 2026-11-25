<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import PaginationBar from "../components/PaginationBar.vue";
import { onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Page } from "../types";
import { articleStatusTone } from "../statusTone";
import AppIcon from "../components/AppIcon.vue";
import UiState from "../components/UiState.vue";
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
              <td role="cell" data-cell="title" class="article-title">
                {{ article.title
                }}<span
                  v-if="article.isOfficial"
                  class="status-pill inline tone-info article-official"
                  >官方介绍</span
                >
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
                <RouterLink
                  class="text-button"
                  :to="`/articles/${article.id}/edit`"
                  @click.stop
                >
                  编辑文章
                </RouterLink>
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
  width: 24%;
}
.article-table th:last-child {
  width: 116px;
}
.article-title {
  font-weight: 650;
  overflow-wrap: anywhere;
}
.article-official {
  margin-left: 8px;
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
.article-more {
  margin-top: 12px;
}
</style>
