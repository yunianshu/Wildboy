<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { inject } from "vue";
import { request, errorMessage } from "../api";
import { categories, statuses, type Activity, type Page } from "../types";
import { activityStatusTone } from "../statusTone";
import { displayDate } from "../forms";
import AppIcon from "../components/AppIcon.vue";
import PaginationBar from "../components/PaginationBar.vue";
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
  upcomingFull = ref(false),
  query = ref(""),
  appliedQuery = ref(""),
  busy = ref(false),
  error = ref("");
const route = inject(routeLocationKey, null);
const router = inject(routerKey, null);
function restoreFilters() {
  const values = route?.query;
  if (!values) return;
  category.value = typeof values.category === "string" && values.category in categories ? values.category : "";
  status.value = typeof values.status === "string" && values.status in statuses ? values.status : "";
  upcomingFull.value = values.upcomingFull === "1";
  query.value = appliedQuery.value = typeof values.title === "string" ? values.title.slice(0, 100) : "";
  const current = Number(values.page ?? 0);
  page.value = Number.isSafeInteger(current) && current >= 0 && current <= 100000 ? current : 0;
}
function rememberFilters() {
  if (!router || !route) return;
  void router.replace({ query: {
    ...route.query,
    title: appliedQuery.value || undefined,
    category: category.value || undefined,
    status: status.value || undefined,
    upcomingFull: upcomingFull.value ? "1" : undefined,
    page: page.value || undefined,
  } });
}
restoreFilters();
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
    if (upcomingFull.value) params.set("upcomingFull", "true");
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
  else { rememberFilters(); void load(); }
}
function resetFilters() {
  query.value = "";
  category.value = "";
  status.value = "";
  upcomingFull.value = false;
  applyFilters();
}
function rosterLink(item: Activity) {
  return item.priceCents > 0
    ? { path: "/activity-orders", query: { activityId: item.id } }
    : `/activities/${item.id}/registrations`;
}
watch(page, () => { rememberFilters(); void load(); });
onMounted(load);
onUnmounted(() => {
  generation++;
  controller?.abort();
});
</script>
<template>
  <main class="workspace">
    <header class="activity-heading">
      <h1>活动管理</h1>
      <span class="filterbar-actions">
        <button class="secondary" type="button" :disabled="busy" @click="load">
          <AppIcon name="refresh" :size="14" />刷新
        </button>
        <RouterLink class="primary button" to="/activities/new"
          ><AppIcon name="plus" :size="16" />新建活动</RouterLink
        >
      </span>
    </header>
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
      ><label class="filter-checkbox"><input v-model="upcomingFull" type="checkbox" @change="applyFilters" />即将开始且满员</label>
      <button class="secondary" type="submit" :disabled="busy">筛选</button
      ><button
        class="secondary"
        type="button"
        :disabled="busy"
        @click="resetFilters"
      >
        重置
      </button>
      <span class="filter-count" aria-live="polite"
        >共 {{ result.total }} 场</span
      >
    </form>
    <UiState v-if="error" kind="error" compact>
      {{ error }} <button class="text-button" @click="load">重新加载</button>
    </UiState>
    <UiState v-else-if="busy" kind="loading" compact>正在加载活动…</UiState>
    <UiState v-else-if="!result.items.length" compact>
      暂无匹配活动
      <button
        v-if="appliedQuery || category || status || upcomingFull"
        class="secondary"
        @click="resetFilters"
      >
        清除筛选
      </button>
    </UiState>
    <div v-else class="table-scroll activity-table-wrap">
      <table class="activity-table" aria-label="活动目录">
        <thead>
          <tr>
            <th scope="col">活动</th>
            <th scope="col">分类</th>
            <th scope="col">出发时间</th>
            <th scope="col">价格</th>
            <th scope="col">报名人数</th>
            <th scope="col">状态</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in result.items" :key="item.id">
            <td class="activity-cell">
              <img
                class="activity-cover"
                :src="item.coverUrl"
                alt=""
                loading="lazy"
              />
              <div>
                <RouterLink
                  :to="{ path: '/activities/' + item.id + '/edit', query: route?.fullPath.includes('?') ? { list: route.fullPath } : undefined }"
                  class="activity-title"
                  >{{ item.title }}</RouterLink
                >
                <p class="activity-location">{{ item.location }}</p>
              </div>
            </td>
            <td data-label="分类">{{ categories[item.category] }}</td>
            <td data-label="出发时间" class="activity-date">
              {{ displayDate(item.startAt) }}
            </td>
            <td data-label="价格" class="activity-price">
              {{
                item.priceCents > 0
                  ? `¥${(item.priceCents / 100).toFixed(2)}`
                  : "免费"
              }}
            </td>
            <td data-label="报名人数">
              <span class="activity-capacity"
                >{{ item.registeredCount }} / {{ item.capacity }} 人</span
              ><small
                v-if="item.priceCents > 0 && item.pendingPaymentCount"
                class="activity-pending"
                >待支付 {{ item.pendingPaymentCount }} 人</small
              >
            </td>
            <td data-label="状态">
              <span
                class="status-pill inline"
                :class="`tone-${activityStatusTone(item.status)}`"
                >{{ statuses[item.status] }}</span
              >
            </td>
            <td class="activity-actions">
              <RouterLink
                :to="{ path: '/activities/' + item.id + '/edit', query: route?.fullPath.includes('?') ? { list: route.fullPath } : undefined }"
                class="table-action"
                >编辑</RouterLink
              ><RouterLink :to="rosterLink(item)" class="table-action">{{
                item.priceCents > 0 ? "订单" : "名单"
              }}</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar :page="page" :page-size="result.size" :total="result.total" :has-more="result.hasMore" :busy="busy" label="活动分页" @change="(next) => page = next" />
  </main>
