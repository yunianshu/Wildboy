<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Page } from "../types";
import FormModal from "../components/FormModal.vue";
const route = useRoute();
const activityId = computed(() =>
  typeof route.query.activityId === "string" ? route.query.activityId : "",
);
function listPath(next: number) {
  const params = new URLSearchParams({ page: String(next), size: "20" });
  if (activityId.value) params.set("activityId", activityId.value);
  return `/admin/activity-orders?${params}`;
}
type Order = {
  id: string;
  orderNo: string;
  activityId: string;
  activityTitle: string;
  userId: string;
  status: string;
  partySize: number;
  originalTotalCents: number;
  totalCents: number;
  currency: string;
  paymentTransactionId: string | null;
  version: number;
};
type Participant = {
  id: string;
  participantName: string;
  phone: string;
  idNumber: string | null;
};
const participants = ref<Participant[]>([]),
  peopleLoaded = ref(false),
  showPeople = ref(false);
type Refund = {
  id?: string;
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
const orderLabels: Record<string, string> = {
  PENDING_PAYMENT: "待支付（名额保留）",
  PAID: "已支付",
  CONFIRMED_FREE: "免支付已确认",
  CLOSED: "已关闭",
  REFUND_PENDING: "退款处理中（名额保留）",
  REFUNDED: "已退款",
};
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
  return orderLabels[o.status] || o.status;
}
let epoch = 0;
function reset() {
  epoch++;
  participants.value = [];
  peopleLoaded.value = false;
  showPeople.value = false;
  items.value = [];
  selected.value = null;
  refund.value = null;
  note.value = "";
  reason.value = "";
  requestConfirmed.value = false;
  revealed.value = false;
  busy.value = false;
  more.value = false;
  page.value = 0;
  error.value = "";
  conflict.value = false;
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
  conflict.value = e instanceof ApiError && e.status === 409;
  error.value = conflict.value
    ? "订单或退款版本已变化，请重新加载后核对；不会自动覆盖。"
    : errorMessage(e);
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
    const r = await request<Refund>(
      `/admin/activity-orders/${encodeURIComponent(o.id)}/refund`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    participants.value = [];
    peopleLoaded.value = false;
    showPeople.value = false;
    selected.value = o;
    refund.value = r;
    note.value = "";
    reason.value = "";
    requestConfirmed.value = false;
    revealed.value = false;
    conflict.value = false;
  } catch (e) {
    if (n === epoch) fail(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function close() {
  if (
    busy.value ||
    ((note.value || reason.value) &&
      !window.confirm("退款填写内容未保存，确定放弃吗？"))
  )
    return;
  selected.value = null;
  participants.value = [];
  peopleLoaded.value = false;
  showPeople.value = false;
  refund.value = null;
  note.value = "";
  reason.value = "";
  requestConfirmed.value = false;
  revealed.value = false;
  error.value = "";
}
onBeforeRouteLeave(
  (to) =>
    to.path === "/login" ||
    (!busy.value &&
      (!(note.value || reason.value) ||
        window.confirm("退款填写内容未保存，确定离开吗？"))),
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
  if (
    (kind === "approve" || kind === "reject" || kind === "retry") &&
    refund.value?.version == null
  )
    return;
  if (
    kind === "approve" &&
    !window.confirm(
      `确认批准订单 ${o.orderNo} 全额退款 ${money(refund.value?.amount_cents ?? o.totalCents)}？以微信实际回执为准。`,
    )
  )
    return;
  if (
    kind === "cancel" &&
    !window.confirm(
      o.status === "CONFIRMED_FREE"
        ? "确认取消这笔免费报名并释放名额？"
        : "确认关闭这笔未支付订单？服务端会先核对微信状态，结果不确定时继续保留名额。",
    )
  )
    return;
  if (
    kind === "retry" &&
    !window.confirm(
      "使用原退款单号重试全额退款？请先核对结果，仍以微信回执为准。",
    )
  )
    return;
  const n = epoch,
    actor = currentUser.value;
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
  try {
    const result = await request<Order | Refund>(
      `/admin/activity-orders/${encodeURIComponent(o.id)}/${suffix}`,
      {
        method: "POST",
        ...(kind === "request"
          ? { body: JSON.stringify({ reason: reason.value.trim() }) }
          : {}),
        ...(kind === "approve" || kind === "reject" || kind === "retry"
          ? {
              body: JSON.stringify({
                version: refund.value?.version,
                note: note.value.trim(),
              }),
            }
          : {}),
      },
    );
    if (n !== epoch || actor !== currentUser.value) return;
    if (kind === "verify" || kind === "cancel") {
      selected.value = result as Order;
      items.value = items.value.map((item) =>
        item.id === o.id ? (result as Order) : item,
      );
    } else {
      refund.value = result as Refund;
      note.value = "";
      reason.value = "";
      requestConfirmed.value = false;
      const r = await request<Page<Order>>(listPath(page.value));
      if (n !== epoch || actor !== currentUser.value) return;
      items.value = r.items;
      more.value = r.hasMore;
      selected.value = r.items.find((item) => item.id === o.id) || null;
    }
  } catch (e) {
    if (n === epoch) fail(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
async function loadParticipants() {
  if (busy.value || !selected.value || !currentUser.value) return;
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const rows = await request<Participant[]>(
      `/admin/activity-orders/${encodeURIComponent(selected.value.id)}/participants`,
    );
    if (n !== epoch || actor !== currentUser.value) return;
    participants.value = rows;
    peopleLoaded.value = true;
  } catch (e) {
    if (n === epoch) fail(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
async function reload() {
  const o = selected.value;
  if (
    !o ||
    busy.value ||
    ((note.value || reason.value) &&
      !window.confirm("重新加载会放弃退款填写内容，继续吗？"))
  )
    return;
  await open(o);
}
watch(activityId, () => {
  reset();
  void load(0);
});
onMounted(() => void load(0));
</script>
<template>
  <main class="workspace">
    <div class="page-heading">
      <div>
        <h1>{{ activityId ? "收费活动名单" : "活动订单" }}</h1>
        <p v-if="activityId">
          仅显示活动 {{ activityId }} 的订单。待支付仅保留名额；已支付 /
          免支付已确认才是已确认报名。
        </p>
        <RouterLink v-if="activityId" to="/activity-orders"
          >查看全部活动订单</RouterLink
        >
        <p>
          活动订单独立核对，不涉及商品库存。支付和退款结果以服务端核验回执为准。
        </p>
      </div>
      <button :disabled="busy" @click="load()">刷新订单</button>
    </div>
    <p v-if="error && !selected" role="alert" class="error-box">{{ error }}</p>
    <p v-if="busy" role="status">处理中…</p>
    <p v-if="!busy && !items.length">暂无活动订单</p>
    <div class="table-scroll">
      <table v-if="items.length">
        <thead>
          <tr>
            <th>活动 / 订单号</th>
            <th>人数</th>
            <th>金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in items" :key="o.id">
            <td>{{ o.activityTitle }}<br />{{ o.orderNo }}</td>
            <td>{{ o.partySize }}</td>
            <td>
              {{ money(o.totalCents)
              }}<small v-if="o.originalTotalCents !== o.totalCents"
                >（原价 {{ money(o.originalTotalCents) }}）</small
              >
            </td>
            <td>{{ status(o) }}</td>
            <td>
              <button :disabled="busy" @click="open(o)">查看订单 / 退款</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav class="member-actions">
      <button :disabled="busy || page === 0" @click="load(page - 1)">
        上一页</button
      ><span>第 {{ page + 1 }} 页</span
      ><button :disabled="busy || !more" @click="load(page + 1)">下一页</button>
    </nav>
    <FormModal v-if="selected" @close="close"
      ><h2>{{ selected.activityTitle }}</h2>
      <p>{{ selected.orderNo }} · {{ status(selected) }}</p>
      <p>
        人数 {{ selected.partySize }} · 金额 {{ money(selected.totalCents) }}
      </p>
      <p>
        用户 ID：{{ revealed ? selected.userId : "••••••••" }}
        <button @click="revealed = !revealed">
          {{ revealed ? "隐藏用户标识" : "查看用户标识" }}
        </button>
      </p>
      <p v-if="selected.totalCents === 0">免支付订单，无微信支付交易。</p>
      <p v-else>
        微信交易号：{{
          selected.paymentTransactionId || "尚无核验成功的支付回执"
        }}
      </p>
      <button v-if="!peopleLoaded" :disabled="busy" @click="loadParticipants">
        加载参加者
      </button>
      <section v-else>
        <h3>参加者（仅用于活动履约）</h3>
        <button @click="showPeople = !showPeople">
          {{ showPeople ? "隐藏姓名电话" : "查看姓名电话" }}
        </button>
        <p v-for="person in participants" :key="person.id">
          {{
            showPeople
              ? person.participantName
              : person.participantName.slice(0, 1) + "••"
          }}
          ·
          {{
            showPeople
              ? person.phone
              : person.phone.slice(0, 3) + "••••" + person.phone.slice(-4)
          }}
          · {{ person.idNumber || "无需证件" }}
        </p>
      </section>
      <p v-if="error" role="alert" class="error-box">{{ error }}</p>
      <button :disabled="busy" @click="reload">重新加载退款资料</button>
      <div v-if="selected.status === 'PENDING_PAYMENT'" class="member-actions">
        <button :disabled="busy || conflict" @click="action('verify')">
          核对支付状态</button
        ><button :disabled="busy || conflict" @click="action('cancel')">
          关闭未付订单
        </button>
      </div>
      <button
        v-if="selected.status === 'CONFIRMED_FREE'"
        :disabled="busy || conflict"
        @click="action('cancel')"
      >
        取消免费报名
      </button>
      <section>
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
          <label
            ><input
              v-model="requestConfirmed"
              aria-label="确认全额退款申请"
              type="checkbox"
              :disabled="busy || conflict"
            />确认对订单 {{ selected.orderNo }} 发起全额退款
            {{ money(selected.totalCents) }}
            的申请。提交后仍需批准，不代表退款成功。</label
          >
          <button type="submit" :disabled="busy || conflict">
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
            <div class="member-actions">
              <button :disabled="busy || conflict" @click="action('approve')">
                批准全额退款</button
              ><button :disabled="busy || conflict" @click="action('reject')">
                拒绝退款
              </button>
            </div></template
          >
          <button
            v-if="
              ['PROCESSING', 'UNKNOWN', 'ABNORMAL'].includes(
                refund.status || '',
              )
            "
            :disabled="busy || conflict"
            @click="action('refundVerify')"
          >
            核对退款结果
          </button>
          <button
            v-if="['PROCESSING', 'UNKNOWN'].includes(refund.status || '')"
            :disabled="busy || conflict"
            @click="action('retry')"
          >
            重试原退款
          </button>
        </template>
      </section>
      <button :disabled="busy" @click="close">关闭</button>
    </FormModal>
  </main>
</template>
<style scoped>
.member-actions {
  display: flex;
  gap: 12px;
  align-items: center;
  margin: 16px 0;
  flex-wrap: wrap;
}
label {
  display: grid;
  gap: 8px;
}
</style>
