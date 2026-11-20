<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
import FormModal from "../components/FormModal.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
type Refund = {
  id: string;
  orderId: string;
  orderNo: string;
  amountCents: number;
  reason: string;
  status: string;
  decisionNote: string;
  lastError: string;
  version: number;
};
const items = ref<Refund[]>([]),
  page = ref(0),
  total = ref<number>(),
  hasMore = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  selected = ref<Refund | null>(null),
  action = ref(""),
  note = ref(""),
  searchDraft = ref(""),
  statusDraft = ref(""),
  filters = ref({ query: "", status: "" });
function applyFilters() {
  filters.value = { query: searchDraft.value.trim(), status: statusDraft.value };
  void load(0);
}
let generation = 0;
const labels: Record<string, string> = {
  REQUESTED: "待审核",
  REJECTED: "已拒绝",
  PROCESSING: "退款中",
  UNKNOWN: "结果待核对",
  SUCCESS: "已退款",
  ABNORMAL: "退款异常",
  CLOSED: "退款关闭",
};
async function load(next = 0) {
  if (busy.value) return;
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({ page: String(next), size: "20" });
    for (const [key, value] of Object.entries(filters.value)) if (value) params.set(key, value);
    const r = await request<{ items: Refund[]; total?: number; hasMore: boolean }>(
      `/admin/refunds?${params}`,
    );
    if (n === generation && actor === currentUser.value) {
      items.value = r.items;
      total.value = r.total;
    hasMore.value = r.hasMore;
      page.value = next;
    }
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
function choose(row: Refund, kind: string) {
  if (busy.value) return;
  selected.value = row;
  action.value = kind;
  note.value = "";
  error.value = "";
}
function close() {
  if (busy.value) return;
  selected.value = null;
  error.value = "";
}
async function confirm() {
  const row = selected.value;
  if (!row || busy.value) return;
  if (action.value === "reject" && !note.value.trim()) {
    error.value = "请填写拒绝原因";
    return;
  }
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const updated = await request<Refund>(
      `/admin/refunds/${row.id}/${action.value}`,
      {
        method: "POST",
        body: JSON.stringify({ version: row.version, note: note.value.trim() }),
      },
    );
    if (n === generation && actor === currentUser.value) {
      items.value = items.value.map((r) => (r.id === updated.id ? updated : r));
      selected.value = null;
      notice.value = "退款状态：" + (labels[updated.status] || "已更新");
    }
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
watch(currentUser, () => {
  generation++;
  items.value = [];
  notice.value = "";
  selected.value = null;
  note.value = "";
  busy.value = false;
});
onMounted(() => void load());
onUnmounted(() => {
  generation++;
});
</script>
<template>
  <main class="workspace">
    <div class="page-heading">
      <h1>退款售后</h1>
      <button class="secondary" :disabled="busy" @click="load(page)">
        刷新
      </button>
    </div>
    <p v-if="error && !selected" class="error-box" role="alert">{{ error }}</p>
    <UiState v-if="busy && !items.length" kind="loading" compact
      >正在读取退款申请…</UiState
    >
    <UiState v-else-if="!items.length && !busy && !error" kind="empty" compact
      >暂无退款申请</UiState
    >
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <form class="action-row" @submit.prevent="applyFilters">
      <input v-model="searchDraft" maxlength="100" aria-label="搜索退款订单号" placeholder="订单号" />
      <select v-model="statusDraft" aria-label="退款状态">
        <option value="">全部退款状态</option>
        <option v-for="(label, value) in labels" :key="value" :value="value">{{ label }}</option>
      </select>
      <button class="secondary" :disabled="busy">查询</button>
    </form>
    <div v-if="items.length" class="table-scroll" :aria-busy="busy">
      <table>
        <thead>
          <tr>
            <th>订单</th>
            <th>金额</th>
            <th>原因</th>
            <th>状态</th>
            <th>处理</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in items" :key="row.id">
            <td><RouterLink class="text-button" :to="{ path: '/shop', query: { tab: 'orders', orderQuery: row.orderNo } }">{{ row.orderNo }}</RouterLink></td>
            <td class="nowrap">¥{{ (row.amountCents / 100).toFixed(2) }}</td>
            <td class="refund-details">
              {{ row.reason }}
              <p class="muted">{{ row.decisionNote || row.lastError }}</p>
            </td>
            <td class="nowrap"><span class="status-pill" :class="row.status === 'SUCCESS' ? 'tone-success' : row.status === 'ABNORMAL' ? 'tone-danger' : row.status === 'REQUESTED' ? 'tone-warning' : 'tone-neutral'">{{ labels[row.status] || row.status }}</span></td>
            <td>
              <div class="refund-actions">
                <template v-if="row.status === 'REQUESTED'"
                  ><button
                    class="text-button"
                    :disabled="busy"
                    @click="choose(row, 'approve')"
                  >
                    批准退款</button
                  ><button
                    class="text-button"
                    :disabled="busy"
                    @click="choose(row, 'reject')"
                  >
                    拒绝
                  </button></template
                ><button
                  class="text-button"
                  v-if="
                    ['PROCESSING', 'UNKNOWN', 'ABNORMAL'].includes(row.status)
                  "
                  :disabled="busy"
                  @click="choose(row, 'verify')"
                >
                  核对结果</button
                ><button
                  class="text-button"
                  v-if="['PROCESSING', 'UNKNOWN'].includes(row.status)"
                  :disabled="busy"
                  @click="choose(row, 'retry')"
                >
                  重试原退款单
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar :page="page" :page-size="20" :total="total" :has-more="hasMore" :busy="busy" label="退款分页" @change="load" />
    <FormModal :busy="busy" v-if="selected" @close="close"
      ><template #title
        ><h2 class="modal-heading">
          {{
            action === "reject"
              ? "拒绝退款"
              : action === "verify"
                ? "核对退款结果"
                : action === "retry" ? "重试原退款单" : "确认全额退款"
          }}
        </h2></template
      >

      <p class="refund-summary">
        {{ selected.orderNo }} · ¥{{ (selected.amountCents / 100).toFixed(2) }}
      </p>
      <p v-if="action === 'approve' || action === 'retry'">
        将向微信发起原路退款，成功后不可撤回。结果未确认前不恢复库存。
      </p>
      <label v-if="action === 'reject' || action === 'approve'"
        >{{ action === "reject" ? "拒绝原因" : "审核备注（选填）" }}<textarea
          v-model="note"
          maxlength="200"
          :disabled="busy"
        />
      </label>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <div class="actions">
        <button class="secondary" :disabled="busy" @click="close">取消</button
        ><button class="primary" :disabled="busy" @click="confirm">
          {{ busy ? "处理中…" : "确认" }}
        </button>
      </div>
    </FormModal>
  </main>
</template>
<style scoped>
.modal-heading {
  padding-right: 36px;
}
.refund-summary {
  overflow-wrap: anywhere;
}
th,
.nowrap {
  white-space: nowrap;
}
.refund-details {
  max-width: 440px;
  overflow-wrap: anywhere;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 20px;
}
.refund-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
textarea {
  width: 100%;
  min-height: 100px;
}
</style>
