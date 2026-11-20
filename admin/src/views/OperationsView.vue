<script setup lang="ts">
import PaginationBar from "../components/PaginationBar.vue";
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
  ACTIVITY_CREATE: "创建活动", ACTIVITY_EDIT: "编辑活动", ACTIVITY_PUBLISH: "发布活动",
  ACTIVITY_CANCEL: "取消活动", ACTIVITY_COPY: "复制活动", TEMPLATE_SAVE: "保存模板",
  TEMPLATE_GENERATE: "生成草稿", TEMPLATE_DELETE: "删除模板", ARTICLE_CREATE: "创建文章",
  ARTICLE_UPDATE: "编辑文章", ARTICLE_CONTENT_UPDATE: "保存文章正文",
  ARTICLE_PUBLISHED: "发布文章", ARTICLE_DRAFT: "撤回文章", CONTENT_UPDATE: "保存图文",
  HOME_SHORTCUTS_UPDATE: "保存首页入口", NOTIFICATION_RETRY: "重试通知",
  USER_PROFILE_UPDATE: "更新联系资料", USER_ROLE_ADMIN: "设为管理员", USER_ROLE_USER: "设为普通用户",
  REGISTER: "活动报名", UNREGISTER: "取消报名", ACTIVITY_PRICE_SET: "设置活动报名价格",
  PARTICIPANT_IDENTITY_REVEAL: "查看参加者证件", ACTIVITY_CONTACTS_VIEW: "查看活动联系资料",
  ACTIVITY_ORDER_CREATE: "创建活动订单", ACTIVITY_ORDER_PAID: "确认活动付款",
  ACTIVITY_ORDER_CLOSE: "关闭活动订单", ACTIVITY_ZERO_CANCEL: "取消免付报名",
  ACTIVITY_REFUND_REQUEST: "申请活动退款", ACTIVITY_REFUND_VERIFY: "核对活动退款",
  ACTIVITY_REFUND_RETRY: "重试活动退款", PRODUCT_CREATE: "创建商品", PRODUCT_EDIT: "编辑商品",
  PRODUCT_CATEGORY_CREATE: "创建商品分类", PRODUCT_CATEGORY_EDIT: "编辑商品分类",
  ORDER_CREATE: "创建装备订单", ORDER_PAID: "确认装备付款", ORDER_SHIP: "确认发货",
  REFUND_REQUEST: "申请装备退款", REFUND_REJECT: "拒绝装备退款",
  MEMBERSHIP_TIER_CREATE: "创建会员等级", MEMBERSHIP_TIER_EDIT: "编辑会员等级",
  MEMBERSHIP_ASSIGN: "调整会员身份", LEGAL_DRAFT_SAVE: "保存协议草稿", LEGAL_PUBLISH: "发布协议",
  ARTICLE_PUBLISH: "发布文章", ARTICLE_UNPUBLISH: "撤回文章",
  ADMIN_ACCOUNT_CONFIGURE: "配置管理员账号", ADMIN_ACCOUNT_UPDATE: "更新管理员账号",
  IDENTITY_ENCRYPT_LEGACY_BATCH: "加密历史证件号", PROFILE_DISPLAY_UPDATE: "更新展示资料",
  PROFILE_DISPLAY_AVATAR: "更新头像", ACTIVITY_REFUND_APPROVE: "批准活动退款",
  ACTIVITY_REFUND_REJECT: "拒绝活动退款", REFUND_APPROVE: "批准装备退款", REFUND_RETRY: "重试装备退款",
  SHIPPING_DUE_24H: "发货超 24 小时", SHIPPING_DUE_40H: "发货超 40 小时",
  WX_PUSH_REMIND_API: "微信通知接入提醒", WX_PUSH_CONTROLLED: "微信交易管控",
  WX_PUSH_REMIND_SHIPPING: "微信发货提醒", WX_PUSH_SETTLEMENT: "微信结算通知",
  WAITLIST_JOIN: "加入候补", WAITLIST_CANCEL: "取消候补",
};
const refundAuditResults: Record<string, string> = {
  SUCCESS: "成功", PROCESSING: "处理中", UNKNOWN: "待核对", ABNORMAL: "异常", CLOSED: "已关闭",
};
for (const [status, label] of Object.entries(refundAuditResults)) {
  auditLabels["ACTIVITY_REFUND_" + status] = "活动退款 · " + label;
  auditLabels["REFUND_" + status] = "装备退款 · " + label;
}
const exceptionStates: Record<string, string> = {
  UNKNOWN: "待核对", PAID: "待发货", REQUESTED: "待审核",
  ABNORMAL: "异常", PROCESSING: "处理中", FAILED: "发送失败",
  UNCONFIGURED: "未配置", NO_PERMISSION: "无发送权限",
};
function applyAudit(reset = false) {
  if (reset) { filter.value = ""; actionDraft.value = ""; }
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
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
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
            <RouterLink :to="{ path: '/activities', query: { upcomingFull: '1' } }">满员活动</RouterLink
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
            <RouterLink :to="{ path: '/shop', query: { tab: 'orders', orderStatus: 'AWAITING_SHIPMENT' } }">待发货</RouterLink><strong>{{ data.pendingShipping }}</strong>
          </article>
          <article>
            <button type="button" class="text-button" @click="select('exceptions')">发货预警（24h/40h）</button
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
        <p class="muted">
          订单按付款时间统计，净额扣除已确认退款；待发货不含售后处理中订单；
          发货预警为微信支付单超 24/40 小时未发货的本地两级告警（平台 48 小时催办前置），
          超时订单同时进入下方异常列表；发货上报待处理含失败与待上报记录，可在<RouterLink to="/shipping-reports">发货上报</RouterLink>页补报。
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
                      <RouterLink :to="{ path: '/shop', query: { productId: p.id } }">{{ p.name }}</RouterLink>
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
              <td><span class="status-pill" :class="e.status === 'ABNORMAL' || e.status === 'FAILED' ? 'tone-danger' : 'tone-warning'">{{ exceptionStates[e.status] || e.status }}</span></td>
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
      ><form class="audit-filter" @submit.prevent="applyAudit()">
        <label
          >记录编号<input
            v-model="filter"
            maxlength="80"
            placeholder="活动、商品或订单编号" /></label
        ><label>操作<select v-model="actionDraft">
          <option value="">全部操作</option>
          <option v-for="(label, value) in auditLabels" :key="value" :value="value">{{ label }}</option>
        </select></label>
        <button class="secondary" :disabled="loading">查询</button>
        <button type="button" class="secondary" :disabled="loading" @click="applyAudit(true)">重置</button>
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
              <td><span v-if="Object.prototype.hasOwnProperty.call(auditLabels, a.action)">{{ auditLabels[a.action] }}</span><span v-else :title="a.action">其他历史操作</span></td>
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
    <PaginationBar v-if="tab !== 'overview' && (pageTotal != null || hasMore || page > 0)" :page="page" :page-size="20" :total="pageTotal" :has-more="hasMore" :busy="loading" label="运营记录分页" @change="load" />
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
