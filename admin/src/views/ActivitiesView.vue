<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { request, errorMessage } from "../api";
import { categories, statuses, type Activity, type Page } from "../types";
import { activityStatusTone } from "../statusTone";
import { displayDate } from "../forms";
import AppIcon from "../components/AppIcon.vue";
import UiState from "../components/UiState.vue";
const result = ref<Page<Activity>>({
    items: [],
    total: 0,
    page: 0,
    size: 8,
    hasMore: false,
  }),
  page = ref(0),
  category = ref(""),
  status = ref(""),
  query = ref(""),
  appliedQuery = ref(""),
  busy = ref(false),
  error = ref("");
let generation = 0,
  controller: AbortController | undefined;
async function load() {
  const generationNow = ++generation;
  controller?.abort();
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      size: "8",
    });
    if (category.value) params.set("category", category.value);
    if (status.value) params.set("status", status.value);
    if (appliedQuery.value) params.set("title", appliedQuery.value);
    const data = await request<Page<Activity>>(`/admin/activities?${params}`, {
      signal: controller.signal,
    });
    if (generationNow === generation) result.value = data;
  } catch (e) {
    if (
      generationNow === generation &&
      !(e instanceof DOMException && e.name === "AbortError")
    )
      error.value = errorMessage(e);
  } finally {
    if (generationNow === generation) busy.value = false;
  }
}
function applyFilters() {
  appliedQuery.value = query.value.trim();
  if (page.value !== 0) page.value = 0;
  else void load();
}
function resetFilters() {
  query.value = "";
  category.value = "";
  status.value = "";
  applyFilters();
}
function rosterLink(item: Activity) {
  return item.priceCents > 0
    ? { path: "/activity-orders", query: { activityId: item.id } }
    : `/activities/${item.id}/registrations`;
}
watch(page, load);
onMounted(load);
onUnmounted(() => {
  generation++;
  controller?.abort();
});
</script>
<template>
  <main class="workspace">
    <h1 class="sr-only">活动管理</h1>
    <form class="filterbar activity-filterbar" @submit.prevent="applyFilters">
      <label class="search-label"
        ><span class="sr-only">搜索标题</span
        ><input
          v-model="query"
          placeholder="输入活动名称"
          maxlength="100" /></label
      ><select v-model="category" aria-label="活动分类" @change="applyFilters">
        <option value="">全部分类</option>
        <option v-for="(label, key) in categories" :key="key" :value="key">
          {{ label }}
        </option></select
      ><select v-model="status" aria-label="活动状态" @change="applyFilters">
        <option value="">全部状态</option>
        <option v-for="(label, key) in statuses" :key="key" :value="key">
          {{ label }}
        </option></select
      ><button class="secondary" type="submit" :disabled="busy">筛选</button
      ><button class="secondary" type="button" :disabled="busy" @click="resetFilters">
        重置
      </button>
      <span class="filter-count" aria-live="polite">共 {{ result.total }} 场</span>
      <span class="filterbar-actions">
        <button class="secondary" type="button" :disabled="busy" @click="load">
          <AppIcon name="refresh" :size="14" />刷新
        </button>
        <RouterLink class="primary button" to="/activities/new"
          ><AppIcon name="plus" :size="16" />新建活动</RouterLink
        >
      </span>
    </form>
    <UiState v-if="error" kind="error" compact>
      {{ error }} <button class="text-button" @click="load">重新加载</button>
    </UiState>
    <UiState v-else-if="busy" kind="loading" compact>正在加载活动…</UiState>
    <UiState v-else-if="!result.items.length" compact>
      暂无匹配活动
      <button
        v-if="appliedQuery || category || status"
        class="secondary"
        @click="resetFilters"
      >
        清除筛选
      </button>
    </UiState>
    <ul v-else class="activity-card-grid" aria-label="活动目录">
      <li v-for="item in result.items" :key="item.id" class="activity-card">
        <img class="card-cover" :src="item.coverUrl" :alt="item.title" loading="lazy" />
        <div class="card-fields">
          <div class="card-title-row">
            <RouterLink
              :to="`/activities/${item.id}/edit`"
              class="card-title"
              >{{ item.title }}</RouterLink
            >
            <span
              class="status-pill inline"
              :class="`tone-${activityStatusTone(item.status)}`"
              >{{ statuses[item.status] }}</span
            >
          </div>
          <p class="card-meta">
            {{ categories[item.category] }}<span aria-hidden="true"> · </span>{{ item.location }}
          </p>
          <p class="card-depart">
            <AppIcon name="location" :size="14" />{{ displayDate(item.startAt) }}
            <span
              class="card-price"
              :class="{ 'is-free': item.priceCents === 0 }"
              >{{
                item.priceCents > 0
                  ? `¥${(item.priceCents / 100).toFixed(2)} / 人`
                  : "免费报名"
              }}</span
            >
          </p>
          <div class="card-action-row">
            <p class="card-capacity">
              报名 {{ item.registeredCount }} / {{ item.capacity }} 人
              <small v-if="item.priceCents > 0 && item.pendingPaymentCount"
                >待支付 {{ item.pendingPaymentCount }} 人</small
              >
            </p>
            <RouterLink
              :to="`/activities/${item.id}/edit`"
              class="secondary button"
              >编辑</RouterLink
            >
            <RouterLink :to="rosterLink(item)" class="secondary button">{{
              item.priceCents > 0 ? "订单" : "名单"
            }}</RouterLink>
          </div>
        </div>
      </li>
    </ul>
    <nav class="pagination" aria-label="活动分页">
      <span class="pagination-summary"
        >第 {{ page + 1 }} 页 · 共 {{ result.total }} 场</span
      >
      <button class="secondary" :disabled="busy || page === 0" @click="page--">
        上一页</button
      ><button
        class="secondary"
        :disabled="busy || !result.hasMore"
        @click="page++"
      >
        下一页
      </button>
    </nav>
  </main>
