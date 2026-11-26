<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { computed, inject, ref, onMounted, onUnmounted, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { request, errorMessage } from "../api";
import { categories, statuses, type Activity, type Page } from "../types";
import { activityStatusTone } from "../statusTone";
import { displayDate } from "../forms";
import AppIcon from "../components/AppIcon.vue";
import ActivityReopenModal from "../components/ActivityReopenModal.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
const reopenTarget = ref<Activity | null>(null),
  reopenNotice = ref("");
function isExpired(item: Activity) {
  return (
    item.status === "PUBLISHED" &&
    Number.isFinite(Date.parse(item.startAt)) &&
    Date.parse(item.startAt) <= Date.now()
  );
}
function onReopened(created: Activity) {
  reopenTarget.value = null;
  if (created.status === "DRAFT" && router) {
    void router.push({
      path: `/activities/${created.id}/edit`,
      query: route?.fullPath.includes("?")
        ? { list: route.fullPath }
        : undefined,
    });
    return;
  }
  reopenNotice.value = `已生成新一期活动「${created.title}」（${statuses[created.status]}）。`;
  void load();
}
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
  loadingResults = ref(false),
  error = ref("");
const hasFilters = computed(() =>
  Boolean(
    query.value.trim() || category.value || status.value || upcomingFull.value,
  ),
);
const route = inject(routeLocationKey, null);
const router = inject(routerKey, null);
function restoreFilters() {
  const values = route?.query;
  if (!values) return;
  category.value =
    typeof values.category === "string" && values.category in categories
      ? values.category
      : "";
  status.value =
    typeof values.status === "string" && values.status in statuses
      ? values.status
      : "";
  upcomingFull.value = values.upcomingFull === "1";
  query.value = appliedQuery.value =
    typeof values.title === "string" ? values.title.slice(0, 100) : "";
  const current = Number(values.page ?? 0);
  page.value =
    Number.isSafeInteger(current) && current >= 0 && current <= 100000
      ? current
      : 0;
}
function rememberFilters() {
  if (!router || !route) return;
  void router.replace({
    query: {
      ...route.query,
      title: appliedQuery.value || undefined,
      category: category.value || undefined,
      status: status.value || undefined,
      upcomingFull: upcomingFull.value ? "1" : undefined,
      page: page.value || undefined,
    },
  });
}
restoreFilters();
let generation = 0,
  controller: AbortController | undefined,
  searchTimer: ReturnType<typeof setTimeout> | undefined;
async function load(background = false) {
  const generationNow = ++generation;
  controller?.abort();
  controller = new AbortController();
  busy.value = true;
  loadingResults.value = !background;
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
    if (generationNow === generation) busy.value = loadingResults.value = false;
  }
}
function applyFilters() {
  clearTimeout(searchTimer);
  searchTimer = undefined;
  appliedQuery.value = query.value.trim();
  if (page.value !== 0) page.value = 0;
  else {
    rememberFilters();
    void load();
  }
}
function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 300);
}
function toggleUpcomingFull() {
  upcomingFull.value = !upcomingFull.value;
  applyFilters();
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
watch(page, () => {
  rememberFilters();
  void load();
});
onMounted(() => void load());
onUnmounted(() => {
  generation++;
  controller?.abort();
  clearTimeout(searchTimer);
});
useForegroundRefresh(() => {
  if (!busy.value && searchTimer == null) void load(true);
});
</script>
<template>
  <main class="workspace">
    <header class="page-heading">
      <h1>活动管理</h1>
      <div class="heading-actions">
        <RouterLink class="primary button" to="/activities/new">
          <AppIcon name="plus" :size="16" />新建活动
        </RouterLink>
      </div>
    </header>
    <p v-if="reopenNotice" role="status" class="success-box">
      {{ reopenNotice }}
    </p>
    <form
      class="activity-filters"
      role="search"
      aria-label="筛选活动"
      @submit.prevent="applyFilters"
    >
      <input
        v-model="query"
        class="activity-search"
        type="search"
        aria-label="活动名称"
        placeholder="搜索活动名称"
        maxlength="100"
        @input="scheduleSearch"
      />
      <select v-model="category" aria-label="活动分类" @change="applyFilters">
        <option value="">全部分类</option>
        <option v-for="(label, key) in categories" :key="key" :value="key">
          {{ label }}
        </option>
      </select>
      <select v-model="status" aria-label="活动状态" @change="applyFilters">
        <option value="">全部状态</option>
        <option v-for="(label, key) in statuses" :key="key" :value="key">
          {{ label }}
        </option>
      </select>
      <button
        class="full-filter"
        type="button"
        :aria-pressed="upcomingFull"
        @click="toggleUpcomingFull"
      >
        <AppIcon
          name="check"
          :size="14"
          :class="{ 'filter-check-hidden': !upcomingFull }"
        />即将开始且满员
      </button>
      <button
        v-if="hasFilters && (error || result.items.length) && !loadingResults"
        class="text-button"
        type="button"
        @click="resetFilters"
      >
        清除筛选
      </button>
    </form>
    <UiState v-if="error" kind="error" compact>
      {{ error }}
      <button type="button" class="text-button" @click="load()">重试</button>
    </UiState>
    <UiState v-else-if="loadingResults" kind="loading" compact
      >正在加载活动…</UiState
    >
    <UiState v-else-if="!result.items.length" class="activity-empty">
      <strong>{{ hasFilters ? "暂无匹配活动" : "暂无活动" }}</strong>
      <button
        v-if="hasFilters"
        type="button"
        class="text-button"
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
              <span class="activity-cover">
                <AppIcon name="mountain" :size="22" />
                <img
                  v-if="item.coverUrl"
                  :key="item.coverUrl"
                  :src="item.coverUrl"
                  alt=""
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).hidden = true"
                />
              </span>
              <div>
                <RouterLink
                  :to="{
                    path: '/activities/' + item.id + '/edit',
                    query: route?.fullPath.includes('?')
                      ? { list: route.fullPath }
                      : undefined,
                  }"
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
              <small v-if="isExpired(item)" class="expired-tag">已过期</small>
            </td>
            <td class="activity-actions">
              <RouterLink
                :to="{
                  path: '/activities/' + item.id + '/edit',
                  query: route?.fullPath.includes('?')
                    ? { list: route.fullPath }
                    : undefined,
                }"
                class="table-action"
                >编辑</RouterLink
              ><button
                type="button"
                class="table-action button-link"
                @click="reopenTarget = item"
              >
                复制活动</button
              ><RouterLink :to="rosterLink(item)" class="table-action">{{
                item.priceCents > 0 ? "订单" : "名单"
              }}</RouterLink>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      v-if="!error && !loadingResults && (result.hasMore || page > 0)"
      :page="page"
      :page-size="result.size"
      :total="result.total"
      :has-more="result.hasMore"
      :busy="busy"
      label="活动分页"
      @change="(next) => (page = next)"
    />
    <p
      v-else-if="!error && !loadingResults && result.items.length"
      class="activity-count"
    >
      共 {{ result.total }} 场活动
    </p>
    <ActivityReopenModal
      :activity="reopenTarget"
      @close="reopenTarget = null"
      @created="onReopened"
    />
  </main>
