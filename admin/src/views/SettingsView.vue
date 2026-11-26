<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { onMounted, ref, watch } from "vue";
import { currentUser, errorMessage, request } from "../api";
import FormModal from "../components/FormModal.vue";
import PaginationBar from "../components/PaginationBar.vue";
import DateTimeField from "../components/DateTimeField.vue";
import UiState from "../components/UiState.vue";
const settingsTab = ref<"paths" | "reconcile">("paths");
const settingsTabs = [
  { key: "paths", label: "微信订单路径" },
  { key: "reconcile", label: "微信订单对账" },
] as const;
watch(settingsTab, (tab) => {
  if (tab === "paths" && !ocLoading.value) void loadOrderCenter();
});

// 微信电商订单（订单中心）：订单数据由微信支付交易自动同步，此处管理订单详情跳转路径。
type OrderCenterStatus = {
  enabled: boolean;
  orderDetailPathConfigured: boolean;
  orderDetailPath: string;
  savedMsgJumpPath?: string;
  confirmationCompleted: boolean;
  pathErrcode: number;
  confirmationErrcode: number;
};
const DEFAULT_ORDER_PATH = "pages/order-detail/index?no=${商品订单号}";
const orderCenter = ref<OrderCenterStatus | null>(null),
  ocLoading = ref(false),
  ocError = ref(""),
  pathDialog = ref(false),
  pathValue = ref(DEFAULT_ORDER_PATH),
  pathSaving = ref(false),
  pathError = ref(""),
  pathSuccess = ref("");
async function loadOrderCenter() {
  ocLoading.value = true;
  ocError.value = "";
  try {
    orderCenter.value = await request<OrderCenterStatus>(
      "/admin/wechat-order-center/status",
    );
  } catch (e) {
    ocError.value = errorMessage(e);
  } finally {
    ocLoading.value = false;
  }
}
function openPathDialog() {
  pathValue.value = orderCenter.value?.orderDetailPath || DEFAULT_ORDER_PATH;
  pathError.value = "";
  pathSuccess.value = "";
  pathDialog.value = true;
}
async function saveOrderPath() {
  const path = pathValue.value.trim();
  if (!path.includes("${商品订单号}")) {
    pathError.value =
      "路径需包含 ${商品订单号} 占位符，微信跳转时替换为实际订单号。";
    return;
  }
  pathSaving.value = true;
  pathError.value = "";
  try {
    const result = await request<{ attempted: boolean; errcode: number }>(
      "/admin/wechat-order-center/order-detail-path",
      { method: "PUT", body: JSON.stringify({ path }) },
    );
    if (!result.attempted) {
      pathError.value =
        "服务端未启用微信订单能力（检查 WILDBOY_SHIPPING_ENABLED 与小程序配置）。";
      return;
    }
    if (result.errcode !== 0) {
      pathError.value = `微信返回错误码 ${result.errcode}；未签署订单中心授权协议时会返回 10060034。`;
      return;
    }
    pathSuccess.value = "订单详情路径已配置。";
    pathDialog.value = false;
    await loadOrderCenter();
  } catch (e) {
    pathError.value = errorMessage(e);
  } finally {
    pathSaving.value = false;
  }
}
onMounted(() => void loadOrderCenter());

// 发货消息跳转路径：用户点微信发货/确认收货消息直达小程序订单页（set_msg_jump_path）。
const DEFAULT_MSG_PATH = "pages/order-detail/index";
const jumpDialog = ref(false),
  jumpValue = ref(DEFAULT_MSG_PATH),
  jumpSaving = ref(false),
  jumpError = ref(""),
  jumpNotice = ref("");
