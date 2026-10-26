<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { request, errorMessage } from "../api";
import { displayDate } from "../forms";
import type { Activity, Registration, Page } from "../types";
const route = useRoute(),
  activity = ref<Activity | null>(null),
  page = ref(0),
  data = ref<Page<Registration>>({
    items: [],
    total: 0,
    page: 0,
    size: 20,
    hasMore: false,
  }),
  busy = ref(false),
  error = ref(""),
  revealed = ref(new Set<string>());
let generation = 0,
  controller: AbortController | undefined;
async function load() {
  const current = ++generation;
  controller?.abort();
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  revealed.value = new Set();
  try {
    const id = encodeURIComponent(String(route.params.id));
    const [details, list] = await Promise.all([
      request<Activity>(`/admin/activities/${id}`, {
        signal: controller.signal,
      }),
      request<Page<Registration>>(
        `/admin/activities/${id}/registrations?page=${page.value}&size=20`,
        { signal: controller.signal },
      ),
    ]);
    if (current === generation) {
      activity.value = details;
      data.value = list;
    }
  } catch (e) {
    if (
      current === generation &&
      !(e instanceof DOMException && e.name === "AbortError")
    )
      error.value = errorMessage(e);
  } finally {
    if (current === generation) busy.value = false;
  }
}
function toggle(id: string) {
  const set = new Set(revealed.value);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  revealed.value = set;
}
function maskPhone(phone: string) {
  return phone.length > 7
    ? `${phone.slice(0, 3)}••••${phone.slice(-4)}`
    : "••••";
}
watch(page, load);
onMounted(load);
onUnmounted(() => {
  generation++;
  controller?.abort();
  data.value.items = [];
  revealed.value.clear();
});
</script>
<template>
  <main class="workspace">
    <RouterLink class="back-link" to="/activities">← 返回活动目录</RouterLink>
    <section class="page-heading">
      <div>
        <p class="eyebrow">THE PEOPLE WHO SHOW UP</p>
        <h1>一起出发的人</h1>
        <p class="muted">
          {{ activity?.title || "报名名单" }}
          <span v-if="activity"
            >· {{ activity.registeredCount }} / {{ activity.capacity }} 人</span
          >
        </p>
      </div>
      <RouterLink
        v-if="activity"
        class="secondary button"
        :to="`/activities/${activity.id}/edit`"
        >查看活动 ↗</RouterLink
      >
    </section>
    <div class="privacy-note">
      报名信息仅用于本次活动组织。手机号默认隐藏，点击后可查看；请勿公开名单、截图或用于无关营销。
    </div>
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <p v-if="busy" class="empty-state">正在读取报名名单…</p>
    <div v-else-if="!data.items.length && !error" class="empty-state">
      <h3>还没有人报名</h3>
      <p>发布活动后，用户报名信息会出现在这里。</p>
    </div>
    <div v-else-if="!error" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>参与者</th>
            <th>联系方式</th>
            <th>报名时间 / 北京时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in data.items" :key="item.id">
            <td>
              <strong>{{ item.participantName }}</strong>
            </td>
            <td>
              <span>{{
                revealed.has(item.id) ? item.phone : maskPhone(item.phone)
              }}</span
              ><button
                class="text-button phone-toggle"
                @click="toggle(item.id)"
              >
                {{ revealed.has(item.id) ? "隐藏" : "查看" }}
              </button>
            </td>
            <td>{{ displayDate(item.createdAt) }}</td>
            <td>
              <span
                class="status-pill inline"
                :class="item.status === 'CONFIRMED' ? 'published' : 'cancelled'"
                >{{ item.status === "CONFIRMED" ? "已报名" : "已取消" }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav class="pagination" aria-label="名单分页">
      <button class="secondary" :disabled="busy || page === 0" @click="page--">
        上一页</button
      ><span>第 {{ page + 1 }} 页 · 共 {{ data.total }} 条记录</span
      ><button
        class="secondary"
        :disabled="busy || !data.hasMore"
        @click="page++"
      >
        下一页
      </button>
    </nav>
  </main>
</template>