</template>
<style scoped>
.heading-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.expired-tag {
  display: inline-block;
  margin-left: 6px;
  font-size: 11px;
  color: var(--rf-muted);
}
.button-link {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  cursor: pointer;
}
.activity-filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.activity-search {
  width: min(100%, 20rem);
  border-color: var(--rf-field-line);
}
.activity-filters select {
  width: 9rem;
  max-width: 100%;
}
.full-filter {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding-inline: 12px;
  border-color: var(--rf-field-line);
  background: var(--rf-surface);
  color: var(--rf-ink);
}
.filter-check-hidden {
  visibility: hidden;
}
.full-filter:hover,
.full-filter[aria-pressed="true"] {
  border-color: var(--rf-primary);
  background: var(--rf-soft);
  color: var(--rf-primary-text);
}
.activity-empty {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 176px;
  padding: 20px;
  text-align: center;
}
.activity-empty :deep(.ui-state-content) {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  align-items: center;
}
.activity-empty :deep(.ui-state-content button) {
  margin-left: 0;
}
.activity-empty strong {
  color: var(--rf-ink);
  font-size: 14px;
}
.activity-count {
  margin: 12px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
}
.activity-table-wrap {
  border-radius: 12px;
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
  position: relative;
  display: grid;
  place-items: center;
  width: 64px;
  height: 48px;
  overflow: hidden;
  border-radius: 6px;
  flex-shrink: 0;
  background: var(--admin-tint);
  color: var(--rf-primary-text);
}
.activity-cover img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
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
    border-radius: 14px;
    padding: 14px;
    background: var(--admin-surface);
    box-shadow: var(--rf-shadow-sm);
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
  .activity-search {
    width: 100%;
  }
  .activity-filters select {
    flex: 1 1 calc(50% - 4px);
    min-width: 0;
  }
}
</style>
