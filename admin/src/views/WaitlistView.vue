<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { request, errorMessage, currentUser } from "../api";
const items = ref<any[]>([]),
  busy = ref(false),
  error = ref(""),
  page = ref(0),
  hasMore = ref(false);
let generation = 0;
async function load(next = 0) {
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const r = await request<any>(`/admin/waitlist?page=${next}&size=20`);
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
onMounted(() => load());
onUnmounted(() => {
  generation++;
  items.value = [];
});
</script>
<template>
  <section class="page-heading">
    <h1>活动候补</h1>
    <button class="secondary" @click="load(page)" :disabled="busy">刷新</button>
  </section>
  <p v-if="error" class="error-box">{{ error }}</p>
  <div v-if="!items.length && !busy" class="empty-state">暂无候补</div>
  <div class="table-scroll">
    <table>
      <thead>
        <tr>
          <th>活动</th>
          <th>同行人数</th>
          <th>状态</th>
          <th>确认截止</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>{{ item.activityTitle }}</td>
          <td>{{ item.partySize }}</td>
          <td>{{ item.status === "OFFERED" ? "待确认" : "排队中" }}</td>
          <td>
            {{
              item.offerExpiresAt
                ? new Date(item.offerExpiresAt).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })
                : "—"
            }}
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
