<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import { request, errorMessage } from "../api";
import { categories, statuses, type Activity, type Page } from "../types";
import { displayDate } from "../forms";
const result = ref<Page<Activity>>({
    items: [],
    total: 0,
    page: 0,
    size: 12,
    hasMore: false,
  }),
  page = ref(0),
  category = ref(""),
  status = ref(""),
  query = ref(""),
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
      size: "12",
    });
    if (category.value) params.set("category", category.value);
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
const filteredItems = computed(() =>
  result.value.items.filter(
    (item) =>
      (!status.value || item.status === status.value) &&
      (!query.value.trim() ||
        item.title.toLowerCase().includes(query.value.trim().toLowerCase())),
  ),
);
function applyCategory() {
  if (page.value !== 0) page.value = 0;
  else void load();
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
        <p class="eyebrow">YOUR NEXT ADVENTURE</p>
        <h1>把热爱，变成一场出发。</h1>
        <p class="muted">从草稿到成行，在这里安排好每一个细节。</p>
      </div>
      <RouterLink class="primary button" to="/activities/new"
        >＋ 新建活动</RouterLink
      >
    </section>
    <section class="workspace-note">
      <span class="note-icon">↗</span>
      <div>
        <strong>活动发布与报名工作台</strong>
        <p>
          草稿仅管理员可见；发布后用户即可报名。目前所有活动仅支持免费报名。
        </p>
      </div>
      <span class="small-tag">FREE REGISTRATION</span>
    </section>
    <form class="filterbar" @submit.prevent>
      <label class="search-label"
        ><span class="sr-only">搜索标题</span
        ><input
          v-model="query"
          placeholder="筛选当前页活动标题…"
          maxlength="100" /></label
      ><select v-model="category" aria-label="活动分类" @change="applyCategory">
        <option value="">全部分类</option>
        <option v-for="(label, key) in categories" :key="key" :value="key">
          {{ label }}
        </option></select
      ><select v-model="status" aria-label="当前页活动状态">
        <option value="">当前页全部状态</option>
        <option v-for="(label, key) in statuses" :key="key" :value="key">
          {{ label }}
        </option></select
      ><button class="secondary" type="submit" :disabled="busy">
        筛选当前页
      </button>
    </form>
    <div class="section-caption">
      <h2>
        活动目录 <span>{{ result.total }}</span>
      </h2>
      <button class="text-button" :disabled="busy" @click="load">
        刷新列表 ↻
      </button>
    </div>
    <div v-if="error" class="error-box" role="alert">
      {{ error }} <button class="text-button" @click="load">重新加载</button>
    </div>
    <div v-if="busy" class="empty-state" aria-live="polite">
      正在读取最新活动…
    </div>
    <div v-else-if="!filteredItems.length && !error" class="empty-state">
      <span>⌁</span>
      <h3>下一次出发，从这里开始</h3>
      <p>当前页没有匹配活动。可以清空筛选、切换页面，或创建新草稿。</p>
      <RouterLink class="secondary button" to="/activities/new"
        >创建第一场活动</RouterLink
      >
    </div>
    <div v-else-if="!error" class="activity-grid">
      <article
        v-for="item in filteredItems"
        :key="item.id"
        class="activity-card"
      >
        <RouterLink :to="`/activities/${item.id}/edit`" class="card-image-link"
          ><img
            :src="item.coverUrl"
            :alt="item.title"
            loading="lazy"
            referrerpolicy="no-referrer"
          /><span class="status-pill" :class="item.status.toLowerCase()">{{
            statuses[item.status]
          }}</span></RouterLink
        >
        <div class="card-body">
          <div class="card-category">
            {{ categories[item.category] }} <span>免费报名</span>
          </div>
          <RouterLink :to="`/activities/${item.id}/edit`" class="card-title">{{
            item.title
          }}</RouterLink>
          <p class="card-location">⌖ {{ item.location }}</p>
          <p class="card-date">{{ displayDate(item.startAt) }} · 北京时间</p>
          <div class="card-bottom">
            <span
              ><strong>{{ item.registeredCount }}</strong> /
              {{ item.capacity }} 人</span
            >
            <div>
              <RouterLink :to="`/activities/${item.id}/registrations`"
                >名单</RouterLink
              ><RouterLink :to="`/activities/${item.id}/edit`"
                >编辑 ↗</RouterLink
              >
            </div>
          </div>
        </div>
      </article>
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
