<script setup lang="ts">
import { askConfirm } from "../confirm";
import { ref, onMounted, onUnmounted, watch } from "vue";
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
const data = ref<ShippingReport[]>([]),
  errors = ref(""),
  loading = ref(false),
  status = ref(""),
  retrying = ref("");
let epoch = 0;
function clear() {
  epoch++;
  data.value = [];
  loading.value = false;
  errors.value = "";
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
async function load(more = false) {
  const n = ++epoch,
    actor = currentUser.value;
  if (!actor) return;
  loading.value = true;
  errors.value = "";
  try {
    const p = more ? page.value + 1 : 0;
    const value = await request<Page<ShippingReport>>(
      `/admin/shipping-reports?page=${p}&size=20${status.value ? "&status=" + status.value : ""}`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    data.value = more ? [...data.value, ...value.items] : value.items;
    hasMore.value = value.hasMore;
    page.value = p;
  } catch (e) {
    if (n === epoch) errors.value = errorMessage(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
const page = ref(0),
  hasMore = ref(false);
function filter(value: string) {
  status.value = value;
  page.value = 0;
  data.value = [];
  void load();
}
async function retry(id: string) {
  if (retrying.value) return;
  if (!(await askConfirm("确认向微信重新上报该订单的发货信息？"))) return;
  const actor = currentUser.value,
    n = epoch;
  retrying.value = id;
  errors.value = "";
  try {
    await request(`/admin/shipping-reports/${encodeURIComponent(id)}/retry`, {
      method: "POST",
    });
    if (n === epoch && actor === currentUser.value) await load();
  } catch (e) {
    if (n === epoch) errors.value = errorMessage(e);
  } finally {
    if (actor === currentUser.value && retrying.value === id)
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
    ? "pill-warning"
    : value === "FAILED"
      ? "pill-danger"
      : value === "REPORTED"
        ? "pill-success"
        : "pill-neutral";
// 无交易记录/无微信身份的订单永远无法上报；其余“无需上报”（如功能未启用）保留人工补报入口。
const unreportable = (r: ShippingReport) =>
  r.status === "SKIPPED" &&
  ["missing_transaction", "no_wechat_identity"].includes(r.last_error);
onMounted(() => void load());
import UiState from "../components/UiState.vue";
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <h1>发货上报</h1>
      <button class="secondary" :disabled="loading" @click="load()">
        刷新
      </button>
    </section>
    <p class="muted">上报失败的订单可在此补报。</p>
    <nav class="report-filter" aria-label="上报状态筛选">
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
        @click="filter(value)"
      >
        {{ label }}
      </button>
    </nav>
    <p v-if="errors" class="error-box" role="alert">{{ errors }}</p>
    <UiState v-if="!loading && !errors && !data.length" compact
      >暂无上报记录</UiState
    >
    <div v-if="data.length" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>来源</th>
            <th>订单号</th>
            <th>类型</th>
            <th>状态</th>
            <th>尝试</th>
            <th>最近结果</th>
            <th>上报时间</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in data" :key="r.id">
            <td>{{ sourceLabel(r.source) }}</td>
            <td class="mono">{{ r.order_no }}</td>
            <td>{{ logisticsLabel(r.logistics_type) }}</td>
            <td>
              <span class="pill" :class="pillClass(r.status)">{{
                statusLabel(r.status)
              }}</span>
            </td>
            <td>{{ r.attempts }}</td>
            <td>
              <template v-if="r.status === 'FAILED'"
                >errcode {{ r.last_errcode ?? "—" }}</template
              >
              <template v-else-if="r.status === 'SKIPPED'">{{
                skipReason(r.last_error)
              }}</template>
              <template v-else>—</template>
            </td>
            <td>{{ time(r.reported_at) }}</td>
            <td>
              <button
                v-if="r.status !== 'REPORTED'"
                class="text-button"
                :disabled="!!retrying || unreportable(r)"
                @click="retry(r.id)"
              >
                补报
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      v-if="hasMore"
      class="secondary"
      :disabled="loading"
      @click="load(true)"
    >
      加载更多
    </button>
    <UiState v-if="loading" kind="loading" compact>正在加载…</UiState>
  </main>
</template>
<style scoped>
.report-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.mono {
  font-variant-numeric: tabular-nums;
}
.pill {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  white-space: nowrap;
}
.pill-success {
  background: #ffffff;
  color: var(--rf-primary-text);
}
.pill-warning {
  background: var(--rf-warning-bg);
  color: var(--rf-danger);
}
.pill-danger {
  background: #ffffff;
  color: var(--rf-danger);
}
.pill-neutral {
  background: #ffffff;
  color: var(--rf-primary-text);
}
</style>