</template>
<style scoped>
.activity-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
  min-height: 60px;
  flex-wrap: wrap;
}
.activity-heading h1 {
  font-size: 28px;
  font-weight: 600;
  margin: 0;
  color: var(--admin-ink);
}
.activity-filterbar {
  align-items: center;
  padding: 0;
  border: 0;
  border-radius: 0;
}
.activity-filterbar .search-label {
  min-width: 180px;
  flex: 1 1 220px;
}
.filter-checkbox { display: flex; gap: 8px; align-items: center; margin: 0; white-space: nowrap; }
.filter-checkbox input { width: auto; margin: 0; }
.filter-count {
  margin-left: auto;
  color: var(--admin-muted);
  font-size: 13px;
}
.filterbar-actions {
  display: inline-flex;
  gap: 8px;
}
.activity-table-wrap {
  margin: 18px 0;
  border-radius: 8px;
}
.activity-table {
  min-width: 0;
  width: 100%;
}
.activity-table th {
  white-space: nowrap;
}
.activity-table td {
  vertical-align: middle;
  padding: 14px 12px;
}
.activity-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 210px;
  min-height: 76px;
}
.activity-cover {
  width: 64px;
  height: 48px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
  background: var(--admin-tint);
}
.activity-title {
  color: var(--admin-ink);
  font-size: 15px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.activity-title:hover {
  color: var(--rf-primary-text);
}
.activity-location {
  color: var(--admin-muted);
  margin: 4px 0 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.activity-price,
.activity-capacity {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.activity-date {
  min-width: 140px;
  font-variant-numeric: tabular-nums;
}
.activity-pending {
  display: block;
  color: var(--rf-warning);
  white-space: nowrap;
}
.activity-actions {
  white-space: nowrap;
}
.activity-actions .table-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  color: var(--rf-primary-text);
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
}
@media (max-width: 1199px) {
  .activity-table-wrap {
    overflow: visible;
    border: 0;
  }
  .activity-table,
  .activity-table tbody {
    display: block;
  }
  .activity-table thead {
    display: none;
  }
  .activity-table tbody {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .activity-table tr {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid var(--admin-line);
    border-radius: 8px;
    padding: 12px;
    background: var(--admin-surface);
  }
  .activity-table td {
    border: 0;
    padding: 6px;
    min-width: 0;
  }
  .activity-table .activity-cell {
    grid-column: 1 / -1;
  }
  .activity-table td[data-label]::before {
    content: attr(data-label);
    display: block;
    color: var(--admin-muted);
    font-size: 12px;
    margin-bottom: 4px;
  }
  .activity-table .activity-actions {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
  }
}
@media (max-width: 600px) {
  .activity-table tbody {
    grid-template-columns: minmax(0, 1fr);
  }
  .filterbar-actions {
    flex-wrap: wrap;
  }
  .filter-count {
    display: none;
  }
}
</style>
