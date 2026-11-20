<script setup lang="ts">
import { askConfirm } from "../confirm";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from "vue-router";
import { displayDate } from "../forms";
import { ApiError, currentUser, errorMessage, request } from "../api";
import {
  activityOrderLabels,
  type ActivityOrderStatus,
  type Page,
} from "../types";
import { activityOrderTone } from "../statusTone";
import FormModal from "../components/FormModal.vue";
import AppIcon from "../components/AppIcon.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import { useRosterExport } from "../rosterExport";
const route = useRoute();
const activityId = computed(() =>
  typeof route.query.activityId === "string" ? route.query.activityId : "",
);
const orderId = computed(() =>
  typeof route.query.orderId === "string" ? route.query.orderId : "",
);
const searchDraft = ref("");
const statusDraft = ref("");
const refundDraft = ref("");
const appliedFilters = ref({ query: "", status: "", refundStatus: "" });
const notice = ref("");
const total = ref(0);
const { exporting, exportError, downloadRoster, resetExport } = useRosterExport();
function applyFilters() {
  appliedFilters.value = { query: searchDraft.value.trim(), status: statusDraft.value, refundStatus: refundDraft.value };
  void load(0);
}
function listPath(next: number) {
  const params = new URLSearchParams({ page: String(next), size: "20" });
  for (const [key, value] of Object.entries(appliedFilters.value)) if (value) params.set(key, value);
  if (activityId.value) params.set("activityId", activityId.value);
  if (orderId.value) params.set("orderId", orderId.value);
  return `/admin/activity-orders?${params}`;
}
type Order = {
  id: string;
  orderNo: string;
  activityId: string;
  activityTitle: string;
  userId: string;
  status: ActivityOrderStatus;
  partySize: number;
  originalTotalCents: number;
  totalCents: number;
  currency: string;
  paymentTransactionId: string | null;
  version: number;
  createdAt?: string;
  refundStatus?: string;
};
type Participant = {
  id: string;
  participantName: string;
  phone: string;
  idNumber: string | null;
};
const participants = ref<Participant[]>([]),
  revealedParticipants = ref<Participant[]>([]),
  peopleLoaded = ref(false),
  showPeople = ref(false);
type Refund = {
  id?: string;
  out_refund_no?: string;
  amount_cents?: number;
  status?: string;
  reason?: string;
  decision_note?: string;
  version?: number;
};
const items = ref<Order[]>([]),
  page = ref(0),
  more = ref(false),
  busy = ref(false),
  error = ref(""),
  selected = ref<Order | null>(null),
  refund = ref<Refund | null>(null),
  note = ref(""),
  reason = ref(""),
  requestConfirmed = ref(false),
  revealed = ref(false),
  conflict = ref(false);
