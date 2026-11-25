<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
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
  if (busy.value) return;
  filters.value = {
    query: searchDraft.value.trim(),
    status: statusDraft.value,
  };
  void load(0);
}
function clearFilters() {
  searchDraft.value = statusDraft.value = "";
  applyFilters();
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
const actionLabels: Record<string, string> = {
  approve: "确认退款",
  reject: "确认拒绝",
  retry: "确认重试",
  verify: "核对退款",
};
async function load(next = 0) {
  if (busy.value) return;
  const n = ++generation,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const params = new URLSearchParams({ page: String(next), size: "20" });
    for (const [key, value] of Object.entries(filters.value))
      if (value) params.set(key, value);
    const r = await request<{
      items: Refund[];
      total?: number;
      hasMore: boolean;
    }>(`/admin/refunds?${params}`);
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
useForegroundRefresh(() => {
  if (!busy.value && !selected.value) void load(page.value);
}, 45_000);
</script>
<template>
  <main class="workspace">
    <header class="page-heading"><h1>退款售后</h1></header>
    <form
      class="list-filters"
      role="search"
      aria-label="筛选退款"
      @submit.prevent="applyFilters"
    >
      <input
        v-model="searchDraft"
        type="search"
        maxlength="100"
        aria-label="搜索退款订单号"
        placeholder="搜索订单号"
      />
      <select
        v-model="statusDraft"
        aria-label="退款状态"
        :disabled="busy"
        @change="applyFilters"
      >
        <option value="">全部状态</option>
        <option v-for="(label, value) in labels" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
      <button class="secondary" type="submit" :disabled="busy">查询</button>
      <button
        v-if="(filters.query || filters.status) && (items.length || error)"
        class="text-button"
        type="button"
        :disabled="busy"
        @click="clearFilters"
      >
        清除筛选
      </button>
    </form>
    <p v-if="error && !selected" class="error-box" role="alert">
      {{ error }}
      <button
        class="text-button"
        type="button"
        :disabled="busy"
        @click="load(page)"
      >
        重试
      </button>
    </p>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <UiState v-if="busy && !items.length" kind="loading" compact
      >正在读取退款申请…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact>
      {{
        filters.query || filters.status
          ? "没有符合条件的退款申请"
          : "暂无退款申请"
      }}
      <button
        v-if="filters.query || filters.status"
        class="text-button"
        type="button"
        @click="clearFilters"
      >
        清除筛选
      </button>
    </UiState>
    <div v-if="items.length" class="table-scroll" :aria-busy="busy">
      <table class="record-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader">订单</th>
            <th role="columnheader">金额</th>
            <th role="columnheader">原因</th>
            <th role="columnheader">状态</th>
            <th role="columnheader">处理</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr role="row" v-for="row in items" :key="row.id">
            <td role="cell" data-cell="title">
              <RouterLink
                class="text-button"
                :to="{
                  path: '/shop',
                  query: { tab: 'orders', orderQuery: row.orderNo },
                }"
                >{{ row.orderNo }}</RouterLink
              >
            </td>
            <td role="cell" data-label="金额" class="nowrap">
              ¥{{ (row.amountCents / 100).toFixed(2) }}
            </td>
            <td role="cell" data-cell="wide" class="refund-details">
              {{ row.reason }}
              <p v-if="row.decisionNote || row.lastError" class="muted">
                {{ row.decisionNote || row.lastError }}
              </p>
            </td>
            <td role="cell" data-label="退款状态" class="nowrap">
              <span
                class="status-pill"
                :class="
                  row.status === 'SUCCESS'
                    ? 'tone-success'
                    : row.status === 'ABNORMAL'
                      ? 'tone-danger'
                      : row.status === 'REQUESTED'
                        ? 'tone-warning'
                        : 'tone-neutral'
                "
                >{{ labels[row.status] || row.status }}</span
              >
            </td>
            <td role="cell" data-cell="actions">
              <div class="refund-actions">
                <template v-if="row.status === 'REQUESTED'"
                  ><button
                    class="text-button"
                    :disabled="busy"
                    @click="choose(row, 'approve')"
                  >
                    批准退款</button
                  ><button
                    class="text-button refund-reject"
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
    <PaginationBar
      :page="page"
      :page-size="20"
      :total="total"
      :has-more="hasMore"
      :busy="busy"
      label="退款分页"
      @change="load"
    />
    <FormModal :busy="busy" v-if="selected" @close="close"
      ><template #title
        ><h2 class="modal-heading">
          {{
            action === "reject"
              ? "拒绝退款"
              : action === "verify"
                ? "核对退款结果"
                : action === "retry"
                  ? "重试原退款单"
                  : "确认全额退款"
          }}
        </h2></template
      >

      <dl class="refund-summary">
        <dt>退款金额</dt>
        <dd class="refund-amount">
          ¥{{ (selected.amountCents / 100).toFixed(2) }}
        </dd>
        <dt>订单号</dt>
        <dd>{{ selected.orderNo }}</dd>
      </dl>
      <p v-if="action === 'approve' || action === 'retry'">
        将向微信发起原路退款，成功后不可撤回。结果未确认前不恢复库存。
      </p>
      <label v-if="action === 'reject' || action === 'approve'"
        >{{ action === "reject" ? "拒绝原因" : "审核备注（选填）"
        }}<textarea v-model="note" maxlength="200" :disabled="busy" />
      </label>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <template #footer>
        <div class="dialog-actions">
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="close"
          >
            取消
          </button>
          <button
            type="button"
            :class="action === 'verify' ? 'primary' : 'danger'"
            :disabled="busy"
            @click="confirm"
          >
            {{ busy ? "处理中…" : actionLabels[action] }}
          </button>
        </div>
      </template>
    </FormModal>
  </main>
</template>
<style scoped>
.refund-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px 14px;
  overflow-wrap: anywhere;
}
.refund-summary dt {
  color: var(--rf-muted);
}
.refund-summary dd {
  margin: 0;
}
.refund-amount {
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}
th,
.nowrap {
  white-space: nowrap;
}
.refund-details {
  max-width: 440px;
  overflow-wrap: anywhere;
}
.refund-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.refund-reject {
  color: var(--rf-danger);
}
textarea {
  width: 100%;
  min-height: 100px;
}
</style>
