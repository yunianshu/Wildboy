<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { request, errorMessage, currentUser } from "../api";
import { notificationTone } from "../statusTone";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import UiState from "../components/UiState.vue";
import type { NotificationConfig, NotificationNotice } from "../types";
const items = ref<NotificationNotice[]>([]),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  page = ref(0),
  hasMore = ref(false),
  configReady = ref(false),
  configError = ref(false);
const pendingRetry = ref<{
  item: NotificationNotice;
  authorize: boolean;
} | null>(null);
let generation = 0,
  loadEpoch = 0;
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
function clear() {
  generation++;
  loadEpoch++;
  items.value = [];
  pendingRetry.value = null;
  busy.value = false;
  error.value = notice.value = "";
  page.value = 0;
  hasMore.value = false;
  configReady.value = configError.value = false;
}
watch(currentUser, clear, { flush: "sync" });
onUnmounted(clear);
onMounted(() => {
  void load();
  void checkConfig();
});
async function load(next = 0) {
  const n = ++loadEpoch,
    started = generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const r = await request<{
      items: NotificationNotice[];
      page: number;
      hasMore: boolean;
    }>(`/admin/notifications?page=${next}&size=20`, { cache: "no-store" });
    if (
      n !== loadEpoch ||
      started !== generation ||
      currentUser.value !== actor
    )
      return;
    items.value = r.items || [];
    page.value = r.page;
    hasMore.value = r.hasMore;
  } catch (e) {
    if (
      n === loadEpoch &&
      started === generation &&
      currentUser.value === actor
    )
      error.value = errorMessage(e);
  } finally {
    if (
      n === loadEpoch &&
      started === generation &&
      currentUser.value === actor
    )
      busy.value = false;
  }
}
async function checkConfig() {
  const started = generation,
    actor = currentUser.value;
  try {
    const result = await request<NotificationConfig>("/notifications/config", {
      cache: "no-store",
    });
    if (started !== generation || currentUser.value !== actor) return;
    configReady.value = result?.ready === true;
    configError.value = false;
  } catch {
    if (started !== generation || currentUser.value !== actor) return;
    configReady.value = false;
    configError.value = true;
  }
}
function isBlocked(item: NotificationNotice) {
  return (
    (item.status === "NO_PERMISSION" || item.status === "UNCONFIGURED") &&
    !configReady.value
  );
}
function blockReason(item: NotificationNotice) {
  if (configError.value) return "暂无法核对微信消息配置";
  return item.status === "NO_PERMISSION"
    ? "请用户先同意订阅"
    : "需先完成部署配置";
}
function openRetry(item: NotificationNotice, authorize: boolean) {
  if (busy.value || isBlocked(item)) return;
  error.value = notice.value = "";
  pendingRetry.value = { item, authorize };
}
function cancelRetry() {
  if (!busy.value) pendingRetry.value = null;
}
async function confirmRetry() {
  const pending = pendingRetry.value;
  if (!pending || busy.value) return;
  const actor = currentUser.value;
  busy.value = true;
  try {
    await request(
      `/admin/notifications/${encodeURIComponent(pending.item.id)}/retry`,
      { method: "POST" },
    );
    if (currentUser.value !== actor) return;
    pendingRetry.value = null;
    notice.value = pending.authorize
      ? "原通知已重新排队，等待授权后发送。"
      : "原通知已重新排队，等待微信发送。";
  } catch (e) {
    if (currentUser.value !== actor) return;
    pendingRetry.value = null;
    error.value = errorMessage(e);
  } finally {
    if (currentUser.value === actor) busy.value = false;
  }
  if (pendingRetry.value === null && currentUser.value === actor)
    await load(page.value);
}
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <div>
        <h1>活动通知</h1>
        <p class="muted">重试仅重新排队原通知，结果以列表状态为准。</p>
      </div>
      <button class="secondary" :disabled="busy" @click="load(page)">
        刷新
      </button>
    </section>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <p v-if="configError && items.length" class="privacy-note">
      暂无法核对微信消息配置，订阅与配置类通知暂时不可重试。
      <button class="text-button" :disabled="busy" @click="checkConfig">
        重新核对配置
      </button>
    </p>
    <UiState v-if="busy && !items.length" kind="loading" compact
      >正在读取通知…</UiState
    >
    <UiState v-else-if="!items.length && !error && !busy" kind="empty" compact
      >暂无通知</UiState
    >
    <div v-if="items.length" class="table-scroll" :aria-busy="busy">
      <table>
        <thead>
          <tr>
            <th>活动</th>
            <th>内容</th>
            <th>状态</th>
            <th>发送次数</th>
            <th>异常</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in items" :key="item.id">
            <td>
              <strong>{{ item.title }}</strong>
            </td>
            <td>{{ item.detail || "—" }}</td>
            <td>
              <span
                class="status-badge"
                :class="`tone-${notificationTone(item.status)}`"
                >{{ labels[item.status] || item.status }}</span
              >
            </td>
            <td>{{ item.attempts }}</td>
            <td>{{ item.lastError || "—" }}</td>
            <td>
              <template v-if="item.status === 'FAILED'">
                <button
                  class="text-button"
                  :disabled="busy"
                  @click="openRetry(item, false)"
                >
                  重新发送
                </button>
              </template>
              <template v-else-if="item.status === 'NO_PERMISSION'">
                <button
                  v-if="configReady"
                  class="text-button"
                  :disabled="busy"
                  @click="openRetry(item, true)"
                >
                  确认授权</button
                ><template v-else>
                  <button disabled>暂不可重试</button>
                  <span class="muted retry-block-reason">{{
                    blockReason(item)
                  }}</span></template
                >
              </template>
              <template v-else-if="item.status === 'UNCONFIGURED'">
                <button
                  v-if="configReady"
                  class="text-button"
                  :disabled="busy"
                  @click="openRetry(item, false)"
                >
                  重新排队</button
                ><template v-else>
                  <button disabled>暂不可重试</button>
                  <span class="muted retry-block-reason">{{
                    blockReason(item)
                  }}</span></template
                >
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav class="pagination" aria-label="通知分页">
      <button :disabled="busy || page === 0" @click="load(page - 1)">
        上一页</button
      ><span>第 {{ page + 1 }} 页</span
      ><button :disabled="busy || !hasMore" @click="load(page + 1)">
        下一页
      </button>
    </nav>
    <ConfirmDialog
      v-if="pendingRetry"
      :title="
        pendingRetry.authorize ? '确认用户已重新授权？' : '确认重试原通知？'
      "
      :description="
        pendingRetry.authorize
          ? `请先与用户核对：用户已在小程序重新同意订阅「${pendingRetry.item.title}」对应的消息，再重试原通知；重试不会立即送达。`
          : `将按原内容重新提交「${pendingRetry.item.title}」的微信通知发送，结果以列表状态为准。`
      "
      :confirm-label="
        pendingRetry.authorize ? '已确认，重试原通知' : '确认重试'
      "
      :busy="busy"
      @cancel="cancelRetry"
      @confirm="confirmRetry"
    />
  </main>
</template>
<style scoped>
th,
.status-badge {
  white-space: nowrap;
}
</style>
