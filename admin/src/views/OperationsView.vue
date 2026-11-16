<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
import type { Page } from "../types";
type Dashboard = {
  activities: {
    total: number;
    registrations: number;
    occupied?: number;
    pending_payment?: number;
    capacity: number;
    full: number;
  };
  orders: { paid_orders: number; gross_cents: number; refunded_cents: number };
  pendingShipping: number;
  shippingReportFailures?: number;
  lowStock: { id: string; name: string; stock: number }[];
  trend: {
    day: string;
    orders: number;
    gross_cents: number;
    refunded_cents: number;
  }[];
};
type Exception = {
  kind: string;
  id: string;
  entity_id: string;
  activity_id?: string | null;
  message: string;
  status: string;
  version: number;
  updated_at: string;
};
type Audit = {
  id: string;
  actor: string;
  actor_id: string;
  entity_id: string;
  action: string;
  created_at: string;
};
const checking = ref("");
const data = ref<Dashboard | null>(null),
  errors = ref(""),
  loading = ref(false),
  days = ref(7),
  tab = ref("overview"),
  exceptions = ref<Exception[]>([]),
  audits = ref<Audit[]>([]),
  page = ref(0),
  hasMore = ref(false),
  filter = ref("");
let epoch = 0;
function clear() {
  epoch++;
  data.value = null;
  exceptions.value = [];
  audits.value = [];
  loading.value = false;
  filter.value = "";
  checking.value = "";
  errors.value = "";
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
    if (tab.value === "overview") {
      const value = await request<Dashboard>(
        `/admin/dashboard?days=${days.value}`,
      );
      if (n !== epoch || actor !== currentUser.value) return;
      data.value = value;
      hasMore.value = false;
    } else if (tab.value === "exceptions") {
      const value = await request<Page<Exception>>(
        `/admin/exceptions?page=${p}&size=20`,
      );
      if (n !== epoch || actor !== currentUser.value) return;
      exceptions.value = more
        ? [...exceptions.value, ...value.items]
        : value.items;
      hasMore.value = value.hasMore;
    } else {
      const value = await request<Page<Audit>>(
        `/admin/audit?page=${p}&size=20${filter.value.trim() ? "&entityId=" + encodeURIComponent(filter.value.trim()) : ""}`,
      );
      if (n !== epoch || actor !== currentUser.value) return;
      audits.value = more ? [...audits.value, ...value.items] : value.items;
      hasMore.value = value.hasMore;
    }
    page.value = p;
  } catch (e) {
    if (n === epoch) errors.value = errorMessage(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
function select(value: string) {
  tab.value = value;
  page.value = 0;
  exceptions.value = [];
  audits.value = [];
  void load();
}
async function verify(id: string) {
  if (checking.value) return;
  const actor = currentUser.value,
    n = epoch;
  checking.value = id;
  errors.value = "";
  try {
    await request(`/admin/orders/${encodeURIComponent(id)}/verify`, {
      method: "POST",
    });
    if (n === epoch && actor === currentUser.value) await load();
  } catch (e) {
    if (n === epoch) errors.value = errorMessage(e);
  } finally {
    if (actor === currentUser.value && checking.value === id)
      checking.value = "";
  }
}
function exceptionDestination(row: Exception) {
  if (row.kind === "ACTIVITY_PAYMENT" || row.kind === "ACTIVITY_REFUND") {
    return {
      path: "/activity-orders",
      query: {
        orderId: row.entity_id,
        ...(row.activity_id ? { activityId: row.activity_id } : {}),
      },
    };
  }
  if (row.kind === "REFUND") return "/refunds";
  if (row.kind === "NOTIFICATION") return "/notifications";
  return "/shop";
}
const money = (v: number) => `¥${(Number(v || 0) / 100).toFixed(2)}`;
onMounted(() => void load());
import UiState from "../components/UiState.vue";
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <h1>运营工作台</h1>
      <button class="secondary" :disabled="loading" @click="load()">
        刷新
      </button>
    </section>
    <div class="operation-toolbar">
      <nav class="task-tabs" aria-label="工作台视图">
        <button
          v-for="[key, label] in [
            ['overview', '概览'],
            ['exceptions', '异常待办'],
            ['audit', '操作历史'],
          ]"
          :key="key"
          :class="tab === key ? 'primary' : 'secondary'"
          :aria-pressed="tab === key"
          @click="select(key)"
        >
          {{ label }}
        </button>
      </nav>
      <label v-if="tab === 'overview'" class="range-label">
        订单统计
        <select v-model.number="days" @change="load()">
          <option :value="7">近7天</option>
          <option :value="14">近14天</option>
          <option :value="30">近30天</option>
        </select>
      </label>
    </div>
    <p v-if="errors" class="error-box" role="alert">{{ errors }}</p>
    <template v-if="tab === 'overview'">
      <template v-if="data"
        ><div class="metrics">
          <article>
            <span>未来活动已确认报名</span
            ><strong
              >{{ data.activities.registrations }} /
              {{ data.activities.capacity }}</strong
            >
            <small v-if="data.activities.occupied != null">
              名额占用 {{ data.activities.occupied }} /
              {{ data.activities.capacity }} · 待支付
              {{ data.activities.pending_payment ?? 0 }}
            </small>
          </article>
          <article>
            <span>满员活动</span
            ><strong
              >{{ data.activities.full }} / {{ data.activities.total }}</strong
            >
          </article>
          <article>
            <span>付款订单</span><strong>{{ data.orders.paid_orders }}</strong>
          </article>
          <article>
            <span>实收净额</span
            ><strong>{{
              money(data.orders.gross_cents - data.orders.refunded_cents)
            }}</strong>
          </article>
          <article>
            <span>待发货</span><strong>{{ data.pendingShipping }}</strong>
          </article>
          <article>
            <span>发货上报待处理</span
            ><strong>{{ data.shippingReportFailures ?? 0 }}</strong>
          </article>
        </div>
        <p class="muted">
          订单按付款时间统计，净额扣除已确认退款；待发货不含售后处理中订单；
          发货上报待处理含失败与待上报记录，可在<a href="#/shipping-reports">发货上报</a>页补报。
        </p>
        <div class="overview-panels">
          <section>
            <h2>低库存</h2>
            <UiState v-if="!data.lowStock.length" compact
              >暂无低库存商品</UiState
            >
            <div v-else class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>商品</th>
                    <th>库存</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in data.lowStock" :key="p.id">
                    <td>
                      <RouterLink to="/shop">{{ p.name }}</RouterLink>
                    </td>
                    <td>{{ p.stock }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h2>付款趋势</h2>
            <UiState v-if="!data.trend.length" compact>暂无付款记录</UiState>
            <div v-else class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>付款日期（北京时间）</th>
                    <th>订单数</th>
                    <th>净额</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in data.trend" :key="r.day">
                    <td>{{ r.day }}</td>
                    <td>{{ r.orders }}</td>
                    <td>{{ money(r.gross_cents - r.refunded_cents) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </template>
    </template>
    <template v-else-if="tab === 'exceptions'"
      ><UiState v-if="!loading && !errors && !exceptions.length" compact
        >暂无待办</UiState
      >
      <div v-if="exceptions.length" class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>问题</th>
              <th>状态</th>
              <th>时间</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in exceptions" :key="e.kind + e.id">
              <td>{{ e.message }}</td>
              <td>{{ e.status }}</td>
              <td>
                {{
                  new Date(e.updated_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })
                }}
              </td>
              <td>
                <button
                  v-if="e.kind === 'PAYMENT'"
                  class="text-button"
                  :disabled="!!checking"
                  @click="verify(e.entity_id)"
                >
                  核对支付</button
                ><RouterLink :to="exceptionDestination(e)">去处理</RouterLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div></template
    >
    <template v-else
      ><form class="audit-filter" @submit.prevent="load()">
        <label
          >记录编号<input
            v-model="filter"
            maxlength="80"
            placeholder="活动、商品或订单编号" /></label
        ><button class="secondary">查询</button>
      </form>
      <UiState v-if="!loading && !errors && !audits.length" compact
        >暂无操作记录</UiState
      >
      <div v-if="audits.length" class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>操作人</th>
              <th>操作</th>
              <th>记录编号</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in audits" :key="a.id">
              <td>{{ a.actor }}</td>
              <td>{{ a.action }}</td>
              <td>{{ a.entity_id }}</td>
              <td>
                {{
                  new Date(a.created_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div></template
    >
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
.operation-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px 12px;
  margin-bottom: 14px;
}
.operation-toolbar .task-tabs,
.operation-toolbar .range-label {
  margin: 0;
}
.range-label {
  display: flex;
  gap: 12px;
  align-items: center;
}
.range-label select {
  padding: 8px;
  width: auto;
  margin-top: 0;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(148px, 100%), 1fr));
  gap: 12px;
}
.metrics article {
  padding: 14px;
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: var(--admin-radius);
}
.metrics strong {
  display: block;
  margin-top: 4px;
  font-size: 24px;
  font-variant-numeric: tabular-nums;
}
.metrics span {
  color: var(--admin-muted);
  font-size: 12px;
}
.overview-panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr));
  gap: 16px;
  margin-top: 18px;
}
.overview-panels table {
  min-width: 0;
}
.overview-panels .ui-state {
  margin-top: 0;
}
.audit-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: end;
  margin: 0 0 14px;
}
.audit-filter label {
  display: grid;
  gap: 4px;
  margin: 0;
}
.audit-filter input {
  margin-top: 0;
}
h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
</style>
