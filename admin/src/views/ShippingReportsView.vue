<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import PaginationBar from "../components/PaginationBar.vue";
import { askConfirm } from "../confirm";
import { computed, inject, ref, onMounted, onUnmounted, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { request, currentUser, errorMessage } from "../api";
import type { Page } from "../types";
type ShippingReport = {
  id: string;
  source: "shop" | "activity";
  order_id: string;
  order_no: string;
  logistics_type: number;
  status: "PENDING" | "REPORTED" | "FAILED" | "SKIPPED";
  attempts: number;
  last_errcode: number | null;
  last_error: string;
  next_retry_at: string | null;
  reported_at: string | null;
  updated_at: string;
};
const route = inject(routeLocationKey, null);
const router = inject(routerKey, null);
const wantedStatus = route?.query.status;
const initialStatus =
  typeof wantedStatus === "string" &&
  ["PENDING", "REPORTED", "FAILED", "SKIPPED"].includes(wantedStatus)
    ? wantedStatus
    : "";
const wantedPage = Number(route?.query.page);
const initialPage =
  Number.isSafeInteger(wantedPage) && wantedPage > 0 ? wantedPage - 1 : 0;
const data = ref<ShippingReport[]>([]),
  errors = ref(""),
  notice = ref(""),
  loading = ref(false),
  status = ref(initialStatus),
  retrying = ref("");
let epoch = 0;
function clear() {
  epoch++;
  data.value = [];
  loading.value = false;
  errors.value = "";
  notice.value = "";
  retrying.value = "";
}
watch(
  currentUser,
  (u, old) => {
    if (u !== old) {
      clear();
      if (u) void load();
    }
  },
  { flush: "sync" },
);
onUnmounted(clear);
async function load(p = 0) {
  const n = ++epoch,
    actor = currentUser.value;
  if (!actor) return;
  loading.value = true;
  errors.value = "";
  try {
    const value = await request<Page<ShippingReport>>(
      `/admin/shipping-reports?page=${p}&size=20${status.value ? "&status=" + status.value : ""}`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    data.value = value.items;
    pageTotal.value = value.total;
    hasMore.value = value.hasMore;
    page.value = p;
    if (router && route) {
      void router.replace({
        query: {
          ...route.query,
          status: status.value || undefined,
          page: p ? String(p + 1) : undefined,
        },
      });
    }
  } catch (e) {
    if (n === epoch) errors.value = errorMessage(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
const page = ref(0),
  pageTotal = ref<number>(),
  hasMore = ref(false);
function filter(value: string) {
  if (retrying.value || value === status.value) return;
  status.value = value;
  page.value = 0;
  data.value = [];
  pageTotal.value = undefined;
  hasMore.value = false;
  void load();
}
async function retry(report: ShippingReport) {
  if (retrying.value || loading.value) return;
  const actor = currentUser.value,
    n = epoch;
  retrying.value = report.id;
  try {
    const confirmed = await askConfirm({
      title: "补报发货信息？",
      description: `将向微信重新上报订单 ${report.order_no} 的发货信息。`,
      confirmLabel: "确认补报",
    });
    if (!confirmed || n !== epoch || actor !== currentUser.value) return;
    errors.value = "";
    await request(
      `/admin/shipping-reports/${encodeURIComponent(report.id)}/retry`,
      {
        method: "POST",
      },
    );
    if (n === epoch && actor === currentUser.value) {
      notice.value = "已提交补报，请查看最新上报状态。";
      await load();
    }
  } catch (e) {
    if (n === epoch) errors.value = errorMessage(e);
  } finally {
    if (actor === currentUser.value && retrying.value === report.id)
      retrying.value = "";
  }
}
const sourceLabel = (source: string) => (source === "shop" ? "商城" : "活动");
const logisticsLabel = (type: number) =>
  type === 1 ? "实体物流" : type === 3 ? "虚拟发货" : `类型${type}`;
const statusLabel = (value: string) =>
  value === "PENDING"
    ? "待上报"
    : value === "REPORTED"
      ? "已上报"
      : value === "FAILED"
        ? "上报失败"
        : "无需上报";
const time = (value: string | null) =>
  value
    ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })
    : "—";
const skipReason = (value: string) =>
  value === "missing_transaction"
    ? "非微信支付订单，无交易记录"
    : value === "no_wechat_identity"
      ? "用户无微信身份"
      : value === "not_trade_managed"
        ? "小程序未开通发货信息管理"
        : value === "disabled"
          ? "发货上报未启用"
          : value || "—";
const pillClass = (value: string) =>
  value === "PENDING"
    ? "tone-warning"
    : value === "FAILED"
      ? "tone-danger"
      : value === "REPORTED"
        ? "tone-success"
        : "tone-neutral";
// 无交易记录/无微信身份的订单永远无法上报；其余“无需上报”（如功能未启用）保留人工补报入口。
const unreportable = (r: ShippingReport) =>
  r.status === "SKIPPED" &&
  ["missing_transaction", "no_wechat_identity"].includes(r.last_error);
const canReport = (r: ShippingReport) =>
  r.status !== "REPORTED" && !unreportable(r);
const showActions = computed(() => data.value.some(canReport));
onMounted(() => void load(initialPage));
import UiState from "../components/UiState.vue";
useForegroundRefresh(() => {
  if (!loading.value && !retrying.value) void load(page.value);
}, 45_000);
</script>
<template>
  <main class="workspace">
    <header class="page-heading"><h1>发货上报</h1></header>
    <nav class="report-filter task-tabs" aria-label="上报状态筛选">
      <button
        v-for="[value, label] in [
          ['', '全部'],
          ['FAILED', '上报失败'],
          ['PENDING', '待上报'],
          ['REPORTED', '已上报'],
          ['SKIPPED', '无需上报'],
        ]"
        :key="value"
        :class="status === value ? 'primary' : 'secondary'"
        :aria-pressed="status === value"
        :disabled="!!retrying"
        @click="filter(value)"
      >
        {{ label }}
      </button>
    </nav>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="errors" class="error-box" role="alert">
      {{ errors }}
      <button
        v-if="!data.length"
        type="button"
        class="text-button"
        @click="load(page)"
      >
        重试
      </button>
    </p>
    <UiState v-if="loading && !data.length" kind="loading" compact
      >正在读取上报记录…</UiState
    >
    <UiState v-else-if="!errors && !data.length" compact>
      {{ status ? `没有「${statusLabel(status)}」的记录` : "暂无上报记录" }}
    </UiState>
    <div v-if="data.length" class="table-scroll" :aria-busy="loading">
      <table class="record-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader">订单号</th>
            <th role="columnheader">来源</th>
            <th role="columnheader">类型</th>
            <th role="columnheader">状态</th>
            <th role="columnheader">尝试</th>
            <th role="columnheader">最近结果</th>
            <th role="columnheader">上报时间</th>
            <th role="columnheader" v-if="showActions" scope="col">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr role="row" v-for="r in data" :key="r.id">
            <td role="cell" data-cell="title" class="mono">{{ r.order_no }}</td>
            <td role="cell" data-label="来源">{{ sourceLabel(r.source) }}</td>
            <td role="cell" data-label="发货类型">
              {{ logisticsLabel(r.logistics_type) }}
            </td>
            <td role="cell" data-label="上报状态">
              <span class="status-pill" :class="pillClass(r.status)">{{
                statusLabel(r.status)
              }}</span>
            </td>
            <td role="cell" data-label="尝试次数">{{ r.attempts }}</td>
            <td role="cell" data-cell="wide">
              <template v-if="r.status === 'FAILED'">
                <span>错误码 {{ r.last_errcode ?? "—" }}</span>
                <details v-if="r.last_error">
                  <summary>查看原因</summary>
                  <p>{{ r.last_error }}</p>
                </details>
              </template>
              <template v-else-if="r.status === 'SKIPPED'">{{
                skipReason(r.last_error)
              }}</template>
              <template v-else>—</template>
            </td>
            <td role="cell" data-label="上报时间">{{ time(r.reported_at) }}</td>
            <td role="cell" data-cell="actions" v-if="showActions">
              <button
                v-if="canReport(r)"
                class="text-button"
                :disabled="loading || !!retrying"
                @click="retry(r)"
              >
                补报
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      v-if="pageTotal != null || hasMore || page > 0"
      :page="page"
      :page-size="20"
      :total="pageTotal"
      :has-more="hasMore"
      :busy="loading || !!retrying"
      label="发货上报分页"
      @change="load"
    />
  </main>
</template>
<style scoped>
.mono {
  font-variant-numeric: tabular-nums;
}
</style>
