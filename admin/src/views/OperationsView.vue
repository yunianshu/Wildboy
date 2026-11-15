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
import AppIcon from "../components/AppIcon.vue";
</script>
<template>
  <main class="workspace">
    <section class="page-heading">
      <div>
        <h1>运营工作台</h1>
        <p class="muted">查看活动报名、订单收入与需要处理的运营事项。</p>
      </div>
      <button class="secondary" :disabled="loading" @click="load()">
        <AppIcon name="refresh" :size="16" />刷新数据
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
        统计周期
        <select v-model.number="days" @change="load()">
          <option :value="7">近 7 天</option>
          <option :value="14">近 14 天</option>
          <option :value="30">近 30 天</option>
        </select>
      </label>
    </div>
    <p v-if="errors" class="error-box" role="alert">{{ errors }}</p>
    <template v-if="tab === 'overview'">
      <template v-if="data">
        <div class="metrics">
          <article class="metric-featured">
            <div class="metric-top">
              <span>未来活动已确认报名</span>
              <i class="metric-icon"><AppIcon name="mountain" :size="19" /></i>
            </div>
            <strong
              >{{ data.activities.registrations
              }}<small> / {{ data.activities.capacity }}</small></strong
            >
            <p v-if="data.activities.occupied != null">
              名额占用 {{ data.activities.occupied }} /
              {{ data.activities.capacity }} · 待支付
              {{ data.activities.pending_payment ?? 0 }}
            </p>
          </article>
          <article>
            <div class="metric-top">
              <span>满员活动</span>
              <i class="metric-icon"><AppIcon name="check" :size="18" /></i>
            </div>
            <strong
              >{{ data.activities.full
              }}<small> / {{ data.activities.total }}</small></strong
            >
            <p>全部未来活动</p>
          </article>
          <article>
            <div class="metric-top">
              <span>付款订单</span>
              <i class="metric-icon"><AppIcon name="order" :size="18" /></i>
            </div>
            <strong>{{ data.orders.paid_orders }}</strong>
            <p>近 {{ days }} 天付款订单</p>
          </article>
          <article>
            <div class="metric-top">
              <span>实收净额</span>
              <i class="metric-icon"><AppIcon name="wallet" :size="18" /></i>
            </div>
            <strong>{{
              money(data.orders.gross_cents - data.orders.refunded_cents)
            }}</strong>
            <p>已扣除确认退款</p>
          </article>
          <article>
            <div class="metric-top">
              <span>待发货</span>
              <i class="metric-icon"><AppIcon name="bag" :size="18" /></i>
            </div>
            <strong>{{ data.pendingShipping }}</strong>
            <p>当前等待处理</p>
          </article>
        </div>
        <div class="overview-panels">
          <section class="overview-panel">
            <div class="panel-heading">
              <div>
                <h2>低库存</h2>
                <p>需要及时关注的商品库存</p>
              </div>
              <span class="panel-icon"><AppIcon name="bag" :size="18" /></span>
            </div>
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
                    <td class="table-number">{{ p.stock }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section class="overview-panel">
            <div class="panel-heading">
              <div>
                <h2>付款趋势</h2>
                <p>近 {{ days }} 天订单与实收净额</p>
              </div>
              <span class="panel-icon"
                ><AppIcon name="trend" :size="18"
              /></span>
            </div>
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
                    <td class="table-number">{{ r.orders }}</td>
                    <td class="table-number">
                      {{ money(r.gross_cents - r.refunded_cents) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
        <p class="overview-note">
          订单按付款时间统计，净额扣除已确认退款；待发货不含售后处理中订单。
        </p>
      </template>
    </template>
    <template v-else-if="tab === 'exceptions'">
      <UiState v-if="!loading && !errors && !exceptions.length" compact
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
                ><RouterLink class="text-button" :to="exceptionDestination(e)"
                  >去处理</RouterLink
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
    <template v-else>
      <form class="audit-filter" @submit.prevent="load()">
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
      </div>
    </template>
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
  gap: 12px 16px;
  margin-bottom: 22px;
}
.operation-toolbar .task-tabs,
.operation-toolbar .range-label {
  margin: 0;
}
.range-label {
  display: flex;
  gap: 10px;
  align-items: center;
  color: var(--admin-muted);
  font-size: 12px;
  font-weight: 500;
}
.range-label select {
  width: 112px;
  margin-top: 0;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 14px;
}
.metrics article {
  min-width: 0;
  padding: 20px;
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: 14px;
  box-shadow: 0 2px 8px rgba(20, 35, 28, 0.025);
}
.metric-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.metric-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 9px;
  color: var(--admin-primary);
  background: var(--admin-tint);
}
.metrics strong {
  display: block;
  margin-top: 17px;
  color: var(--admin-ink);
  font-size: 29px;
  line-height: 1.2;
  letter-spacing: -0.7px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.metrics strong small {
  color: var(--admin-muted);
  font-size: 16px;
  font-weight: 500;
  letter-spacing: 0;
}
.metrics span {
  color: var(--admin-muted);
  font-size: 12px;
}
.metrics p {
  margin: 9px 0 0;
  color: var(--admin-muted);
  font-size: 11px;
}
.metrics .metric-featured {
  border-color: #173e30;
  background: #173e30;
}
.metric-featured .metric-icon {
  color: #b8ead0;
  background: rgba(255, 255, 255, 0.1);
}
.metrics .metric-featured strong,
.metrics .metric-featured span {
  color: #fff;
}
.metrics .metric-featured strong small,
.metrics .metric-featured p {
  color: #b6cbbf;
}
.overview-panels {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 16px;
  margin-top: 22px;
}
.overview-panel {
  min-width: 0;
  overflow: hidden;
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: 14px;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px;
  border-bottom: 1px solid var(--admin-hairline);
}
.panel-heading h2 {
  margin: 0;
  font-size: 16px;
}
.panel-heading p {
  margin: 3px 0 0;
  color: var(--admin-muted);
  font-size: 11px;
}
.panel-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  color: var(--admin-primary);
  background: var(--admin-tint);
}
.overview-panels table {
  min-width: 0;
}
.overview-panels .table-scroll {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.overview-panels .ui-state {
  min-height: 116px;
  align-items: center;
  justify-content: center;
  margin: 0;
  border: 0;
}
.overview-note {
  margin: 12px 2px 0;
  color: var(--admin-muted);
  font-size: 11px;
}
.audit-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
  padding: 16px;
  margin: 0 0 16px;
  border: 1px solid var(--admin-line);
  border-radius: 14px;
  background: var(--admin-surface);
}
.audit-filter label {
  display: grid;
  flex: 1;
  min-width: min(260px, 100%);
  gap: 4px;
  margin: 0;
}
.audit-filter input {
  margin-top: 0;
}
@media (max-width: 1000px) {
  .overview-panels {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 720px) {
  .operation-toolbar {
    align-items: stretch;
  }
  .operation-toolbar .task-tabs {
    width: 100%;
  }
  .operation-toolbar .task-tabs button {
    flex: 1;
    padding-inline: 8px;
  }
  .range-label {
    justify-content: space-between;
  }
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .metrics article {
    padding: 16px;
  }
  .metrics .metric-featured {
    grid-column: 1 / -1;
  }
  .metrics strong {
    font-size: 25px;
  }
  .metric-icon {
    width: 28px;
    height: 28px;
  }
}
</style>
