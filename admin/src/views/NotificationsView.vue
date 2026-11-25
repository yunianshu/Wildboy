<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { request, errorMessage, currentUser } from "../api";
import { displayDate } from "../forms";
import { notificationTone } from "../statusTone";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import type { NotificationConfig, NotificationNotice } from "../types";
const items = ref<NotificationNotice[]>([]),
  busy = ref(false),
  error = ref(""),
  actionError = ref(""),
  notice = ref(""),
  page = ref(0),
  total = ref<number>(),
  hasMore = ref(false),
  config = ref<"checking" | "ready" | "missing" | "error">("checking");
const filter = ref("");
const pendingRetry = ref<{
  item: NotificationNotice;
  authorize: boolean;
} | null>(null);
let generation = 0,
  loadEpoch = 0,
  configEpoch = 0;
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
const quickFilters = ["", "FAILED", "NO_PERMISSION", "UNCONFIGURED"];
const otherFilters = ["PENDING", "SENDING", "SENT", "OBSOLETE", "UNKNOWN"];
const otherFilter = computed(() =>
  otherFilters.includes(filter.value) ? filter.value : "",
);
const showActions = computed(() =>
  items.value.some((item) => retryLabel(item)),
);
const configMessage = computed(() => {
  const hasUnconfigured = items.value.some(
    (item) => item.status === "UNCONFIGURED",
  );
  const hasUnsubscribed = items.value.some(
    (item) => item.status === "NO_PERMISSION",
  );
  if (config.value === "error" && (hasUnconfigured || hasUnsubscribed)) {
    return "暂无法核对微信消息配置";
  }
  if (config.value === "missing" && (hasUnconfigured || hasUnsubscribed)) {
    return hasUnconfigured
      ? "微信订阅消息尚未配置，完成部署配置后可重新排队。"
      : "微信订阅消息尚未配置。";
  }
  return "";
});
function clear() {
  generation++;
  loadEpoch++;
  items.value = [];
  pendingRetry.value = null;
  busy.value = false;
  error.value = actionError.value = notice.value = "";
  page.value = 0;
  total.value = undefined;
  hasMore.value = false;
  config.value = "checking";
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
    const params = new URLSearchParams({ page: String(next), size: "20" });
    if (filter.value) params.set("status", filter.value);
    const r = await request<{
      items: NotificationNotice[];
      total?: number;
      page: number;
      hasMore: boolean;
    }>(`/admin/notifications?${params}`, { cache: "no-store" });
    if (
      n !== loadEpoch ||
      started !== generation ||
      currentUser.value !== actor
    )
      return;
    if (
      next > 0 &&
      !r.items?.length &&
      r.total != null &&
      next * 20 >= r.total
    ) {
      await load(Math.max(0, Math.ceil(r.total / 20) - 1));
      return;
    }
    items.value = r.items || [];
    page.value = r.page;
    total.value = r.total;
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
function applyFilter(value: string) {
  if (filter.value === value || pendingRetry.value) return;
  filter.value = value;
  items.value = [];
  page.value = 0;
  total.value = undefined;
  hasMore.value = false;
  actionError.value = notice.value = "";
  void load();
}
async function checkConfig() {
  const n = ++configEpoch,
    started = generation,
    actor = currentUser.value;
  try {
    const result = await request<NotificationConfig>("/notifications/config", {
      cache: "no-store",
    });
    if (
      n !== configEpoch ||
      started !== generation ||
      currentUser.value !== actor
    )
      return;
    config.value = result?.ready === true ? "ready" : "missing";
  } catch {
    if (
      n !== configEpoch ||
      started !== generation ||
      currentUser.value !== actor
    )
      return;
    config.value = "error";
  }
}
function retryLabel(item: NotificationNotice) {
  if (item.status === "FAILED") return "重新发送";
  if (config.value !== "ready") return "";
  if (item.status === "NO_PERMISSION") return "确认授权";
  if (item.status === "UNCONFIGURED") return "重新排队";
  return "";
}
function statusDetail(item: NotificationNotice) {
  if (
    item.status === "NO_PERMISSION" &&
    (!item.lastError || item.lastError === "请在小程序订阅提醒")
  ) {
    return "等待用户在小程序订阅";
  }
  if (item.status === "UNCONFIGURED" && item.lastError === "订阅消息尚未配置")
    return "";
  if (item.status === "UNKNOWN" && !item.lastError) return "需人工核对发送结果";
  return item.lastError;
}
function openRetry(item: NotificationNotice) {
  if (busy.value || !retryLabel(item)) return;
  actionError.value = notice.value = "";
  pendingRetry.value = { item, authorize: item.status === "NO_PERMISSION" };
}
function cancelRetry() {
  if (!busy.value) pendingRetry.value = null;
}
async function confirmRetry() {
  const pending = pendingRetry.value;
  if (!pending || busy.value) return;
  if (!retryLabel(pending.item)) {
    pendingRetry.value = null;
    return;
  }
  const started = generation;
  const actor = currentUser.value;
  busy.value = true;
  try {
    await request(
      `/admin/notifications/${encodeURIComponent(pending.item.id)}/retry`,
      { method: "POST" },
    );
    if (started !== generation || currentUser.value !== actor) return;
    pendingRetry.value = null;
    notice.value = pending.authorize
      ? "原通知已重新排队，等待授权后发送。"
      : "原通知已重新排队，等待微信发送。";
  } catch (e) {
    if (started !== generation || currentUser.value !== actor) return;
    pendingRetry.value = null;
    actionError.value = errorMessage(e);
  } finally {
    if (started === generation && currentUser.value === actor)
      busy.value = false;
  }
  if (started === generation && currentUser.value === actor)
    await load(page.value);
}
useForegroundRefresh(() => {
  if (busy.value || pendingRetry.value) return;
  void load(page.value);
  void checkConfig();
}, 45_000);
</script>
<template>
  <main class="workspace">
    <header class="page-heading"><h1>活动通知</h1></header>
    <div
      class="notification-filters task-tabs"
      role="group"
      aria-label="按送达状态筛选"
    >
      <button
        v-for="value in quickFilters"
        :key="value"
        type="button"
        class="status-filter"
        :aria-pressed="filter === value"
        @click="applyFilter(value)"
      >
        {{ labels[value] || "全部" }}
      </button>
      <select
        class="other-filter"
        aria-label="其他送达状态"
        :value="otherFilter"
        @change="applyFilter(($event.target as HTMLSelectElement).value)"
      >
        <option value="" :disabled="!otherFilter">
          {{ otherFilter ? "全部状态" : "其他状态" }}
        </option>
        <option v-for="value in otherFilters" :key="value" :value="value">
          {{ labels[value] }}
        </option>
      </select>
    </div>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="actionError" class="error-box" role="alert">{{ actionError }}</p>
    <p v-if="error" class="error-box" role="alert">
      {{ error }}
      <button
        type="button"
        class="text-button"
        :disabled="busy"
        @click="load(page)"
      >
        重试
      </button>
    </p>
    <p v-if="configMessage" class="config-note" role="status">
      {{ configMessage }}
    </p>
    <UiState v-if="busy && !items.length" kind="loading" compact
      >正在读取通知…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact>
      {{ filter ? `没有「${labels[filter]}」的通知` : "暂无通知" }}
    </UiState>
    <div v-if="items.length" class="table-scroll" :aria-busy="busy">
      <table class="notification-table" role="table" aria-label="活动通知列表">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">通知</th>
            <th scope="col" role="columnheader">送达状态</th>
            <th scope="col" role="columnheader">创建时间</th>
            <th
              v-if="showActions"
              scope="col"
              role="columnheader"
              class="notification-action"
            >
              操作
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="item in items" :key="item.id" role="row">
            <td class="notification-content" role="cell">
              <strong>{{ item.title }}</strong>
              <span v-if="item.detail" class="row-detail">{{
                item.detail
              }}</span>
            </td>
            <td class="notification-status" role="cell">
              <span
                class="status-badge"
                :class="`tone-${notificationTone(item.status)}`"
              >
                {{ labels[item.status] || item.status }}
              </span>
              <span v-if="statusDetail(item)" class="row-detail">{{
                statusDetail(item)
              }}</span>
            </td>
            <td class="notification-date" role="cell">
              <time v-if="item.createdAt" :datetime="item.createdAt">{{
                displayDate(item.createdAt)
              }}</time>
              <span v-else>—</span>
              <span v-if="item.attempts > 0" class="row-detail"
                >尝试 {{ item.attempts }} 次</span
              >
            </td>
            <td v-if="showActions" class="notification-action" role="cell">
              <button
                v-if="retryLabel(item)"
                type="button"
                class="text-button"
                :disabled="busy"
                @click="openRetry(item)"
              >
                {{ retryLabel(item) }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      v-if="hasMore || page > 0"
      :page="page"
      :page-size="20"
      :total="total"
      :has-more="hasMore"
      :busy="busy"
      label="通知分页"
      @change="load"
    />
    <p v-else-if="items.length" class="notification-count">
      共 {{ total ?? items.length }} 条通知
    </p>
    <ConfirmDialog
      v-if="pendingRetry"
      :title="
        pendingRetry.authorize ? '确认用户已重新授权？' : '确认重试原通知？'
      "
      :description="
        pendingRetry.authorize
          ? `请确认用户已在小程序重新同意订阅「${pendingRetry.item.title}」，再将原通知重新排队。`
          : `「${pendingRetry.item.title}」将按原内容重新排队。发送结果可在列表查看。`
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
.other-filter {
  width: 9.25rem;
}
.config-note {
  margin: 0 0 12px;
  padding: 10px 14px;
  border-radius: var(--rf-control-radius);
  background: var(--rf-warning-bg);
  color: var(--rf-warning);
  font-size: 13px;
}
.notification-table {
  min-width: 0;
}
.notification-table th,
.status-badge,
.notification-date time {
  white-space: nowrap;
}
.notification-table td {
  vertical-align: top;
}
.notification-content {
  width: 52%;
  overflow-wrap: anywhere;
}
.notification-status {
  width: 28%;
  overflow-wrap: anywhere;
}
.row-detail {
  display: block;
  margin-top: 4px;
  color: var(--rf-muted);
  font-size: 12px;
  line-height: 1.5;
}
.notification-action {
  text-align: right;
  white-space: nowrap;
}
.notification-action .text-button {
  margin-block: -5px;
}
.notification-count {
  margin: 12px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
}
@media (max-width: 640px) {
  .notification-table {
    display: block;
  }
  .notification-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .notification-table tbody {
    display: block;
  }
  .notification-table tr {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 12px;
    padding: 14px;
  }
  .notification-table tr + tr {
    border-top: 1px solid var(--rf-line);
  }
  .notification-table td {
    width: auto;
    padding: 0;
    border: 0;
  }
  .notification-content,
  .notification-action {
    grid-column: 1 / -1;
  }
  .notification-action:empty {
    display: none;
  }
  .notification-date {
    text-align: right;
  }
}
</style>
