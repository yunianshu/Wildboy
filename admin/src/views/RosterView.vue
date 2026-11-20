<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";
import { request, errorMessage, currentUser } from "../api";
import { displayDate } from "../forms";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import type { Activity, Registration, Page } from "../types";
import { registrationTone } from "../statusTone";
const route = useRoute(),
  activity = ref<Activity | null>(null),
  page = ref(0),
  data = ref<Page<Registration>>({
    items: [],
    total: 0,
    page: 0,
    size: 20,
    hasMore: false,
  }),
  busy = ref(false),
  error = ref(""),
  revealed = ref(new Set<string>()),
  revealTarget = ref<{ id: string; name: string } | null>(null);
const searchDraft = ref("");
const statusDraft = ref("");
const filters = ref({ query: "", status: "" });
function applyFilters() {
  filters.value = { query: searchDraft.value.trim(), status: statusDraft.value };
  if (page.value) page.value = 0;
  else void load();
}
const exporting = ref(false);
const exportError = ref("");
async function downloadRoster() {
  const actor = currentUser.value;
  if (exporting.value || busy.value || actor?.role !== "ADMIN" || activity.value?.priceCents !== 0) return;
  const attempt = generation;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters.value)) if (value) params.set(key, value);
  const id = encodeURIComponent(String(route.params.id));
  exporting.value = true;
  exportError.value = "";
  try {
    const entries = await request<{ name: string; maskedPhone: string; status: string; createdAt: string }[]>(
      "/admin/activities/" + id + "/registrations/export?" + params,
      { signal: controller?.signal, cache: "no-store" },
    );
    if (attempt !== generation || actor !== currentUser.value) return;
    if (!entries.length) { exportError.value = "没有符合条件的报名记录。"; return; }
    saveRosterCsv(entries);
  } catch (e) {
    if (attempt === generation && actor === currentUser.value) exportError.value = errorMessage(e);
  } finally {
    if (attempt === generation) exporting.value = false;
  }
}
function saveRosterCsv(entries: { name: string; maskedPhone: string; status: string; createdAt: string }[]) {
  const quote = (value: string) => {
    const safe = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = [["姓名", "手机号（脱敏）", "报名状态", "报名时间"]];
  for (const entry of entries) {
    rows.push([entry.name, entry.maskedPhone,
      entry.status === "CONFIRMED" ? "已报名" : "已取消", displayDate(entry.createdAt)]);
  }
  const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.map(quote).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "报名名单-脱敏.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
let generation = 0,
  controller: AbortController | undefined;
async function load() {
  const current = ++generation;
  controller?.abort();
  exporting.value = false;
  exportError.value = "";
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  revealed.value = new Set();
  revealTarget.value = null;
  revealedDetails.value = {};
  try {
    const id = encodeURIComponent(String(route.params.id));
    const details = await request<Activity>(`/admin/activities/${id}`, {
      signal: controller.signal,
    });
    if (current !== generation) return;
    activity.value = details;
    if (details.priceCents > 0) {
      data.value = { items: [], total: 0, page: 0, size: 20, hasMore: false };
      return;
    }
    const params = new URLSearchParams({ page: String(page.value), size: "20" });
    for (const [key, value] of Object.entries(filters.value)) if (value) params.set(key, value);
    const list = await request<Page<Registration>>(
      `/admin/activities/${id}/registrations?${params}`,
      { signal: controller.signal },
    );
    if (current === generation) {
      activity.value = details;
      data.value = list;
    }
  } catch (e) {
    if (
      current === generation &&
      !(e instanceof DOMException && e.name === "AbortError")
    )
      error.value = errorMessage(e);
  } finally {
    if (current === generation) busy.value = false;
  }
}
const revealedDetails = ref<
  Record<string, { phone: string; idNumber: string }>
>({});
const revealing = ref(new Set<string>());
function toggle(id: string, name: string) {
  if (revealed.value.has(id)) {
    revealed.value = new Set([...revealed.value].filter((x) => x !== id));
    delete revealedDetails.value[id];
    return;
  }
  if (revealing.value.has(id)) return;
  revealTarget.value = { id, name };
}
async function confirmReveal() {
  const id = revealTarget.value?.id;
  revealTarget.value = null;
  if (!id || revealing.value.has(id)) return;
  const current = generation;
  const actor = currentUser.value;
  if (!actor || actor.role !== "ADMIN") return;
  revealing.value.add(id);
  try {
    const result = await request<{ phone: string; idNumber: string }>(
      `/admin/activities/${encodeURIComponent(String(route.params.id))}/participants/${encodeURIComponent(id)}/reveal`,
      { method: "POST" },
    );
    if (current !== generation || currentUser.value !== actor) return;
    revealedDetails.value[id] = result;
    revealed.value = new Set([...revealed.value, id]);
  } catch (e) {
    if (current === generation) error.value = errorMessage(e);
  } finally {
    revealing.value.delete(id);
  }
}
function maskPhone(phone: string) {
  return phone.length > 7
    ? `${phone.slice(0, 3)}••••${phone.slice(-4)}`
    : "••••";
}
function maskIdNumber(idNumber: string) {
  if (!idNumber) return "历史记录未登记";
  return idNumber.length === 18
    ? `${idNumber.slice(0, 6)}••••••••${idNumber.slice(-4)}`
    : "••••••••••";
}
watch(currentUser, () => {
  generation++;
  controller?.abort();
  revealed.value.clear();
  revealTarget.value = null;
  revealedDetails.value = {};
  data.value.items = [];
  activity.value = null;
  exporting.value = false;
  exportError.value = "";
});
watch([page, () => route.params.id], load);
onMounted(load);
onUnmounted(() => {
  generation++;
  controller?.abort();
  data.value.items = [];
  revealed.value.clear();
  revealedDetails.value = {};
});
</script>
<template>
  <main class="workspace">
    <form v-if="activity?.priceCents === 0" class="action-row" @submit.prevent="applyFilters">
      <input v-model="searchDraft" maxlength="80" aria-label="搜索报名人" placeholder="姓名或完整手机号" />
      <select v-model="statusDraft" aria-label="报名状态">
        <option value="">全部状态</option>
        <option value="CONFIRMED">已报名</option>
        <option value="CANCELLED">已取消</option>
      </select>
      <button class="secondary" :disabled="busy">查询</button>
      <button type="button" class="secondary" :disabled="busy || exporting || !data.total" @click="downloadRoster">{{ exporting ? "正在导出…" : "导出筛选结果（脱敏）" }}</button>
    </form>
    <p v-if="exportError" role="alert" class="error-box">{{ exportError }}</p>
    <RouterLink class="back-link" to="/activities"
      ><AppIcon name="back" :size="16" /> 返回活动目录</RouterLink
    >
    <section class="page-heading">
      <div>
        <h1>报名名单</h1>
        <p class="muted">
          {{ activity?.title || "报名名单" }}
          <span v-if="activity"
            >· {{ activity.priceCents > 0 ? "名额占用 " : ""
            }}{{ activity.registeredCount }} / {{ activity.capacity }} 人</span
          >
        </p>
      </div>
      <RouterLink
        v-if="activity"
        class="secondary button"
        :to="`/activities/${activity.id}/edit`"
        >查看活动</RouterLink
      >
    </section>
    <div class="privacy-note">
      报名资料仅用于活动核验与联系。请勿公开、截图或用于无关营销。
    </div>
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <UiState v-if="busy" kind="loading" compact>正在读取报名名单…</UiState>
    <div
      v-else-if="activity && activity.priceCents > 0 && !error"
      class="empty-state"
    >
      <h3>收费活动名单在活动订单</h3>
      <p>
        名额包含待付款订单，请在活动订单中区分未付款与已确认，并查看各单参加者。
      </p>
      <RouterLink
        class="primary button"
        :to="{ path: '/activity-orders', query: { activityId: activity.id } }"
        >查看此活动收费名单</RouterLink
      >
    </div>
    <UiState v-else-if="!data.items.length && !error" compact
      >{{ filters.query || filters.status ? "没有符合条件的报名记录" : "还没有人报名" }}</UiState
    >
    <div v-else-if="!error" class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>参与者</th>
            <th>身份证号</th>
            <th>联系方式</th>
            <th>报名时间 / 北京时间</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody v-for="item in data.items" :key="item.id">
          <tr
            v-for="(participant, index) in item.participants"
            :key="participant.id"
          >
            <td>
              <strong>{{ participant.participantName }}</strong>
              <span v-if="index === 0" class="muted">
                · 本单 {{ item.participants.length }} 人</span
              >
            </td>
            <td>
              {{
                revealed.has(participant.id)
                  ? (revealedDetails[participant.id]?.idNumber || "未登记")
                  : maskIdNumber(participant.idNumber)
              }}
            </td>
            <td>
              <span>{{
                revealed.has(participant.id)
                  ? revealedDetails[participant.id]?.phone
                  : maskPhone(participant.phone)
              }}</span
              ><button
                class="text-button phone-toggle"
                :disabled="revealing.has(participant.id)"
                @click="toggle(participant.id, participant.participantName)"
              >
                {{ revealing.has(participant.id) ? "读取中…" : revealed.has(participant.id) ? "隐藏" : "查看" }}
              </button>
            </td>
            <td v-if="index === 0" :rowspan="item.participants.length">
              {{ displayDate(item.createdAt) }}
            </td>
            <td v-if="index === 0" :rowspan="item.participants.length">
              <span
                class="status-pill inline"
                :class="`tone-${registrationTone(item.status)}`"
                >{{ item.status === "CONFIRMED" ? "已报名" : "已取消" }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar v-if="activity && activity.priceCents === 0" :page="page" :page-size="data.size" :total="data.total" :has-more="data.hasMore" :busy="busy" label="名单分页" @change="(next) => page = next" />
    <ConfirmDialog
      v-if="revealTarget"
      title="查看参加者资料？"
      :description="`将显示「${revealTarget.name}」的联系方式与证件资料，仅用于报名核验及联系，操作会写入审计记录。`"
      confirm-label="确认查看"
      @cancel="revealTarget = null"
      @confirm="confirmReveal"
    />
  </main>
</template>
