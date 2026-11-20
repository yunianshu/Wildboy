<script setup lang="ts">
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
</script>
<template>
  <main class="workspace articles-workspace">
    <div class="page-heading">
      <h1>文章管理</h1>
      <div class="article-actions">
        <button class="secondary" :disabled="loading" @click="load()">
          <AppIcon name="refresh" :size="16" />
          {{ loading ? "加载中…" : "刷新文章" }}
        </button>
        <button class="primary" @click="create">
          <AppIcon name="plus" :size="16" />
          新建文章
        </button>
      </div>
    </div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <UiState v-if="loading && !items.length" kind="loading" compact
      >正在读取文章…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact
      >暂无文章，创建草稿并发布后即可展示。</UiState
    >
    <template v-if="items.length">
      <div class="table-scroll article-table">
        <table aria-label="文章">
          <thead>
            <tr>
              <th scope="col">标题</th>
              <th scope="col">状态</th>
              <th scope="col">公开入口</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="article in items"
              :key="article.id"
              class="article-row"
              @click="edit(article)"
            >
              <td class="article-title">
                {{ article.title
                }}<span
                  v-if="article.isOfficial"
                  class="status-pill inline tone-info article-official"
                  >官方介绍</span
                >
              </td>
              <td>
                <span
                  class="status-pill inline"
                  :class="`tone-${articleStatusTone(article.status)}`"
                >
                  {{ article.status === "PUBLISHED" ? "已发布" : "草稿" }}
                </span>
              </td>
              <td class="article-entry">
                {{
                  article.status === "DRAFT"
                    ? "—"
                    : article.isOfficial
                      ? "野小子官方介绍"
                      : "探索页文章"
                }}
              </td>
              <td>
                <RouterLink
                  class="text-button"
                  :to="`/articles/${article.id}/edit`"
                  @click.stop
                >
                  {{ article.status === "PUBLISHED" ? "查看文章" : "编辑文章" }}
                </RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <PaginationBar v-if="pageTotal != null || more || page > 0" :page="page" :page-size="20" :total="pageTotal" :has-more="more" :busy="loading" label="文章分页" @change="load" />
    <p class="article-hint">只有已发布文章可以设为官方介绍。</p>
  </main>
</template>
<style scoped>
.article-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.article-table table {
  min-width: 495px;
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
.article-hint {
  margin: 10px 0 0;
  color: var(--admin-muted);
  font-size: 13px;
}
.article-more {
  margin-top: 12px;
}
</style>