const refundLabels: Record<string, string> = {
  REQUESTED: "待审核",
  REJECTED: "已拒绝",
  PROCESSING: "退款中",
  UNKNOWN: "结果待核对",
  SUCCESS: "已退款",
  ABNORMAL: "退款异常",
  CLOSED: "退款已关闭",
};
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
function status(o: Order) {
  if (o.totalCents === 0 && o.status === "CONFIRMED_FREE")
    return "免支付已确认";
  if (o.totalCents === 0 && o.status === "CLOSED") return "免费报名已取消";
  return activityOrderLabels[o.status] || o.status;
}
function statusTone(o: Order) {
  return `tone-${activityOrderTone(o.status)}`;
}
function maskPhone(phone: string) {
  if (/^\d{3}[*•]{4}\d{4}$/.test(phone)) return phone;
  const digits = phone.replace(/\D/g, "");
  return digits.length > 7
    ? `${digits.slice(0, 3)}••••${digits.slice(-4)}`
    : "••••";
}
function readRefund(orderId: string) {
  return request<Refund>(
    `/admin/activity-orders/${encodeURIComponent(orderId)}/refund`,
    { cache: "no-store" },
  );
}
let epoch = 0;
let peopleRequest = 0;
function clearDetail() {
  peopleRequest++;
  participants.value = [];
  revealedParticipants.value = [];
  peopleLoaded.value = false;
  showPeople.value = false;
  selected.value = null;
  refund.value = null;
  note.value = "";
  reason.value = "";
  requestConfirmed.value = false;
  revealed.value = false;
  conflict.value = false;
}
function reset() {
  epoch++;
  resetExport();
  clearDetail();
  items.value = [];
  busy.value = false;
  more.value = false;
  page.value = 0;
  error.value = "";
}
watch(
  currentUser,
  (u, old) => {
    if (u !== old) {
      reset();
      if (u) void load();
    }
  },
  { flush: "sync" },
);
onUnmounted(reset);
function fail(e: unknown) {
  if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
    reset();
    error.value = e.message;
    return;
  }
  if (e instanceof ApiError && e.status === 409) {
    conflict.value = true;
    error.value =
      e.code === "STALE_REFUND"
        ? "原退款申请已被替换，请重新加载并核对当前申请；不会自动提交。"
        : e.code === "STALE_VERSION" || e.code === "REQUEST_FAILED"
          ? "订单或退款版本已变化，请重新加载后核对；不会自动覆盖。"
          : e.message;
  } else error.value = errorMessage(e);
}
async function load(next = page.value) {
  if (busy.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const r = await request<Page<Order>>(listPath(next));
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = r.items;
    total.value = r.total;
    more.value = r.hasMore;
    page.value = next;
  } catch (e) {
    if (n === epoch) fail(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
async function open(o: Order) {
  if (busy.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const [orders, currentRefund] = await Promise.all([
      request<Page<Order>>(listPath(page.value), { cache: "no-store" }),
      readRefund(o.id),
    ]);
    if (n !== epoch || actor !== currentUser.value) return;
    items.value = orders.items;
    more.value = orders.hasMore;
    const latest = orders.items.find((item) => item.id === o.id);
    clearDetail();
    if (latest) {
      selected.value = latest;
      refund.value = currentRefund;
      void loadParticipants(true);
    } else {
      error.value = "该订单已移出当前页，列表已刷新，请重新查找。";
    }
  } catch (e) {
    if (n === epoch) fail(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function hasDraft() {
  return Boolean(note.value || reason.value || requestConfirmed.value);
}
async function canLeave() {
  return (
    !busy.value &&
    (!hasDraft() || (await askConfirm("退款填写内容未保存，确定放弃吗？")))
  );
}
async function close() {
  if (!(await canLeave())) return;
  clearDetail();
  error.value = "";
}
onBeforeRouteLeave(async (to) => to.path === "/login" || (await canLeave()));
onBeforeRouteUpdate(
  async (to, from) =>
    (to.query.activityId === from.query.activityId &&
      to.query.orderId === from.query.orderId) ||
    (await canLeave()),
);
async function action(
  kind:
    | "verify"
    | "cancel"
    | "approve"
    | "reject"
    | "refundVerify"
    | "retry"
    | "request",
) {
  const o = selected.value;
  if (!o || busy.value || conflict.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value,
    snapshot = refund.value;
  const refundStatus = snapshot?.status ?? "";
  if (kind === "verify" && o.status !== "PENDING_PAYMENT") return;
  if (
    kind === "cancel" &&
    !["PENDING_PAYMENT", "CONFIRMED_FREE"].includes(o.status)
  )
    return;
  if ((kind === "approve" || kind === "reject") && refundStatus !== "REQUESTED")
    return;
  if (kind === "retry" && !["PROCESSING", "UNKNOWN"].includes(refundStatus))
    return;
  if (
    kind === "refundVerify" &&
    !["PROCESSING", "UNKNOWN", "ABNORMAL"].includes(refundStatus)
  )
    return;
  if (kind === "request") {
    if (
      o.status !== "PAID" ||
      (refund.value?.id &&
        !["REJECTED", "CLOSED"].includes(refund.value.status || ""))
    )
      return;
    if (!reason.value.trim() || reason.value.trim().length > 200) {
      error.value = "请填写退款原因（1–200字）";
      return;
    }
    if (!requestConfirmed.value) {
      error.value = "请先确认本订单的全额退款申请";
      return;
    }
  }
  if (note.value.trim().length > 200) {
    error.value = "审核备注最多200字";
    return;
  }
  if (kind === "reject" && !note.value.trim()) {
    error.value = "请填写拒绝原因";
    return;
  }
  const refundDecision =
    kind === "approve" ||
    kind === "reject" ||
    kind === "refundVerify" ||
    kind === "retry";
  if (refundDecision && (!snapshot?.id || snapshot.version == null)) {
    conflict.value = true;
    error.value = "退款申请资料不完整，请重新加载后核对。";
    return;
  }
  if (
    kind === "approve" &&
    !(await askConfirm(
      `确认批准订单 ${o.orderNo} 全额退款 ${money(snapshot?.amount_cents ?? o.totalCents)}？以微信实际回执为准。`,
    ))
  )
    return;
  if (
    kind === "cancel" &&
    !(await askConfirm(
      o.status === "CONFIRMED_FREE"
        ? "确认取消这笔免费报名并释放名额？"
        : "确认关闭这笔未支付订单？服务端会先核对微信状态，结果不确定时继续保留名额。",
    ))
  )
    return;
  if (
    kind === "retry" &&
    !(await askConfirm(
      "使用原退款单号重试全额退款？请先核对结果，仍以微信回执为准。",
    ))
  )
    return;
  if (
    n !== epoch ||
    actor !== currentUser.value ||
    selected.value?.id !== o.id ||
    refund.value !== snapshot
  )
    return;
  busy.value = true;
  error.value = "";
  const suffix =
    kind === "request"
      ? "refund"
      : kind === "refundVerify"
        ? "refund/verify"
        : kind === "approve" || kind === "reject" || kind === "retry"
          ? `refund/${kind}`
          : kind;
  let refreshing = false;
  try {
    const result = await request<Order | Refund>(
      `/admin/activity-orders/${encodeURIComponent(o.id)}/${suffix}`,
      {
        method: "POST",
        ...(kind === "request"
          ? { body: JSON.stringify({ reason: reason.value.trim() }) }
          : {}),
        ...(refundDecision
          ? {
              body: JSON.stringify({
                refundId: snapshot?.id,
                version: snapshot?.version,
                ...(note.value.trim() ? { note: note.value.trim() } : {}),
              }),
            }
          : {}),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    if (kind === "verify" || kind === "cancel") {
      selected.value = result as Order;
      notice.value = kind === "verify" ? "支付状态已核对" : "订单已更新";
      items.value = items.value.map((item) =>
        item.id === o.id ? (result as Order) : item,
      );
    } else {
      refund.value = result as Refund;
      notice.value = "退款状态已更新";
      note.value = "";
      reason.value = "";
      requestConfirmed.value = false;
      refreshing = true;
      const [r, latestRefund] = await Promise.all([
        request<Page<Order>>(listPath(page.value), { cache: "no-store" }),
        readRefund(o.id),
      ]);
      if (n !== epoch || actor !== currentUser.value) return;
      items.value = r.items;
      more.value = r.hasMore;
      const latest = r.items.find((item) => item.id === o.id);
      if (latest) {
        selected.value = latest;
        refund.value = latestRefund;
      } else clearDetail();
    }
  } catch (e) {
    if (n !== epoch) return;
    fail(e);
    if (n !== epoch) return;
    if (
      refreshing ||
      (kind !== "verify" &&
        kind !== "refundVerify" &&
        (!(e instanceof ApiError) || e.status === 0 || e.status >= 500))
    ) {
      conflict.value = true;
      error.value = "请重新加载订单和退款资料，核对服务端结果后再操作。";
    }
  } finally {
    if (n === epoch) busy.value = false;
  }
}
async function loadParticipants(background = false) {
  if ((!background && busy.value) || !selected.value || !currentUser.value) return;
  const order = selected.value;
  const attempt = ++peopleRequest;
  const n = epoch,
    actor = currentUser.value;
  if (!background) busy.value = true;
  if (!background) error.value = "";
  try {
    const rows = await request<Participant[]>(
      `/admin/activity-orders/${encodeURIComponent(selected.value.id)}/participants`,
    );
    if (attempt !== peopleRequest || n !== epoch || actor !== currentUser.value || selected.value?.id !== order.id) return;
    if (!Array.isArray(rows) || rows.some((row) => typeof row.participantName !== "string" || typeof row.phone !== "string"))
      throw new Error("参加者资料暂不可用，请重试");
    participants.value = rows;
    peopleLoaded.value = true;
  } catch (e) {
    if (!background && n === epoch) fail(e);
  } finally {
    if (!background && n === epoch) busy.value = false;
  }
}
async function reload() {
  const o = selected.value;
  if (
    !o ||
    busy.value ||
    (hasDraft() && !(await askConfirm("重新加载会放弃退款填写内容，继续吗？")))
  )
    return;
  await open(o);
}
async function togglePrivate(kind: "user" | "participants") {
  const visible = kind === "user" ? revealed : showPeople;
  if (visible.value) {
    visible.value = false;
    if (kind === "participants") revealedParticipants.value = [];
    return;
  }
  const o = selected.value;
  const actor = currentUser.value;
  const n = epoch;
  if (!o || actor?.role !== "ADMIN" || busy.value) return;
  const subject = kind === "user" ? "用户标识" : "参加者姓名和电话";
  if (
    !(await askConfirm(`确认仅为活动履约查看订单 ${o.orderNo} 的${subject}？`))
  )
    return;
  if (n !== epoch || actor !== currentUser.value || selected.value?.id !== o.id)
    return;
  if (kind === "user") {
    revealed.value = true;
    return;
  }
  busy.value = true;
  error.value = "";
  try {
    const rows = await request<Participant[]>(
      `/admin/activity-orders/${encodeURIComponent(o.id)}/participants/reveal`,
      { method: "POST" },
    );
    if (
      n !== epoch ||
      actor !== currentUser.value ||
      selected.value?.id !== o.id
    )
      return;
    revealedParticipants.value = rows;
    showPeople.value = true;
  } catch (e) {
    if (n === epoch) fail(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
watch([activityId, orderId], () => {
  reset();
  void load(0);
});
onMounted(() => void load(0));
</script>
<template>
  <main class="workspace activity-orders-workspace">
    <div class="page-heading">
      <h1>
        {{
          orderId ? "活动订单核对" : activityId ? "收费活动名单" : "活动订单"
        }}
      </h1>
      <div v-if="activityId && !orderId && currentUser?.role === 'ADMIN'" class="action-row">
        <button
          class="primary"
          type="button"
          :disabled="busy || exporting"
          @click="downloadRoster(activityId, items[0]?.activityTitle ?? '')"
        >
          {{ exporting ? "正在导出…" : "导出已确认名单" }}
        </button>
      </div>
      <button v-else class="secondary" :disabled="busy" @click="load()">
        <AppIcon name="refresh" :size="16" />
        刷新订单
      </button>
    </div>
    <p v-if="exportError" role="alert" class="error-box">{{ exportError }}</p>
    <div v-if="activityId || orderId" class="activity-order-scope">
      <strong>{{
        items[0]?.activityTitle ||
        (activityId ? `活动 ${activityId}` : `订单 ${orderId}`)
      }}</strong>
      <span v-if="activityId && !orderId"
        >待支付仅保留名额。已支付或免支付确认后计入报名。</span
      >
      <RouterLink class="button text-button" to="/activity-orders"
        ><AppIcon name="back" :size="16" />查看全部活动订单</RouterLink
      >
    </div>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="error && !selected" role="alert" class="error-box">{{ error }}</p>
    <form v-if="!orderId" class="activity-order-filters" @submit.prevent="applyFilters">
      <input v-model="searchDraft" maxlength="100" aria-label="搜索活动订单" placeholder="订单号或活动名称" />
      <select v-model="statusDraft" aria-label="订单状态">
        <option value="">全部订单状态</option>
        <option v-for="(label, value) in activityOrderLabels" :key="value" :value="value">{{ label }}</option>
      </select>
      <select v-model="refundDraft" aria-label="退款状态">
        <option value="">全部退款状态</option>
        <option v-for="(label, value) in refundLabels" :key="value" :value="value">{{ label }}</option>
      </select>
      <button class="secondary" :disabled="busy">查询</button>
    </form>
    <UiState v-if="busy && !items.length" kind="loading" compact
      >正在读取活动订单…</UiState
    >
    <UiState v-else-if="!busy && !items.length && !error" kind="empty" compact
      >暂无活动订单</UiState
    >
    <div v-if="items.length" class="table-scroll activity-order-table">
      <table role="table" aria-label="活动订单">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">活动 / 订单号</th>
            <th scope="col" role="columnheader">人数</th>
            <th scope="col" role="columnheader">订单金额</th>
            <th scope="col" role="columnheader">订单状态</th>
            <th scope="col" role="columnheader">退款状态</th>
            <th scope="col" role="columnheader">下单时间</th>
            <th scope="col" role="columnheader">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="o in items" :key="o.id" role="row">
            <td class="order-identity" role="cell">
              <strong>{{ o.activityTitle }}</strong
              ><small>{{ o.orderNo }}</small>
            </td>
            <td class="order-count" role="cell">
              {{ o.partySize }}<span class="order-count-unit"> 人</span>
            </td>
            <td class="order-amount" role="cell">
              {{ money(o.totalCents)
              }}<small v-if="o.originalTotalCents !== o.totalCents"
                >（原价 {{ money(o.originalTotalCents) }}）</small
              >
            </td>
            <td class="order-status" role="cell">
              <span class="order-badge" :class="statusTone(o)">{{
                status(o)
              }}</span>
            </td>
            <td role="cell">{{ o.refundStatus ? (refundLabels[o.refundStatus] || o.refundStatus) : "—" }}</td>
            <td role="cell">{{ o.createdAt ? displayDate(o.createdAt) : "—" }}</td>
            <td class="order-open" role="cell">
              <button class="text-button" :disabled="busy" @click="open(o)">
                查看订单
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar :page="page" :page-size="20" :total="total" :has-more="more" :busy="busy" label="活动订单分页" @change="load" />
    <p class="activity-order-hint">
      金额为下单时的成交快照。待支付订单尚未确认报名。
    </p>
    <FormModal
      :busy="busy"
      v-if="selected"
      class="activity-order-detail"
      size="lg"
      @close="close"
      ><template #title><h2>订单详情</h2></template>

      <section class="activity-order-summary">
        <div class="activity-order-line">
          <h3>{{ selected.activityTitle }}</h3>
          <span class="order-badge" :class="statusTone(selected)">{{
            status(selected)
          }}</span>
        </div>
        <dl>
          <div>
            <dt>订单编号</dt>
            <dd>{{ selected.orderNo }}</dd>
          </div>
          <div>
            <dt>参加人数</dt>
            <dd>{{ selected.partySize }} 人</dd>
          </div>
          <div>
            <dt>成交金额</dt>
            <dd>{{ money(selected.totalCents) }}</dd>
          </div>
          <div v-if="selected.originalTotalCents !== selected.totalCents">
            <dt>优惠前金额</dt>
            <dd>{{ money(selected.originalTotalCents) }}</dd>
          </div>
        </dl>
      </section>
      <p v-if="selected.totalCents === 0">免支付订单，无微信支付交易。</p>
      <p v-else>
        微信交易号：{{
          selected.paymentTransactionId || "尚无核验成功的支付回执"
        }}
      </p>
      <div class="activity-order-actions">
        <button
          v-if="!peopleLoaded"
          class="secondary"
          :disabled="busy"
          @click="loadParticipants()"
        >
          加载参加者
        </button>
        <button
          class="text-button"
          :disabled="busy"
          @click="togglePrivate('user')"
        >
          {{ revealed ? "隐藏用户标识" : "查看用户标识" }}
        </button>
        <span v-if="revealed" class="activity-order-user"
          >用户 ID：{{ selected.userId }}</span
        >
      </div>
      <section
        v-if="peopleLoaded"
        class="activity-order-summary activity-order-people"
      >
        <div class="activity-order-line">
          <h3>参加者</h3>
          <button
            class="text-button"
            :disabled="busy"
            @click="togglePrivate('participants')"
          >
            {{ showPeople ? "隐藏姓名电话" : "查看姓名电话" }}
          </button>
        </div>
        <p
          v-for="person in showPeople ? revealedParticipants : participants"
          :key="person.id"
        >
          {{
            showPeople
              ? person.participantName
              : (Array.from(person.participantName)[0] ?? "") + "••"
          }}
          ·
          {{ showPeople ? person.phone : maskPhone(person.phone) }}
          · {{ person.idNumber || "无需证件" }}
        </p>
        <p class="activity-order-hint">
          联系资料仅用于活动履约。证件号码继续脱敏。
        </p>
      </section>
      <p v-if="error" role="alert" class="error-box">{{ error }}</p>
      <p
        v-if="selected.status === 'PENDING_PAYMENT'"
        class="activity-order-hint activity-order-callout"
      >
        核对支付状态后，只有确定未支付且已关闭的订单才会释放名额。
      </p>
      <section
        v-if="refund?.id || selected.status === 'PAID'"
        class="activity-order-refund"
      >
        <h3>退款申请</h3>
        <form
          v-if="
            selected.status === 'PAID' &&
            (!refund?.id ||
              ['REJECTED', 'CLOSED'].includes(refund.status || ''))
          "
          @submit.prevent="action('request')"
        >
          <label
            >退款原因<textarea
              v-model="reason"
              aria-label="发起退款原因"
              maxlength="200"
              :disabled="busy || conflict"
            />
          </label>
          <label class="activity-order-check"
            ><input
              v-model="requestConfirmed"
              aria-label="确认全额退款申请"
              type="checkbox"
              :disabled="busy || conflict"
            />确认对订单 {{ selected.orderNo }} 发起全额退款
            {{ money(selected.totalCents) }}
            的申请。提交后仍需批准，不代表退款成功。</label
          >
          <button type="submit" class="secondary" :disabled="busy || conflict">
            发起全额退款
          </button>
        </form>
        <p v-if="!refund?.id">暂无退款申请</p>
        <template v-else
          ><p>
            {{
              selected.totalCents === 0 && refund.status === "SUCCESS"
                ? "免费报名已取消"
                : refundLabels[refund.status || ""] || refund.status
            }}
            · {{ money(refund.amount_cents || 0) }}
          </p>
          <p v-if="refund.out_refund_no">
            退款单号：{{ refund.out_refund_no }}
          </p>
          <p>申请原因：{{ refund.reason }}</p>
          <p v-if="refund.decision_note">
            审核备注：{{ refund.decision_note }}
          </p>
          <template v-if="refund.status === 'REQUESTED'"
            ><label
              >审核备注（拒绝时必填）<textarea
                v-model="note"
                aria-label="退款审核备注"
                maxlength="200"
                :disabled="busy || conflict"
              />
            </label>
            <p class="activity-order-hint activity-order-callout">
              批准后由微信处理，退款成功后才释放名额。
            </p></template
          >
          <p
            v-if="refund.status === 'ABNORMAL'"
            class="activity-order-hint activity-order-callout"
          >
            先核对原退款单。若仍异常，请联系微信支付。名额会继续保留。
          </p>
        </template>
      </section>
      <div class="activity-order-actions activity-order-footer">
        <button class="secondary" :disabled="busy" @click="reload">
          刷新详情
        </button>
        <template v-if="selected.status === 'PENDING_PAYMENT'">
          <button
            class="danger-outline"
            :disabled="busy || conflict"
            @click="action('cancel')"
          >
            关闭未付订单
          </button>
          <button
            class="primary"
            :disabled="busy || conflict"
            @click="action('verify')"
          >
            核对支付状态
          </button>
        </template>
        <button
          v-if="selected.status === 'CONFIRMED_FREE'"
          class="danger-outline"
          :disabled="busy || conflict"
          @click="action('cancel')"
        >
          取消免费报名
        </button>
        <template v-if="refund?.status === 'REQUESTED'">
          <button
            class="danger-outline"
            :disabled="busy || conflict"
            @click="action('reject')"
          >
            拒绝退款
          </button>
          <button
            class="primary"
            :disabled="busy || conflict"
            @click="action('approve')"
          >
            批准全额退款
          </button>
        </template>
        <button
          v-if="['PROCESSING', 'UNKNOWN'].includes(refund?.status || '')"
          class="secondary"
          :disabled="busy || conflict"
          @click="action('retry')"
        >
          重试原退款
        </button>
        <button
          v-if="
            ['PROCESSING', 'UNKNOWN', 'ABNORMAL'].includes(refund?.status || '')
          "
          class="primary"
          :disabled="busy || conflict"
          @click="action('refundVerify')"
        >
          核对退款结果
        </button>
      </div>
    </FormModal>
  </main>
</template>
<style scoped>
.activity-order-filters {
  display: grid;
  grid-template-columns: minmax(180px, 1.5fr) repeat(2, minmax(136px, 1fr)) auto;
  align-items: end;
  gap: 8px;
  margin-bottom: 14px;
}
.activity-order-filters :is(input, select) { width: 100%; min-width: 0; margin: 0; }
@media (max-width: 720px) {
  .activity-order-filters { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .activity-order-filters input { grid-column: 1 / -1; }
}

.activity-order-pager,
.activity-order-actions,
.activity-order-scope,
.activity-order-line {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.activity-order-scope {
  margin: 0 0 12px;
  padding: 4px 12px;
  border: 1px solid var(--admin-line);
  background: var(--admin-surface);
  border-radius: var(--admin-radius);
}
.activity-order-scope span,
.activity-order-pager,
.activity-order-hint,
.order-identity small,
.order-amount small {
  color: var(--admin-muted);
  font-size: 12px;
}
.activity-order-scope a,
.activity-order-line button {
  margin-left: auto;
}
.activity-order-table th:nth-child(2) {
  width: 80px;
}
.activity-order-table th:nth-child(3) {
  width: 132px;
}
.activity-order-table th:nth-child(4) {
  width: 174px;
}
.activity-order-table th:last-child {
  width: 130px;
}
.activity-order-table td {
  height: 48px;
  padding-block: 6px;
}
.order-identity strong,
.order-identity small,
.order-amount small {
  display: block;
  overflow-wrap: anywhere;
}
.order-identity strong,
.order-amount {
  font-weight: 650;
}
.order-count,
.order-amount,
.order-identity small,
.activity-order-summary dd {
  font-variant-numeric: tabular-nums;
}
.order-count-unit {
  display: none;
}
.order-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 12px;
}
.activity-order-pager {
  margin-top: 12px;
}
.activity-order-pager span {
  margin-right: auto;
}
.activity-order-hint {
  margin: 10px 0 0;
}
.activity-order-detail :deep(.form-modal) {
  max-width: 780px;
  background: var(--admin-surface);
}
.activity-order-detail h2 {
  margin: 0 42px 12px 0;
  font-size: 20px;
}
.activity-order-detail h3 {
  margin: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}
.activity-order-summary,
.activity-order-callout {
  padding: 10px 12px;
  border: 1px solid var(--admin-line);
  border-radius: var(--admin-radius);
  background: var(--admin-paper);
}
.activity-order-summary dl {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 8px 0 0;
}
.activity-order-summary dt {
  color: var(--admin-muted);
  font-size: 12px;
}
.activity-order-summary dd {
  margin: 2px 0 0;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.activity-order-line h3 {
  flex: 1;
}
.activity-order-people,
.activity-order-refund,
.activity-order-footer {
  margin-top: 14px;
}
.activity-order-people p,
.activity-order-refund p {
  margin-block: 6px;
  overflow-wrap: anywhere;
}
.activity-order-refund textarea {
  min-height: 64px;
}
.activity-order-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.activity-order-check input {
  flex: 0 0 auto;
}
.activity-order-user {
  overflow-wrap: anywhere;
}
.activity-order-footer {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .activity-order-table {
    overflow: visible;
    background: transparent;
    border: 0;
  }
  .activity-order-table table {
    display: block;
    min-width: 0;
  }
  .activity-order-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .activity-order-table tbody {
    display: grid;
    gap: 8px;
  }
  .activity-order-table tbody tr {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 4px 8px;
    align-items: center;
    padding: 8px 10px;
    background: var(--admin-surface);
    border: 1px solid var(--admin-line);
    border-radius: var(--admin-radius);
  }
  .activity-order-table td {
    height: auto;
    padding: 0;
    border: 0;
  }
  .order-identity {
    grid-column: 1 / 3;
    grid-row: 1;
  }
  .order-status {
    grid-column: 3;
    grid-row: 1;
    justify-self: end;
  }
  .order-count {
    grid-column: 1;
    grid-row: 2;
  }
  .order-count-unit {
    display: inline;
  }
  .order-amount {
    grid-column: 2;
    grid-row: 2;
  }
  .order-open {
    grid-column: 3;
    grid-row: 2;
    justify-self: end;
  }
  .order-open button {
    min-height: 44px;
    padding-inline: 10px;
    border: 1px solid var(--admin-line);
    background: var(--admin-surface);
  }
}
</style>
