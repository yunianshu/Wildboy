<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import PaginationBar from "../components/PaginationBar.vue";
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
import AppIcon from "../components/AppIcon.vue";
import TerrainScene from "../components/TerrainScene.vue";
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
  shippingDueSoon?: number;
  shippingOverdue?: number;
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
  pageTotal = ref<number>(),
  hasMore = ref(false),
  filter = ref(""),
  actionDraft = ref(""),
  auditQuery = ref("");
const auditLabels: Record<string, string> = {
  ACTIVITY_CREATE: "创建活动",
  ACTIVITY_EDIT: "编辑活动",
  ACTIVITY_PUBLISH: "发布活动",
  ACTIVITY_CANCEL: "取消活动",
  ACTIVITY_COPY: "复制活动",
  TEMPLATE_SAVE: "保存模板",
  TEMPLATE_GENERATE: "生成草稿",
  TEMPLATE_DELETE: "删除模板",
  ARTICLE_CREATE: "创建文章",
  ARTICLE_UPDATE: "编辑文章",
  ARTICLE_CONTENT_UPDATE: "保存文章正文",
  ARTICLE_PUBLISHED: "发布文章",
  ARTICLE_DRAFT: "撤回文章",
  CONTENT_UPDATE: "保存图文",
  HOME_SHORTCUTS_UPDATE: "保存首页入口",
  NOTIFICATION_RETRY: "重试通知",
  USER_PROFILE_UPDATE: "更新联系资料",
  USER_ROLE_ADMIN: "设为管理员",
  USER_ROLE_USER: "设为普通用户",
  REGISTER: "活动报名",
  UNREGISTER: "取消报名",
  ACTIVITY_PRICE_SET: "设置活动报名价格",
  PARTICIPANT_IDENTITY_REVEAL: "查看参加者证件",
  ACTIVITY_CONTACTS_VIEW: "查看活动联系资料",
  ACTIVITY_ORDER_CREATE: "创建活动订单",
  ACTIVITY_ORDER_PAID: "确认活动付款",
  ACTIVITY_ORDER_CLOSE: "关闭活动订单",
  ACTIVITY_ZERO_CANCEL: "取消免付报名",
  ACTIVITY_REFUND_REQUEST: "申请活动退款",
  ACTIVITY_REFUND_VERIFY: "核对活动退款",
  ACTIVITY_REFUND_RETRY: "重试活动退款",
  PRODUCT_CREATE: "创建商品",
  PRODUCT_EDIT: "编辑商品",
  PRODUCT_CATEGORY_CREATE: "创建商品分类",
  PRODUCT_CATEGORY_EDIT: "编辑商品分类",
  ORDER_CREATE: "创建装备订单",
  ORDER_PAID: "确认装备付款",
  ORDER_SHIP: "确认发货",
  REFUND_REQUEST: "申请装备退款",
  REFUND_REJECT: "拒绝装备退款",
  MEMBERSHIP_TIER_CREATE: "创建会员等级",
  MEMBERSHIP_TIER_EDIT: "编辑会员等级",
  MEMBERSHIP_ASSIGN: "调整会员身份",
  LEGAL_DRAFT_SAVE: "保存协议草稿",
  LEGAL_PUBLISH: "发布协议",
  ARTICLE_PUBLISH: "发布文章",
  ARTICLE_UNPUBLISH: "撤回文章",
  ADMIN_ACCOUNT_CONFIGURE: "配置管理员账号",
  ADMIN_ACCOUNT_UPDATE: "更新管理员账号",
  IDENTITY_ENCRYPT_LEGACY_BATCH: "加密历史证件号",
  PROFILE_DISPLAY_UPDATE: "更新展示资料",
  PROFILE_DISPLAY_AVATAR: "更新头像",
  ACTIVITY_REFUND_APPROVE: "批准活动退款",
  ACTIVITY_REFUND_REJECT: "拒绝活动退款",
  REFUND_APPROVE: "批准装备退款",
  REFUND_RETRY: "重试装备退款",
  SHIPPING_DUE_24H: "发货超 24 小时",
  SHIPPING_DUE_40H: "发货超 40 小时",
  WX_PUSH_REMIND_API: "微信通知接入提醒",
  WX_PUSH_CONTROLLED: "微信交易管控",
  WX_PUSH_REMIND_SHIPPING: "微信发货提醒",
  WX_PUSH_SETTLEMENT: "微信结算通知",
  WAITLIST_JOIN: "加入候补",
  WAITLIST_CANCEL: "取消候补",
};
const refundAuditResults: Record<string, string> = {
  SUCCESS: "成功",
  PROCESSING: "处理中",
  UNKNOWN: "待核对",
  ABNORMAL: "异常",
  CLOSED: "已关闭",
};
for (const [status, label] of Object.entries(refundAuditResults)) {
  auditLabels["ACTIVITY_REFUND_" + status] = "活动退款 · " + label;
  auditLabels["REFUND_" + status] = "装备退款 · " + label;
}
const exceptionStates: Record<string, string> = {
  UNKNOWN: "待核对",
  PAID: "待发货",
  REQUESTED: "待审核",
  ABNORMAL: "异常",
  PROCESSING: "处理中",
  FAILED: "发送失败",
  UNCONFIGURED: "未配置",
  NO_PERMISSION: "无发送权限",
};
function applyAudit(reset = false) {
  if (reset) {
    filter.value = "";
    actionDraft.value = "";
  }
  const query = new URLSearchParams();
  if (filter.value.trim()) query.set("entityId", filter.value.trim());
  if (actionDraft.value) query.set("action", actionDraft.value);
  auditQuery.value = query.size ? "&" + query : "";
  void load();
}
let epoch = 0;
function clear() {
  epoch++;
  data.value = null;
  exceptions.value = [];
  audits.value = [];
  loading.value = false;
  filter.value = "";
  actionDraft.value = "";
  auditQuery.value = "";
  notice.value = "";
  page.value = 0;
  pageTotal.value = undefined;
  hasMore.value = false;
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
async function load(p = 0) {
  const n = ++epoch,
    actor = currentUser.value;
  if (!actor) return;
  loading.value = true;
  errors.value = "";
  try {
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
      exceptions.value = value.items;
      pageTotal.value = value.total;
      hasMore.value = value.hasMore;
    } else {
      const value = await request<Page<Audit>>(
        `/admin/audit?page=${p}&size=20${auditQuery.value}`,
      );
      if (n !== epoch || actor !== currentUser.value) return;
      audits.value = value.items;
      pageTotal.value = value.total;
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
  pageTotal.value = undefined;
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
    if (n === epoch && actor === currentUser.value) {
      notice.value = "支付状态已核对";
      await load();
    }
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
const notice = ref("");
const money = (v: number) => `¥${(Number(v || 0) / 100).toFixed(2)}`;
const trendChart = computed(() => {
  const rows = data.value?.trend ?? [];
  const maximum = Math.max(1, ...rows.map((row) => row.orders));
  const points = rows.map((row, index) => ({
    ...row,
    x: 42 + (index / Math.max(1, rows.length - 1)) * 660,
    y: 178 - (row.orders / maximum) * 126,
  }));
  return {
    points,
    line: points.map((point) => `${point.x},${point.y}`).join(" "),
    area: points.length
      ? `M ${points[0].x} 178 L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points.at(-1)!.x} 178 Z`
      : "",
  };
});
const trendLabelStep = computed(() =>
  Math.max(1, Math.ceil((data.value?.trend.length ?? 0) / 7)),
);
const shortDay = (day: string) => day.slice(5).replace("-", "/");
onMounted(() => void load());
import UiState from "../components/UiState.vue";
useForegroundRefresh(() => {
  if (!loading.value && !checking.value) void load(page.value);
});
</script>
<template>
  <main class="workspace">
    <section class="page-heading operations-heading">
      <div>
        <span class="heading-kicker">OPERATIONS OVERVIEW</span>
        <h1>运营工作台</h1>
        <p>掌握活动、订单与履约状态，快速处理今天的重要事项。</p>
      </div>
      <span class="heading-status"><i></i>运营数据中心</span>
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
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="errors" class="error-box" role="alert">{{ errors }}</p>
    <template v-if="tab === 'overview'">
      <template v-if="data">
        <section class="operations-hero">
          <div class="hero-copy">
            <span class="hero-kicker">WILDBOY · OUTDOOR OPERATIONS</span>
            <h2>今天，也让户外生意<br />稳步向前。</h2>
            <p>
              本期已确认
              <strong>{{ data.orders.paid_orders }}</strong> 笔付款订单，当前有
              <strong>{{ data.pendingShipping }}</strong> 笔订单等待发货。
            </p>
            <button type="button" @click="select('exceptions')">
              查看异常待办<AppIcon name="arrow" :size="16" />
            </button>
          </div>
          <TerrainScene compact class="hero-terrain" />
          <span class="hero-coordinate">24.4798° N · 118.0894° E</span>
        </section>
        <div class="metrics">
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
            <RouterLink
              :to="{ path: '/activities', query: { upcomingFull: '1' } }"
              >满员活动</RouterLink
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
            <RouterLink
              :to="{
                path: '/shop',
                query: { tab: 'orders', orderStatus: 'AWAITING_SHIPMENT' },
              }"
              >待发货</RouterLink
            ><strong>{{ data.pendingShipping }}</strong>
          </article>
          <article>
            <button
              type="button"
              class="text-button"
              @click="select('exceptions')"
            >
              发货预警（24h/40h）</button
            ><strong
              >{{ data.shippingDueSoon ?? 0 }} /
              {{ data.shippingOverdue ?? 0 }}</strong
            >
          </article>
          <article>
            <RouterLink to="/shipping-reports">发货上报待处理</RouterLink
            ><strong>{{ data.shippingReportFailures ?? 0 }}</strong>
          </article>
        </div>
        <details class="metric-basis">
          <summary>统计口径</summary>
          <p>
            按付款时间统计，净额扣除已确认退款；待发货排除售后处理中的订单。
          </p>
          <p>
            微信支付订单在付款 24 小时及 40
            小时仍未发货时预警。待处理上报包含失败及待上报记录。
          </p>
        </details>
        <div class="overview-panels">
          <section class="trend-panel">
            <div class="panel-heading">
              <div>
                <span class="panel-kicker">PAYMENT TREND</span>
                <h2>付款趋势</h2>
              </div>
              <span class="panel-badge">近 {{ days }} 天</span>
            </div>
            <UiState v-if="!data.trend.length" compact>暂无付款记录</UiState>
            <template v-else>
              <div class="trend-chart">
                <svg
                  viewBox="0 0 740 220"
                  role="img"
                  aria-label="付款订单趋势图"
                >
                  <defs>
                    <linearGradient
                      id="operations-trend-fill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0"
                        stop-color="#2b9a68"
                        stop-opacity=".24"
                      />
                      <stop offset="1" stop-color="#2b9a68" stop-opacity="0" />
                    </linearGradient>
                  </defs>
                  <g class="chart-grid">
                    <path d="M42 52H702M42 94H702M42 136H702M42 178H702" />
                  </g>
                  <path class="chart-area" :d="trendChart.area" />
                  <polyline class="chart-line" :points="trendChart.line" />
                  <g
                    v-for="(point, index) in trendChart.points"
                    :key="point.day"
                  >
                    <circle
                      class="chart-point"
                      :cx="point.x"
                      :cy="point.y"
                      r="4"
                    >
                      <title>
                        {{ point.day }} · {{ point.orders }} 笔 ·
                        {{ money(point.gross_cents - point.refunded_cents) }}
                      </title>
                    </circle>
                    <text
                      v-if="
                        index % trendLabelStep === 0 ||
                        index === data.trend.length - 1
                      "
                      :x="point.x"
                      y="204"
                      text-anchor="middle"
                    >
                      {{ shortDay(point.day) }}
                    </text>
                  </g>
                </svg>
              </div>
              <details class="trend-details">
                <summary>
                  查看每日明细<AppIcon name="chevron-down" :size="14" />
                </summary>
                <div class="table-scroll">
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
              </details>
            </template>
          </section>
          <section class="stock-panel">
            <div class="panel-heading">
              <div>
                <span class="panel-kicker">INVENTORY</span>
                <h2>低库存</h2>
              </div>
              <RouterLink class="panel-link" to="/shop"
                >商品管理<AppIcon name="arrow" :size="14"
              /></RouterLink>
            </div>
            <UiState v-if="!data.lowStock.length" compact
              >暂无低库存商品</UiState
            >
            <div v-else class="stock-list">
              <RouterLink
                v-for="p in data.lowStock"
                :key="p.id"
                class="stock-item"
                :to="{ path: '/shop', query: { productId: p.id } }"
              >
                <span class="stock-icon"
                  ><AppIcon name="bag" :size="18"
                /></span>
                <span class="stock-copy"
                  ><strong>{{ p.name }}</strong
                  ><small>库存紧张，请及时补货</small></span
                >
                <span class="stock-count"
                  ><strong>{{ p.stock }}</strong
                  ><small>件</small></span
                >
              </RouterLink>
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
              <td>
                <span
                  class="status-pill"
                  :class="
                    e.status === 'ABNORMAL' || e.status === 'FAILED'
                      ? 'tone-danger'
                      : 'tone-warning'
                  "
                  >{{ exceptionStates[e.status] || e.status }}</span
                >
              </td>
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
      ><form
        class="list-filters"
        role="search"
        aria-label="筛选操作历史"
        @submit.prevent="applyAudit()"
      >
        <input
          v-model="filter"
          type="search"
          aria-label="记录编号"
          maxlength="80"
          placeholder="活动、商品或订单编号"
        />
        <select v-model="actionDraft" aria-label="操作类型">
          <option value="">全部操作</option>
          <option
            v-for="(label, value) in auditLabels"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
        <button class="secondary" type="submit" :disabled="loading">
          查询
        </button>
        <button
          v-if="auditQuery || filter || actionDraft"
          type="button"
          class="text-button"
          :disabled="loading"
          @click="applyAudit(true)"
        >
          清除筛选
        </button>
      </form>
      <UiState v-if="!loading && !errors && !audits.length" compact>{{
        auditQuery ? "没有符合条件的操作记录" : "暂无操作记录"
      }}</UiState>
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
              <td>
                <span
                  v-if="
                    Object.prototype.hasOwnProperty.call(auditLabels, a.action)
                  "
                  >{{ auditLabels[a.action] }}</span
                ><span v-else :title="a.action">其他历史操作</span>
              </td>
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
    <PaginationBar
      v-if="tab !== 'overview' && (pageTotal != null || hasMore || page > 0)"
      :page="page"
      :page-size="20"
      :total="pageTotal"
      :has-more="hasMore"
      :busy="loading"
      label="运营记录分页"
      @change="load"
    />
    <UiState v-if="loading" kind="loading" compact>正在加载…</UiState>
  </main>
</template>
<style scoped>
.operations-heading {
  align-items: center;
  margin-bottom: 20px;
}
.operations-heading h1 {
  margin-top: 4px;
}
.operations-heading p {
  margin: 6px 0 0;
  font-size: 12px;
}
.heading-kicker,
.hero-kicker,
.panel-kicker {
  color: var(--rf-primary);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.7px;
}
.heading-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid var(--rf-line);
  border-radius: 999px;
  color: var(--rf-muted);
  background: #ffffff80;
  font-size: 10px;
}
.heading-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4fa776;
  box-shadow: 0 0 0 4px #4fa77612;
}
.operation-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px 16px;
  margin-bottom: 18px;
}
.operation-toolbar .task-tabs,
.operation-toolbar .range-label {
  margin: 0;
}
.operation-toolbar .task-tabs {
  gap: 3px;
  padding: 4px;
  border: 1px solid #e2e9e4;
  border-radius: 12px;
  background: #e9eeea;
}
.operation-toolbar .task-tabs button {
  --button-background: transparent;
  --button-color: var(--rf-muted);
  --button-border: transparent;
  min-height: 34px;
  padding: 6px 15px;
  border-radius: 8px;
  box-shadow: none;
  font-size: 12px;
}
.operation-toolbar .task-tabs button.primary {
  --button-background: var(--rf-surface);
  --button-hover: var(--rf-surface);
  --button-color: var(--rf-primary-text);
  box-shadow: 0 2px 7px #183c2912;
  transform: none;
}
.range-label {
  color: var(--rf-muted);
  font-size: 11px;
}
.range-label select {
  min-height: 38px;
  background-color: var(--rf-surface);
}
.operations-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
  min-height: 218px;
  margin-bottom: 18px;
  padding: 26px 32px;
  overflow: hidden;
  border: 1px solid #d5f3df14;
  border-radius: 20px;
  background:
    radial-gradient(circle at 75% 28%, #46764b55, transparent 34%),
    linear-gradient(115deg, #18392a, #0e261c 72%);
  box-shadow: 0 18px 40px #1536261a;
  isolation: isolate;
}
.operations-hero::before {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0.2;
  background-image:
    linear-gradient(#d5eddc0c 1px, transparent 1px),
    linear-gradient(90deg, #d5eddc0c 1px, transparent 1px);
  background-size: 38px 38px;
  content: "";
}
.hero-copy {
  position: relative;
  z-index: 2;
  align-self: center;
}
.hero-kicker {
  color: #b8e986;
}
.hero-copy h2 {
  margin: 10px 0 10px;
  color: #f3fff6;
  font-size: 27px;
  font-weight: 620;
  line-height: 1.35;
  letter-spacing: -0.7px;
}
.hero-copy p {
  margin: 0;
  color: #a7c0b0;
  font-size: 12px;
  line-height: 1.8;
}
.hero-copy p strong {
  color: #e3f7e9;
  font-weight: 650;
}
.hero-copy button {
  --button-background: #c5ed96;
  --button-hover: #d4f7ab;
  --button-color: #173823;
  --button-border: transparent;
  min-height: 36px;
  margin-top: 18px;
  padding: 7px 13px;
  border-radius: 9px;
  font-size: 11px;
  box-shadow: 0 8px 18px #091b1340;
}
.hero-terrain {
  position: relative;
  z-index: 1;
  align-self: center;
}
.hero-coordinate {
  position: absolute;
  right: 22px;
  bottom: 12px;
  color: #6f9080;
  font-size: 8px;
  letter-spacing: 1.3px;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.metrics article {
  position: relative;
  min-height: 114px;
  padding: 17px 18px;
  overflow: hidden;
  background: var(--admin-surface);
  border: 1px solid var(--admin-line);
  border-radius: 14px;
  box-shadow: var(--rf-shadow-sm);
  transition:
    transform 160ms ease,
    box-shadow 160ms ease,
    border-color 160ms ease;
}
.metrics article::before {
  position: absolute;
  top: 19px;
  right: 18px;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  background: #88bfa0;
  box-shadow: 0 0 0 5px #eef6f0;
  content: "";
}
.metrics article:hover {
  border-color: #cadbd0;
  box-shadow: 0 12px 26px #183c290c;
  transform: translateY(-2px);
}
.metrics strong {
  display: block;
  margin-top: 11px;
  color: var(--rf-ink);
  font-size: 26px;
  font-weight: 710;
  line-height: 1.2;
  letter-spacing: -0.8px;
  font-variant-numeric: tabular-nums;
}
.metrics span,
.metrics article > a:first-child,
.metrics article > button:first-child {
  color: var(--admin-muted);
  font-size: 11px;
}
.metrics article > a:first-child {
  display: block;
  width: fit-content;
}
.metrics article > a:first-child:hover {
  color: var(--rf-primary);
}
.metrics article > button.text-button {
  min-height: 0;
  padding: 0;
  line-height: 1.6;
}
.metrics small {
  display: block;
  margin-top: 8px;
  color: var(--rf-muted);
  font-size: 9px;
  line-height: 1.6;
}
.overview-panels {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr);
  gap: 16px;
  align-items: start;
  margin-top: 20px;
}
.overview-panels > section {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--rf-line);
  border-radius: 16px;
  background: var(--rf-surface);
  box-shadow: var(--rf-shadow-sm);
}
.overview-panels table {
  min-width: 0;
}
.overview-panels .ui-state {
  margin-top: 0;
  border: 0;
  box-shadow: none;
}
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.panel-heading h2 {
  margin: 3px 0 0;
  font-size: 16px;
  font-weight: 680;
}
.panel-kicker {
  color: #8a9c91;
  font-size: 8px;
}
.panel-badge {
  padding: 4px 8px;
  border-radius: 6px;
  color: var(--rf-primary-text);
  background: var(--rf-soft);
  font-size: 9px;
}
.panel-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--rf-muted);
  font-size: 10px;
}
.panel-link:hover {
  color: var(--rf-primary);
}
.trend-chart {
  width: 100%;
  overflow: hidden;
}
.trend-chart svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.chart-grid {
  fill: none;
  stroke: #e7ede9;
  stroke-width: 1;
  stroke-dasharray: 3 5;
}
.chart-area {
  fill: url(#operations-trend-fill);
}
.chart-line {
  fill: none;
  stroke: var(--rf-primary);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.chart-point {
  fill: var(--rf-surface);
  stroke: var(--rf-primary);
  stroke-width: 2.5;
  vector-effect: non-scaling-stroke;
}
.trend-chart text {
  fill: var(--rf-muted);
  font-size: 10px;
}
.trend-details summary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  width: fit-content;
  margin: 2px auto 0;
  padding: 6px;
  color: var(--rf-muted);
  font-size: 10px;
  cursor: pointer;
  list-style: none;
}
.trend-details summary::-webkit-details-marker {
  display: none;
}
.trend-details[open] summary .app-icon {
  transform: rotate(180deg);
}
.trend-details .table-scroll {
  margin-top: 10px;
  box-shadow: none;
}
.stock-list {
  display: grid;
  gap: 8px;
}
.stock-item {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 12px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: #f8faf8;
  transition:
    border-color 150ms ease,
    background-color 150ms ease;
}
.stock-item:hover {
  border-color: #e5dfce;
  background: #fbf8f1;
}
.stock-icon {
  display: grid;
  place-items: center;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  color: #9a6c27;
  background: #f5ecd9;
}
.stock-copy {
  flex: 1;
  min-width: 0;
}
.stock-copy strong,
.stock-copy small,
.stock-count strong,
.stock-count small {
  display: block;
}
.stock-copy strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stock-copy small,
.stock-count small {
  margin-top: 4px;
  color: var(--rf-muted);
  font-size: 9px;
}
.stock-count {
  flex-shrink: 0;
  color: #9a6c27;
  text-align: right;
}
.stock-count strong {
  font-size: 19px;
  line-height: 1;
}
@media (max-width: 1100px) {
  .metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .overview-panels {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 820px) {
  .operations-hero {
    grid-template-columns: minmax(0, 1fr) 260px;
    padding: 24px;
  }
  .hero-copy h2 {
    font-size: 24px;
  }
}
@media (max-width: 640px) {
  .operations-heading .heading-status {
    display: none;
  }
  .operations-hero {
    display: block;
    min-height: 0;
    padding: 24px;
    border-radius: 16px;
  }
  .hero-terrain,
  .hero-coordinate {
    display: none;
  }
  .hero-copy h2 {
    font-size: 24px;
  }
  .metrics {
    gap: 10px;
  }
  .metrics article {
    min-height: 106px;
    padding: 15px;
  }
  .metrics strong {
    font-size: 22px;
  }
  .metrics article::before {
    top: 16px;
    right: 15px;
  }
  .overview-panels > section {
    padding: 16px;
  }
  .operation-toolbar .range-label {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