</template>
<style scoped>
.activity-filterbar {
  align-items: center;
}
.activity-filterbar .search-label {
  min-width: 220px;
  flex: 0 1 auto;
}
.filter-count {
  margin-left: auto;
  color: var(--admin-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.filterbar-actions {
  display: inline-flex;
  gap: 8px;
}
.activity-card-grid {
  list-style: none;
  margin: 16px 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.activity-card {
  display: flex;
  min-height: 144px;
  border: 1px solid var(--admin-line);
  border-radius: 12px;
  background: var(--admin-surface);
  overflow: hidden;
}
.card-cover {
  width: 176px;
  flex-shrink: 0;
  object-fit: cover;
  background: var(--admin-tint);
}
.card-fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 16px;
}
.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}
.card-title {
  flex: 1;
  min-width: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--admin-ink);
  overflow-wrap: anywhere;
}
.card-title:hover {
  color: var(--rf-primary-text);
}
.card-meta {
  margin: 0;
  min-height: 20px;
  font-size: 14px;
  color: var(--admin-muted);
  overflow-wrap: anywhere;
}
.card-depart {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  min-height: 20px;
  font-size: 14px;
  color: var(--admin-ink);
  font-variant-numeric: tabular-nums;
}
.card-depart .app-icon {
  color: var(--admin-muted);
  flex-shrink: 0;
}
.card-price {
  margin-left: auto;
  font-size: 18px;
  font-weight: 600;
  color: var(--admin-primary);
  white-space: nowrap;
}
.card-price.is-free {
  color: var(--admin-ink);
}
.card-action-row {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
}
.card-capacity {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  color: var(--admin-ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-capacity small {
  margin-left: 8px;
  color: var(--rf-warning);
  font-size: 12px;
}
.card-action-row .button {
  flex-shrink: 0;
}
.pagination {
  display: flex;
  align-items: center;
  gap: 8px;
}
.pagination-summary {
  margin-right: auto;
  color: var(--admin-muted);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 980px) {
  .activity-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 720px) {
  .activity-card {
    min-height: 0;
  }
  .card-cover {
    width: 104px;
  }
  .card-fields {
    padding: 10px 12px;
  }
  .card-title {
    font-size: 15px;
  }
  .filter-count {
    display: none;
  }
  .filterbar-actions {
    flex: 1;
    justify-content: flex-end;
  }
}
</style>