function openJumpDialog() {
  jumpValue.value = orderCenter.value?.savedMsgJumpPath || DEFAULT_MSG_PATH;
  jumpError.value = "";
  jumpDialog.value = true;
}
async function saveJumpPath() {
  const path = jumpValue.value.trim();
  if (!path || path.includes("://")) {
    jumpError.value =
      "请填写小程序页面路径（如 pages/order-detail/index），不能是完整网址。";
    return;
  }
  jumpSaving.value = true;
  jumpError.value = "";
  try {
    const result = await request<{ attempted: boolean; errcode: number }>(
      "/admin/wechat-order-center/msg-jump-path",
      { method: "PUT", body: JSON.stringify({ path }) },
    );
    if (!result.attempted) {
      jumpError.value =
        "服务端未启用微信订单能力（检查 WILDBOY_SHIPPING_ENABLED 与小程序配置）。";
      return;
    }
    if (result.errcode !== 0) {
      jumpError.value = `微信返回错误码 ${result.errcode}；需先接入确认收货组件。`;
      return;
    }
    if (orderCenter.value) orderCenter.value.savedMsgJumpPath = path;
    jumpDialog.value = false;
    jumpNotice.value = "消息跳转路径已配置。";
  } catch (e) {
    jumpError.value = errorMessage(e);
  } finally {
    jumpSaving.value = false;
  }
}

// 微信侧订单对账（get_order_list）：按支付时间/状态/openid 查询，lastIndex 翻页。
type WechatOrderRow = {
  transaction_id?: string;
  merchant_trade_no?: string;
  order_state?: number;
  pay_time?: number;
  paid_amount?: number;
  in_complaint?: boolean;
};
const ORDER_STATE_LABELS = [
  "待发货",
  "已发货",
  "确认收货",
  "交易完成",
  "已退款",
  "资金待结算",
];
const wxOrders = ref<WechatOrderRow[]>([]),
  wxQueried = ref(false),
  wxLoading = ref(false),
  wxError = ref(""),
  wxState = ref<"" | number>(""),
  wxOpenid = ref(""),
  wxBegin = ref(""),
  wxEnd = ref(""),
  wxPage = ref(0),
  wxHasMore = ref(false);
