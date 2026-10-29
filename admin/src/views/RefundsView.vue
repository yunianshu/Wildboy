<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { request, currentUser, errorMessage } from "../api";
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
  hasMore = ref(false),
  busy = ref(false),
  error = ref(""),
  selected = ref<Refund | null>(null),
  action = ref(""),
  note = ref("");
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
    const r = await request<{ items: Refund[]; hasMore: boolean }>(
      `/admin/refunds?page=${next}&size=20`,
    );
    if (n === generation && actor === currentUser.value) {
      items.value = r.items;
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
  selected.value = row;
  action.value = kind;
  note.value = "";
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
    }
  } catch (e) {
    if (n === generation)
      error.value = e instanceof Error ? e.message : "操作失败";
  } finally {
    if (n === generation) busy.value = false;
  }
}
watch(currentUser, () => {
  generation++;
  items.value = [];
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
  <section>
    <div class="page-heading">
      <h1>退款售后</h1>
      <button class="secondary" :disabled="busy" @click="load(page)">
        刷新
      </button>
    </div>
    <p v-if="error" class="error-box" role="alert">{{ error }}</p>
    <p v-if="!items.length && !busy" class="empty-state">暂无退款申请</p>
    <div class="table-scroll">
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
            <td>{{ row.orderNo }}</td>
            <td>¥{{ (row.amountCents / 100).toFixed(2) }}</td>
            <td>
              {{ row.reason }}
              <p class="muted">{{ row.decisionNote || row.lastError }}</p>
            </td>
            <td>{{ labels[row.status] || row.status }}</td>
            <td>
              <template v-if="row.status === 'REQUESTED'"
                ><button :disabled="busy" @click="choose(row, 'approve')">
                  批准退款</button
                ><button :disabled="busy" @click="choose(row, 'reject')">
                  拒绝
                </button></template
              ><button
                v-if="
                  ['PROCESSING', 'UNKNOWN', 'ABNORMAL'].includes(row.status)
                "
                :disabled="busy"
                @click="choose(row, 'verify')"
              >
                核对结果</button
              ><button
                v-if="['PROCESSING', 'UNKNOWN'].includes(row.status)"
                :disabled="busy"
                @click="choose(row, 'retry')"
              >
                重试原退款单
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="actions">
      <button :disabled="busy || page === 0" @click="load(page - 1)">
        上一页</button
      ><button :disabled="busy || !hasMore" @click="load(page + 1)">
        下一页
      </button>
    </div>
    <div v-if="selected" class="modal-overlay" role="presentation">
      <section
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-label="确认退款操作"
      >
        <h2>
          {{
            action === "reject"
              ? "拒绝退款"
              : action === "verify"
                ? "核对退款结果"
                : "确认全额退款"
          }}
        </h2>
        <p>
          {{ selected.orderNo }} · ¥{{
            (selected.amountCents / 100).toFixed(2)
          }}
        </p>
        <p v-if="action === 'approve' || action === 'retry'">
          将向微信发起原路退款，成功后不可撤回。结果未确认前不恢复库存。
        </p>
        <textarea
          v-if="action === 'reject'"
          v-model="note"
          maxlength="200"
          :disabled="busy"
          placeholder="拒绝原因"
        />
        <div class="actions">
          <button :disabled="busy" @click="selected = null">取消</button
          ><button class="primary" :disabled="busy" @click="confirm">
            确认
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: #0006;
  display: grid;
  place-items: center;
  z-index: 100;
  padding: 24px;
}
.modal {
  background: #fff;
  padding: 28px;
  border-radius: 16px;
  max-width: 520px;
}
.actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
}
td button {
  margin: 4px;
}
textarea {
  width: 100%;
  min-height: 100px;
}
</style>
