<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { request, errorMessage, currentUser } from "../api";
const items = ref<any[]>([]),
  busy = ref(false),
  error = ref(""),
  page = ref(0),
  hasMore = ref(false);
let generation = 0;
const labels: Record<string, string> = {
  PENDING: "待发送",
  SENDING: "发送中",
  SENT: "已发送",
  FAILED: "失败",
  NO_PERMISSION: "未订阅",
  UNCONFIGURED: "未配置",
  OBSOLETE: "已失效",
  UNKNOWN: "结果待核对",
};
async function load(next = 0) {
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const r = await request<any>(`/admin/notifications?page=${next}&size=20`);
    if (n === generation && currentUser.value === actor) {
      items.value = r.items;
      page.value = r.page;
      hasMore.value = r.hasMore;
    }
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
async function retry(id: string) {
  if (busy.value) return;
  const actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    await request(`/admin/notifications/${encodeURIComponent(id)}/retry`, {
      method: "POST",
    });
    if (currentUser.value === actor) await load(page.value);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
onUnmounted(() => {
  generation++;
  items.value = [];
});
</script>
<template>
  <section class="page-heading">
    <h1>活动通知</h1>
    <button class="secondary" @click="load(page)" :disabled="busy">刷新</button>
  </section>
  <p v-if="error" class="error-box">{{ error }}</p>
  <div v-if="!items.length && !busy" class="empty-state">暂无通知</div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>活动</th>
          <th>内容</th>
          <th>状态</th>
          <th>发送次数</th>
          <th>异常</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ item.title }}</td>
          <td>{{ item.detail }}</td>
          <td>{{ labels[item.status] || item.status }}</td>
          <td>{{ item.attempts }}</td>
          <td>{{ item.lastError }}</td>
          <td>
            <button
              v-if="
                ['FAILED', 'NO_PERMISSION', 'UNCONFIGURED'].includes(
                  item.status,
                )
              "
              @click="retry(item.id)"
              :disabled="busy"
            >
              重新发送
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="pagination">
    <button @click="load(page - 1)" :disabled="busy || page === 0">
      上一页</button
    ><span>{{ page + 1 }}</span
    ><button @click="load(page + 1)" :disabled="busy || !hasMore">
      下一页
    </button>
  </div>
</template>
