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
    <section class="page-heading">
      <div>
        <h1>活动管理</h1>
      </div>
      <RouterLink class="primary button" to="/activities/new"
        ><AppIcon name="plus" :size="16" />新建活动</RouterLink
      >
    </section>
    <form class="filterbar" @submit.prevent="applyFilters">
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
      ><button class="secondary" type="submit" :disabled="busy">筛选</button>
    </form>
    <div class="section-caption">
      <h2>
        活动目录 <span>{{ result.total }} 场</span>
      </h2>
      <button class="text-button" :disabled="busy" @click="load">
        <AppIcon name="refresh" :size="14" />刷新列表
      </button>
    </div>
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
    <div v-else class="table-scroll activity-register">
      <table>
        <thead>
          <tr>
            <th scope="col">活动</th>
            <th scope="col">开始时间（北京时间）</th>
            <th scope="col">报名价格</th>
            <th scope="col">名额</th>
            <th scope="col">状态</th>
            <th scope="col">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in result.items" :key="item.id">
            <td class="activity-name">
              <RouterLink
                :to="`/activities/${item.id}/edit`"
                class="activity-title"
                >{{ item.title }}</RouterLink
              >
              <small
                >{{ categories[item.category] }} · {{ item.location }}</small
              >
            </td>
            <td class="table-number">{{ displayDate(item.startAt) }}</td>
            <td class="table-number">
              {{
                item.priceCents > 0
                  ? `¥${(item.priceCents / 100).toFixed(2)} / 人`
                  : "免费报名"
              }}
            </td>
            <td class="table-number">
              {{ item.registeredCount }} / {{ item.capacity }} 人
              <small v-if="item.priceCents > 0 && item.pendingPaymentCount"
                >待支付 {{ item.pendingPaymentCount }}</small
              >
            </td>
            <td>
              <span
                class="status-pill inline"
                :class="`tone-${activityStatusTone(item.status)}`"
                >{{ statuses[item.status] }}</span
              >
            </td>
            <td>
              <div class="action-row">
                <RouterLink
                  :to="`/activities/${item.id}/edit`"
                  class="secondary button"
                  >编辑</RouterLink
                >
                <RouterLink :to="rosterLink(item)" class="secondary button">{{
                  item.priceCents > 0 ? "订单" : "名单"
                }}</RouterLink>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav class="pagination" aria-label="活动分页">
      <button class="secondary" :disabled="busy || page === 0" @click="page--">
        上一页</button
      ><span>第 {{ page + 1 }} 页 · 共 {{ result.total }} 场</span
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
.section-caption {
  margin: 8px 0;
}
.activity-register .activity-title {
  display: block;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.activity-register small {
  display: block;
  color: var(--admin-muted);
  overflow-wrap: anywhere;
}
.activity-register .action-row {
  flex-wrap: nowrap;
}
@media (max-width: 720px) {
  .activity-register {
    border: 0;
    background: none;
  }
  .activity-register table,
  .activity-register tbody {
    display: block;
    min-width: 0;
  }
  .activity-register thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .activity-register tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 4px 10px;
    padding: 12px;
    margin-bottom: 8px;
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
    background: var(--admin-surface);
  }
  .activity-register td {
    padding: 0;
    border: 0;
  }
  .activity-name {
    grid-column: 1 / -1;
  }
}
</style>
