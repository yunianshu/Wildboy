<script setup lang="ts">
import { computed, inject, ref, onMounted, onUnmounted, watch } from "vue";
import { routeLocationKey } from "vue-router";
import { request, errorMessage, currentUser } from "../api";
import { displayDate } from "../forms";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import type { Activity, Registration, Page } from "../types";
import { registrationTone } from "../statusTone";
import { useRosterExport } from "../rosterExport";
const props = defineProps<{ scope?: { id: string; title?: string } }>();
const route = inject(routeLocationKey, null),
  activityId = computed(() => props.scope?.id ?? String(route?.params.id ?? "")),
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
  filters.value = {
    query: searchDraft.value.trim(),
    status: statusDraft.value,
  };
  if (page.value) page.value = 0;
  else void load();
}
function clearFilters() {
  searchDraft.value = statusDraft.value = "";
  applyFilters();
}
const { exporting, exportError, downloadRoster, resetExport } =
  useRosterExport();
let generation = 0,
  controller: AbortController | undefined;
async function load() {
  const current = ++generation;
  controller?.abort();
  resetExport();
  controller = new AbortController();
  busy.value = true;
  error.value = "";
  revealed.value = new Set();
  revealTarget.value = null;
  revealedDetails.value = {};
  try {
    const id = encodeURIComponent(activityId.value);
    const details = await request<Activity>(`/admin/activities/${id}`, {
      signal: controller.signal,
    });
    if (current !== generation) return;
    activity.value = details;
    if (details.priceCents > 0) {
      data.value = { items: [], total: 0, page: 0, size: 20, hasMore: false };
      return;
    }
    const params = new URLSearchParams({
      page: String(page.value),
      size: "20",
    });
    for (const [key, value] of Object.entries(filters.value))
      if (value) params.set(key, value);
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
      `/admin/activities/${encodeURIComponent(activityId.value)}/participants/${encodeURIComponent(id)}/reveal`,
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
});
watch(activityId, () => {
  if (page.value !== 0) page.value = 0;
  else void load();
});
watch(page, load);
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
  <component :is="scope ? 'div' : 'main'" :class="scope ? 'roster-embedded' : 'workspace'">
    <section class="page-heading">
      <div>
        <h1 v-if="!scope">报名名单</h1>
        <p v-if="activity" class="muted">
          <template v-if="!scope">{{ activity.title }} · </template
          >{{ activity.priceCents > 0 ? "名额占用 " : ""
          }}{{ activity.registeredCount }} / {{ activity.capacity }} 人
        </p>
      </div>
      <div class="action-row">
        <RouterLink v-if="!scope" class="secondary button" to="/activities">
          <AppIcon name="back" :size="16" /> 返回活动目录
        </RouterLink>
        <RouterLink
          v-if="activity && !scope"
          class="secondary button"
          :to="`/activities/${activity.id}/edit`"
        >
          查看活动
        </RouterLink>
        <button
          v-if="activity?.priceCents === 0 && currentUser?.role === 'ADMIN'"
          type="button"
          class="primary"
          :disabled="busy || exporting || !!error || !data.total"
          @click="downloadRoster(activity.id, activity.title, filters)"
        >
          {{ exporting ? "正在导出…" : "导出名单" }}
        </button>
      </div>
    </section>
    <form
      v-if="activity?.priceCents === 0"
      class="list-filters"
      role="search"
      aria-label="筛选报名名单"
      @submit.prevent="applyFilters"
    >
      <input
        v-model="searchDraft"
        type="search"
        maxlength="80"
        aria-label="搜索报名人"
        placeholder="姓名或完整手机号"
      />
      <select
        v-model="statusDraft"
        aria-label="报名状态"
        @change="applyFilters"
      >
        <option value="">全部报名状态</option>
        <option value="CONFIRMED">已报名</option>
        <option value="CANCELLED">已取消</option>
      </select>
      <button type="submit" class="secondary" :disabled="busy">查询</button>
      <button
        v-if="(filters.query || filters.status) && (data.items.length || error)"
        type="button"
        class="text-button"
        :disabled="busy"
        @click="clearFilters"
      >
        清除筛选
      </button>
    </form>
    <p v-if="exportError" role="alert" class="error-box">{{ exportError }}</p>
    <p v-if="data.items.length" class="privacy-note">
      报名资料仅用于活动核验与联系。请勿公开、截图或用于无关营销。
    </p>
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <UiState v-if="busy" kind="loading" compact>正在读取报名名单…</UiState>
    <div
      v-else-if="activity && activity.priceCents > 0 && !error"
      class="empty-state"
    >
      <h2>收费活动名单在活动订单</h2>
      <p>前往活动订单，区分未付款与已确认的报名。</p>
      <RouterLink
        class="primary button"
        :to="{ path: '/activity-orders', query: { activityId: activity.id } }"
        >查看此活动收费名单</RouterLink
      >
    </div>
    <UiState v-else-if="!data.items.length && !error" compact>
      {{
        filters.query || filters.status
          ? "没有符合条件的报名记录"
          : "还没有人报名"
      }}
      <button
        v-if="filters.query || filters.status"
        type="button"
        class="text-button"
        @click="clearFilters"
      >
        清除筛选
      </button>
    </UiState>
    <div v-else-if="!error" class="table-scroll">
      <table
        class="record-table roster-table"
        role="table"
        aria-label="报名记录"
      >
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">参与者</th>
            <th scope="col" role="columnheader">身份证号</th>
            <th scope="col" role="columnheader">联系方式</th>
            <th scope="col" role="columnheader">报名时间 / 北京时间</th>
            <th scope="col" role="columnheader">状态</th>
          </tr>
        </thead>
        <tbody v-for="item in data.items" :key="item.id" role="rowgroup">
          <tr
            v-for="(participant, index) in item.participants"
            :key="participant.id"
            role="row"
          >
            <td role="cell" data-cell="title">
              <strong>{{ participant.participantName }}</strong>
              <span v-if="index === 0" class="muted">
                · 本单 {{ item.participants.length }} 人</span
              >
              <div v-if="participant.boardingPoint" class="muted">
                上车地点 · {{ participant.boardingPoint }}
              </div>
            </td>
            <td role="cell" data-label="身份证号">
              {{
                revealed.has(participant.id)
                  ? revealedDetails[participant.id]?.idNumber || "未登记"
                  : maskIdNumber(participant.idNumber)
              }}
            </td>
            <td role="cell" data-label="联系方式">
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
                {{
                  revealing.has(participant.id)
                    ? "读取中…"
                    : revealed.has(participant.id)
                      ? "隐藏"
                      : "查看"
                }}
              </button>
            </td>
            <td
              v-if="index === 0"
              :rowspan="item.participants.length"
              role="cell"
              data-label="报名时间"
            >
              {{ displayDate(item.createdAt) }}
            </td>
            <td
              v-if="index === 0"
              :rowspan="item.participants.length"
              role="cell"
              data-label="状态"
            >
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
    <PaginationBar
      v-if="activity && activity.priceCents === 0"
      :page="page"
      :page-size="data.size"
      :total="data.total"
      :has-more="data.hasMore"
      :busy="busy"
      label="名单分页"
      @change="(next) => (page = next)"
    />
    <ConfirmDialog
      v-if="revealTarget"
      title="查看参加者资料？"
      :description="`将显示「${revealTarget.name}」的联系方式与证件资料，仅用于报名核验及联系，操作会写入审计记录。`"
      confirm-label="确认查看"
      @cancel="revealTarget = null"
      @confirm="confirmReveal"
    />
  </component>
</template>
<style scoped>
.roster-embedded {
  display: grid;
  gap: 14px;
}
.roster-embedded .page-heading {
  margin-bottom: 0;
}
@media (max-width: 720px) {
  .roster-table tbody td[data-label="身份证号"],
  .roster-table tbody td[data-label="联系方式"] {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .roster-table tbody td[data-label="身份证号"]::before,
  .roster-table tbody td[data-label="联系方式"]::before {
    flex: 0 0 60px;
    margin: 0;
  }
  .roster-table .phone-toggle {
    margin-left: auto;
  }
}
</style>