let wxCursors = [""];
let wxAppliedParams = "";
function epochOf(local: string): number | null {
  if (!local) return null;
  const ms = Date.parse(local + ":00+08:00");
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}
async function queryWechatOrders() {
  if (wxLoading.value) return;
  const begin = epochOf(wxBegin.value);
  const end = epochOf(wxEnd.value);
  if ((wxBegin.value && begin === null) || (wxEnd.value && end === null)) {
    wxError.value = "支付时间格式无效。";
    return;
  }
  if (begin !== null && end !== null && begin > end) {
    wxError.value = "开始时间不能晚于结束时间。";
    return;
  }
  const params = new URLSearchParams({ size: "20" });
  if (begin !== null) params.set("begin", String(begin));
  if (end !== null) params.set("end", String(end));
  if (wxState.value !== "") params.set("orderState", String(wxState.value));
  if (wxOpenid.value.trim()) params.set("openid", wxOpenid.value.trim());
  await loadWechatPage(0, params.toString(), true);
}
async function changeWechatPage(page: number) {
  if (wxCursors[page] === undefined) return;
  await loadWechatPage(page, wxAppliedParams, false);
}
async function loadWechatPage(
  page: number,
  appliedParams: string,
  newQuery: boolean,
) {
  if (wxLoading.value) return;
  const actor = currentUser.value;
  wxLoading.value = true;
  wxError.value = "";
  try {
    const params = new URLSearchParams(appliedParams);
    const cursor = newQuery ? "" : wxCursors[page];
    if (cursor) params.set("lastIndex", cursor);
    const result = await request<{
      attempted: boolean;
      errcode: number;
      error: string;
      lastIndex: string;
      hasMore: boolean;
      orders: WechatOrderRow[];
    }>(`/admin/wechat-order-center/wechat-orders?${params.toString()}`);
    if (actor !== currentUser.value) return;
    if (!result.attempted) {
      wxError.value =
        "服务端未启用微信订单能力（检查 WILDBOY_SHIPPING_ENABLED 与小程序配置）。";
      return;
    }
    if (result.errcode !== 0) {
      wxError.value = `微信返回错误码 ${result.errcode}。`;
      return;
    }
    if (newQuery) {
      wxCursors = [""];
      wxAppliedParams = appliedParams;
    }
    const nextCursor = result.lastIndex;
    wxCursors = wxCursors.slice(0, page + 1);
    wxHasMore.value = !!(
      result.hasMore &&
      nextCursor &&
      !wxCursors.includes(nextCursor)
    );
    if (wxHasMore.value) wxCursors.push(nextCursor);
    wxOrders.value = result.orders;
    wxPage.value = page;
    wxQueried.value = true;
  } catch (e) {
    wxError.value = errorMessage(e);
  } finally {
    wxLoading.value = false;
  }
}
function wechatOrderStateLabel(state: number | undefined): string {
  return state && state >= 1 && state <= 6
    ? ORDER_STATE_LABELS[state - 1]
    : `状态${state ?? "?"}`;
}
useForegroundRefresh(() => {
  if (
    settingsTab.value === "paths" &&
    !ocLoading.value &&
    !pathDialog.value &&
    !jumpDialog.value
  )
    void loadOrderCenter();
});
</script>
<template>
  <main class="workspace settings-workspace">
    <div class="page-heading">
      <h1>基础配置</h1>
    </div>
    <nav class="task-tabs" aria-label="配置类型">
      <button
        v-for="tab in settingsTabs"
        :key="tab.key"
        type="button"
        :class="settingsTab === tab.key ? 'primary' : 'secondary'"
        :aria-pressed="settingsTab === tab.key"
        @click="settingsTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </nav>
    <section
      v-show="settingsTab === 'paths'"
      class="order-center-card"
      aria-labelledby="order-center-heading"
    >
      <h2 id="order-center-heading">微信电商订单</h2>
      <p class="order-center-note">
        订单数据由微信支付交易自动同步；配置订单详情路径后，用户可在微信「小程序购物订单」中跳回小程序订单详情页。需先在小程序后台签署订单中心授权协议。
      </p>
      <UiState v-if="ocLoading && !orderCenter" kind="loading" compact
        >正在读取微信订单状态…</UiState
      >
      <UiState v-else-if="ocError" kind="error" compact
        >{{ ocError }}
        <button class="text-button" @click="loadOrderCenter">
          重试
        </button></UiState
      >
      <ul v-else-if="orderCenter" class="order-center-status">
        <li
          :class="orderCenter.orderDetailPathConfigured ? 'is-ok' : 'is-todo'"
        >
          订单详情路径 ·
          {{ orderCenter.orderDetailPathConfigured ? "已配置" : "未配置" }}
        </li>
        <li :class="orderCenter.confirmationCompleted ? 'is-ok' : 'is-todo'">
          交易结算管理确认 ·
          {{ orderCenter.confirmationCompleted ? "已完成" : "待确认" }}
        </li>
        <li v-if="orderCenter.orderDetailPath" class="is-path">
          {{ orderCenter.orderDetailPath }}
        </li>
      </ul>
      <p class="muted">
        消息跳转路径（后台最近保存）
        {{ orderCenter?.savedMsgJumpPath || "暂无记录" }}
      </p>
      <p v-if="jumpNotice" class="success-box" role="status">
        {{ jumpNotice }}
      </p>
      <p v-if="pathSuccess" class="success-box" role="status">
        {{ pathSuccess }}
      </p>
      <div class="footer-actions">
        <button class="primary" type="button" @click="openPathDialog">
          配置订单路径
        </button>
        <button class="secondary" type="button" @click="openJumpDialog">
          设置消息跳转路径
        </button>
      </div>
    </section>
    <FormModal v-if="pathDialog" :busy="pathSaving" @close="pathDialog = false"
      ><template #title><h2>配置订单详情路径</h2></template>
      <form
        id="order-path-form"
        class="form-section"
        @submit.prevent="saveOrderPath"
      >
        <p v-if="pathError" class="error-box" role="alert">{{ pathError }}</p>
        <label
          >跳转路径（需包含 ${商品订单号} 占位符）
          <input
            v-model="pathValue"
            name="orderPath"
            maxlength="256"
            placeholder="pages/order-detail/index?no=${商品订单号}"
            required
        /></label>
        <p class="order-center-note">
          提交前请先在小程序后台签署订单中心授权协议，否则微信返回 10060034。
        </p>
        <div class="dialog-actions">
          <button
            class="secondary"
            type="button"
            :disabled="pathSaving"
            @click="pathDialog = false"
          >
            取消
          </button>
          <button class="primary" type="submit" :disabled="pathSaving">
            {{ pathSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </form>
    </FormModal>
    <FormModal v-if="jumpDialog" :busy="jumpSaving" @close="jumpDialog = false"
      ><template #title><h2>设置消息跳转路径</h2></template>
      <form
        id="msg-jump-form"
        class="form-section"
        @submit.prevent="saveJumpPath"
      >
        <p v-if="jumpError" class="error-box" role="alert">{{ jumpError }}</p>
        <label
          >小程序页面路径
          <input
            v-model="jumpValue"
            name="msgJumpPath"
            maxlength="256"
            placeholder="pages/order-detail/index"
            required
        /></label>
        <p class="order-center-note">
          用户点击微信发货消息/确认收货消息时直达该页面；微信会自动在路径后追加
          transaction_id、merchant_trade_no
          等参数。路径为空或不存在时仍跳平台默认页。
        </p>
        <div class="dialog-actions">
          <button
            class="secondary"
            type="button"
            :disabled="jumpSaving"
            @click="jumpDialog = false"
          >
            取消
          </button>
          <button class="primary" type="submit" :disabled="jumpSaving">
            {{ jumpSaving ? "保存中…" : "保存" }}
          </button>
        </div>
      </form>
    </FormModal>
    <section
      v-show="settingsTab === 'reconcile'"
      class="order-center-card wechat-orders-card"
      aria-labelledby="wechat-orders-heading"
    >
      <h2 id="wechat-orders-heading">微信订单对账</h2>
      <p class="order-center-note">
        按微信侧发货管理维度查询支付单（get_order_list），用于核对发货/确认收货/结算状态；数据来自微信，仅作对账用途。
      </p>
      <form class="wechat-orders-filters" @submit.prevent="queryWechatOrders()">
        <DateTimeField
          id="wxBegin"
          v-model="wxBegin"
          label="支付开始（北京时间）"
        />
        <DateTimeField
          id="wxEnd"
          v-model="wxEnd"
          label="支付结束（北京时间）"
        />
        <label
          >状态
          <select v-model="wxState" name="wxState">
            <option value="">全部</option>
            <option
              v-for="(label, i) in ORDER_STATE_LABELS"
              :key="label"
              :value="i + 1"
            >
              {{ label }}
            </option>
          </select></label
        >
        <label
          >支付者 openid
          <input
            v-model="wxOpenid"
            name="wxOpenid"
            maxlength="64"
            placeholder="选填"
        /></label>
        <div class="wechat-orders-actions">
          <button class="primary" type="submit" :disabled="wxLoading">
            {{ wxLoading ? "查询中…" : "查询" }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="wxLoading"
            @click="
              wxBegin = '';
              wxEnd = '';
              wxState = '';
              wxOpenid = '';
              queryWechatOrders();
            "
          >
            重置
          </button>
        </div>
      </form>
      <p v-if="wxError" class="error-box" role="alert">{{ wxError }}</p>
      <div v-if="wxOrders.length" class="table-scroll">
        <table class="wechat-orders-table">
          <thead>
            <tr>
              <th>微信交易单号</th>
              <th>商户单号</th>
              <th>状态</th>
              <th>支付时间</th>
              <th>金额</th>
              <th>纠纷</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in wxOrders" :key="row.transaction_id || i">
              <td>{{ row.transaction_id || "—" }}</td>
              <td>
                <RouterLink
                  v-if="row.merchant_trade_no"
                  :to="{
                    path: '/shop',
                    query: { tab: 'orders', orderQuery: row.merchant_trade_no },
                  }"
                  >{{ row.merchant_trade_no }}</RouterLink
                >
                <span v-else>—</span>
              </td>
              <td>{{ wechatOrderStateLabel(row.order_state) }}</td>
              <td>
                {{
                  row.pay_time
                    ? new Date(row.pay_time * 1000).toLocaleString("zh-CN", {
                        timeZone: "Asia/Shanghai",
                      })
                    : "—"
                }}
              </td>
              <td>
                {{
                  typeof row.paid_amount === "number"
                    ? `¥${(row.paid_amount / 100).toFixed(2)}`
                    : "—"
                }}
              </td>
              <td>{{ row.in_complaint ? "纠纷中" : "—" }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiState v-else-if="wxQueried && !wxLoading" kind="empty" compact
        >没有符合条件的微信支付单</UiState
      >
      <PaginationBar
        v-if="wxQueried"
        :page="wxPage"
        :page-size="20"
        :has-more="wxHasMore"
        :busy="wxLoading"
        label="微信订单对账分页"
        @change="changeWechatPage"
      />
    </section>
  </main>
</template>
<style scoped>
.order-center-card {
  margin-top: 20px;
  padding: 20px 24px;
  border: 1px solid var(--admin-line);
  border-radius: 12px;
  background: var(--admin-surface);
}
.order-center-card h2 {
  margin: 0 0 8px;
  font-size: 16px;
}
.order-center-note {
  margin: 0 0 12px;
  color: var(--admin-muted);
  font-size: 13px;
  line-height: 1.6;
}
.wechat-orders-card {
  container: reconciliation / inline-size;
}
.wechat-orders-filters {
  --filter-control-height: 44px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
  align-items: end;
  margin-bottom: 12px;
}
.wechat-orders-filters > label,
.wechat-orders-filters > :deep(.datetime-field) {
  min-width: 0;
  margin: 0;
}
.wechat-orders-filters > label,
.wechat-orders-filters :deep(.datetime-label) {
  color: var(--admin-body);
  font-size: 13px;
}
.wechat-orders-filters :deep(.datetime-label) {
  margin: 0 0 8px;
}
.wechat-orders-filters :deep(.datetime-label .app-icon) {
  flex-shrink: 0;
}
.wechat-orders-filters :deep(.datetime-inputs) {
  grid-template-columns: minmax(0, 1.35fr) minmax(90px, 0.65fr);
}
.wechat-orders-filters :deep(.datetime-field > .field-error:empty) {
  display: none;
}
.wechat-orders-filters > label > :is(input, select) {
  display: block;
  min-width: 0;
  margin: 8px 0 0;
}
.wechat-orders-filters > label > :is(input, select),
.wechat-orders-filters :deep(.datetime-inputs input),
.wechat-orders-actions > button {
  min-height: var(--filter-control-height);
}
.wechat-orders-actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 10px;
}
.wechat-orders-actions > button {
  white-space: nowrap;
}
@container reconciliation (min-width: 960px) {
  .wechat-orders-filters {
    grid-template-columns:
      repeat(2, minmax(228px, 288px)) minmax(100px, 128px)
      minmax(132px, 202px) max-content;
  }
  .wechat-orders-actions {
    grid-column: auto;
  }
}
@container reconciliation (max-width: 525px) {
  .wechat-orders-filters {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr);
  }
  .wechat-orders-filters > :deep(.datetime-field) {
    grid-column: 1 / -1;
  }
  .wechat-orders-actions > button {
    flex: 1;
  }
}
.wechat-orders-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.wechat-orders-table th,
.wechat-orders-table td {
  text-align: left;
  padding: 6px 10px;
  border-bottom: 1px solid var(--admin-line);
  word-break: break-all;
}
.order-center-status {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.order-center-status li {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: 12px;
}
.order-center-status li.is-ok {
  background: var(--tone-success-bg);
  color: var(--tone-success);
}
.order-center-status li.is-todo {
  background: var(--tone-warning-bg);
  color: var(--tone-warning);
}
.order-center-status li.is-path {
  background: var(--tone-neutral-bg);
  color: var(--tone-neutral);
  overflow-wrap: anywhere;
}
</style>
