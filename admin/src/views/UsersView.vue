<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { readListSearch, rememberListSearch } from "../listSearchContext";
import PaginationBar from "../components/PaginationBar.vue";
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import {
  ApiError,
  clearSession,
  currentUser,
  errorMessage,
  request,
  updateAdminUserRole,
} from "../api";
import {
  activityOrderLabels,
  type AdminUser,
  type AdminUserDetail,
  type Page,
  type Registration,
  type RegistrationStatus,
  type User,
} from "../types";
import {
  activityOrderTone,
  profileTone,
  registrationTone,
  roleTone,
} from "../statusTone";
import UiState from "../components/UiState.vue";
import FormModal from "../components/FormModal.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";

const sourceLabels: Record<AdminUser["accountSource"], string> = {
  WECHAT: "微信登录",
  PASSWORD: "管理员密码账号",
  DEMO: "开发演示账号",
  OTHER: "其他来源",
};
const roleLabels = { USER: "普通用户", ADMIN: "管理员" };
const route = inject(routeLocationKey, null);
const router = inject(routerKey, null);
function allowedFilter(value: unknown, options: string[]) {
  return typeof value === "string" && options.includes(value) ? value : "";
}
const rememberedSearch = readListSearch(currentUser.value, "users");
const initialProfile = allowedFilter(route?.query.profile, [
  "COMPLETE",
  "INCOMPLETE",
]);
const initialRole = allowedFilter(route?.query.role, Object.keys(roleLabels));
const initialSource = allowedFilter(
  route?.query.source,
  Object.keys(sourceLabels),
);
const wantedPage = Number(route?.query.page);
const initialPage =
  rememberedSearch?.page ??
  (Number.isSafeInteger(wantedPage) && wantedPage > 0 && wantedPage <= 100001
    ? wantedPage - 1
    : 0);
function registrationLabel(registration: Registration) {
  if (registration.source === "ACTIVITY_ORDER" && registration.orderStatus)
    return activityOrderLabels[registration.orderStatus];
  if (registration.status === "PENDING_PAYMENT") return "待支付（名额保留）";
  return registration.status === "CONFIRMED" ? "有效报名" : "已取消";
}
function registrationBadgeTone(registration: Registration) {
  if (registration.source === "ACTIVITY_ORDER" && registration.orderStatus)
    return `tone-${activityOrderTone(registration.orderStatus)}`;
  return `tone-${registrationTone(registration.status)}`;
}
const items = ref<AdminUser[]>([]),
  loading = ref(false),
  error = ref(""),
  notice = ref(""),
  page = ref(0),
  total = ref(0),
  hasMore = ref(false),
  query = ref(rememberedSearch?.query ?? ""),
  profile = ref(initialProfile),
  role = ref(initialRole),
  accountSource = ref(initialSource),
  queryDraft = ref(query.value),
  profileDraft = ref(initialProfile),
  roleDraft = ref(initialRole),
  sourceDraft = ref(initialSource);
const detail = ref<AdminUserDetail | null>(null),
  detailId = ref(""),
  detailLoading = ref(false),
  detailError = ref(""),
  detailStatus = ref<RegistrationStatus | "">(""),
  detailTab = ref<"profile" | "history">("profile"),
  roleBusy = ref(false),
  roleBlocked = ref(false),
  roleError = ref("");
const pendingRole = ref<{
  user: AdminUser;
  role: AdminUser["role"];
  actor: User;
  session: number;
  detailEpoch: number;
} | null>(null);
let alive = true,
  session = 0,
  epoch = 0,
  detailEpoch = 0;
const interactionLocked = computed(() => roleBusy.value || !!pendingRole.value);
const hasFilters = computed(() =>
  Boolean(
    query.value ||
    profile.value ||
    role.value ||
    accountSource.value ||
    queryDraft.value.trim() ||
    profileDraft.value ||
    roleDraft.value ||
    sourceDraft.value,
  ),
);
const roleDescription = computed(() => {
  const pending = pendingRole.value;
  if (!pending) return "";
  const target = `「${pending.user.nickname || "未设置昵称"}」（用户编号 ${pending.user.id}，微信登录）`;
  return pending.role === "ADMIN"
    ? `将${target}设为管理员。该账号将可管理活动、报名名单、商品、订单和用户权限。其现有登录会话将失效，需重新微信登录后使用新权限；用户资料与历史报名保留。`
    : `撤销${target}的管理员权限，恢复为普通用户。其现有登录会话将失效，不能再管理活动、商品、订单及用户权限；用户资料与历史报名保留。`;
});
function active(n: number, actor: User | null) {
  return (
    alive &&
    n === session &&
    actor === currentUser.value &&
    actor?.role === "ADMIN"
  );
}
function accessFailed(reason: unknown) {
  if (
    reason instanceof ApiError &&
    [401, 403].includes(reason.status) &&
    reason.code !== "ROLE_MANAGEMENT_FORBIDDEN"
  ) {
    clearSession();
    return true;
  }
  return false;
}
function clear() {
  session++;
  epoch++;
  detailEpoch++;
  items.value = [];
  detail.value = null;
  detailId.value = "";
  pendingRole.value = null;
  loading.value = detailLoading.value = roleBusy.value = false;
  roleBlocked.value = false;
  error.value = detailError.value = roleError.value = notice.value = "";
  query.value = queryDraft.value = profile.value = profileDraft.value = "";
  role.value = roleDraft.value = accountSource.value = sourceDraft.value = "";
  page.value = total.value = 0;
  hasMore.value = false;
}
watch(
  currentUser,
  () => {
    clear();
    if (alive && currentUser.value?.role === "ADMIN") void load();
  },
  { flush: "sync" },
);
onUnmounted(() => {
  alive = false;
  clear();
});
onMounted(() => void load(initialPage));

async function load(next = 0) {
  const actor = currentUser.value,
    identity = session;
  if (loading.value || interactionLocked.value || !active(identity, actor))
    return;
  const n = ++epoch;
  loading.value = true;
  error.value = "";
  let clampTo: number | null = null;
  try {
    const params = new URLSearchParams({
      page: String(next),
      size: "8",
      query: query.value,
      profile: profile.value,
      role: role.value,
      accountSource: accountSource.value,
    });
    const result = await request<Page<AdminUser>>(`/admin/users?${params}`, {
      cache: "no-store",
    });
    if (n !== epoch || !active(identity, actor)) return;
    items.value = result.items;
    page.value = result.page;
    total.value = result.total;
    hasMore.value = result.hasMore;
    if (actor) rememberListSearch(actor, "users", query.value, result.page);
    // 页码超界时收敛回最后一页（对齐商品分类的做法，避免停留在空白页）。
    const lastPage = Math.max(
      0,
      Math.ceil(result.total / Math.max(1, result.size || 8)) - 1,
    );
    if (!result.items.length && next > lastPage) clampTo = lastPage;
    else if (router && route) {
      void router.replace({
        query: {
          ...route.query,
          profile: profile.value || undefined,
          role: role.value || undefined,
          source: accountSource.value || undefined,
          page:
            !query.value && result.page ? String(result.page + 1) : undefined,
        },
      });
    }
  } catch (reason) {
    if (n === epoch && active(identity, actor) && !accessFailed(reason))
      error.value = errorMessage(reason);
  } finally {
    if (n === epoch && active(identity, actor)) loading.value = false;
  }
  if (clampTo !== null && n === epoch && active(identity, actor))
    void load(clampTo);
}
function applyFilters() {
  if (loading.value || interactionLocked.value) return;
  query.value = queryDraft.value.trim();
  profile.value = profileDraft.value;
  role.value = roleDraft.value;
  accountSource.value = sourceDraft.value;
  void load();
}
function resetFilters() {
  queryDraft.value =
    profileDraft.value =
    roleDraft.value =
    sourceDraft.value =
      "";
  applyFilters();
}
function openUser(user: AdminUser) {
  if (!active(session, currentUser.value) || interactionLocked.value) return;
  detailEpoch++;
  detail.value = null;
  detailLoading.value = false;
  detailId.value = user.id;
  detailStatus.value = "";
  detailTab.value = "profile";
  roleBlocked.value = false;
  detailError.value = roleError.value = notice.value = "";
  void loadDetail();
}
function closeUser() {
  if (interactionLocked.value) return;
  detailEpoch++;
  detail.value = null;
  detailId.value = "";
  detailLoading.value = false;
  detailError.value = roleError.value = "";
}
async function loadDetail(next = 0) {
  const id = detailId.value,
    actor = currentUser.value,
    identity = session;
  if (
    !id ||
    detailLoading.value ||
    interactionLocked.value ||
    !active(identity, actor)
  )
    return;
  const n = ++detailEpoch;
  detailLoading.value = true;
  detailError.value = "";
  try {
    const result = await request<AdminUserDetail>(
      `/admin/users/${encodeURIComponent(id)}?page=${next}&size=4&status=${detailStatus.value}`,
      { cache: "no-store" },
    );
    if (n !== detailEpoch || !active(identity, actor) || result.user.id !== id)
      return;
    detail.value = result;
    items.value = items.value.map((user) =>
      user.id === id ? result.user : user,
    );
    roleBlocked.value = false;
    roleError.value = "";
  } catch (reason) {
    if (n === detailEpoch && active(identity, actor) && !accessFailed(reason))
      detailError.value = errorMessage(reason);
  } finally {
    if (n === detailEpoch && active(identity, actor))
      detailLoading.value = false;
  }
}
function canChangeRole(user: AdminUser) {
  return (
    user.accountSource === "WECHAT" &&
    user.wechatVerified === true &&
    user.canChangeRole === true &&
    user.id !== currentUser.value?.id &&
    Number.isInteger(user.version) &&
    user.version >= 0 &&
    (user.role === "USER" || user.role === "ADMIN")
  );
}
function roleBlockReason(user: AdminUser) {
  if (user.id === currentUser.value?.id)
    return "当前登录账号不能在此修改自己的角色，请由另一位管理员操作。";
  if (user.accountSource !== "WECHAT" || !user.wechatVerified)
    return "仅经验证的真实微信登录用户可设置或撤销管理员；密码、开发演示及其他来源账号不能在此修改。";
  if (user.roleChangeBlockReason === "LAST_ADMIN_REQUIRED")
    return "需保留至少一个可登录的管理员账号。";
  if (user.roleChangeBlockReason === "ROLE_MANAGEMENT_FORBIDDEN")
    return "当前账号只可查看用户。请使用正式管理员密码账号或已验证的微信管理员账号登录后管理权限；其他管理功能不受影响。";
  return "此账号当前不能修改角色，请重新读取最新资料后核对。";
}
function prepareRole() {
  const user = detail.value?.user,
    actor = currentUser.value;
  if (
    !user ||
    !actor ||
    !active(session, actor) ||
    !canChangeRole(user) ||
    detailLoading.value ||
    roleBlocked.value ||
    interactionLocked.value
  )
    return;
  roleError.value = notice.value = "";
  pendingRole.value = {
    user: { ...user },
    role: user.role === "ADMIN" ? "USER" : "ADMIN",
    actor,
    session,
    detailEpoch,
  };
}
function cancelRole() {
  if (!roleBusy.value) pendingRole.value = null;
}
async function confirmRole() {
  const pending = pendingRole.value;
  if (
    !pending ||
    roleBusy.value ||
    roleBlocked.value ||
    !active(pending.session, pending.actor) ||
    pending.detailEpoch !== detailEpoch ||
    detail.value?.user.id !== pending.user.id ||
    !canChangeRole(detail.value.user) ||
    detail.value.user.version !== pending.user.version
  )
    return;
  roleBusy.value = true;
  try {
    const result = await updateAdminUserRole(pending.user.id, {
      role: pending.role,
      version: pending.user.version,
    });
    if (
      !active(pending.session, pending.actor) ||
      pending.detailEpoch !== detailEpoch
    )
      return;
    if (result.id !== pending.user.id || result.role !== pending.role)
      throw new Error("角色更新响应无法核对，请重新读取该用户资料。");
    detail.value = { ...detail.value!, user: result };
    items.value = items.value.map((user) =>
      user.id === result.id ? result : user,
    );
    pendingRole.value = null;
    notice.value = `${result.nickname || "该用户"}已${result.role === "ADMIN" ? "设为管理员" : "恢复为普通用户"}。该账号需重新微信登录，资料与历史报名保留。`;
    roleBusy.value = false;
    void load(page.value);
  } catch (reason) {
    if (
      !active(pending.session, pending.actor) ||
      pending.detailEpoch !== detailEpoch
    )
      return;
    if (accessFailed(reason)) return;
    pendingRole.value = null;
    roleBlocked.value = true;
    if (
      reason instanceof ApiError &&
      reason.code === "ROLE_MANAGEMENT_FORBIDDEN" &&
      detail.value
    )
      detail.value = {
        ...detail.value,
        user: {
          ...detail.value.user,
          canChangeRole: false,
          roleChangeBlockReason: "ROLE_MANAGEMENT_FORBIDDEN",
        },
      };
    roleError.value =
      reason instanceof ApiError && reason.code === "STALE_VERSION"
        ? "用户角色已在其他会话更新。本次未覆盖；请重新读取最新资料，核对后再次确认。"
        : !(reason instanceof ApiError) ||
            reason.status === 0 ||
            reason.status >= 500
          ? "角色变更结果尚未确认，请重新读取最新资料后核对；不会自动重发。"
          : `${errorMessage(reason)} 请重新读取该用户资料后核对；不会自动覆盖。`;
  } finally {
    if (active(pending.session, pending.actor)) roleBusy.value = false;
  }
}
function dateTime(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
}
useForegroundRefresh(() => {
  if (loading.value || interactionLocked.value) return;
  if (!detailId.value) void load(page.value);
  else if (!detailLoading.value && !roleBlocked.value)
    void loadDetail(detail.value?.registrations.page || 0);
});
</script>

<template>
  <main class="workspace">
    <header class="page-heading"><h1>用户管理</h1></header>
    <form
      class="list-filters"
      role="search"
      aria-label="筛选用户"
      @submit.prevent="applyFilters"
    >
      <input
        v-model="queryDraft"
        name="userQuery"
        type="search"
        maxlength="80"
        aria-label="昵称、姓名、用户编号或完整手机号"
        placeholder="昵称、姓名、编号或完整手机号"
      />
      <select
        v-model="profileDraft"
        name="profile"
        aria-label="资料状态"
        @change="applyFilters"
      >
        <option value="">全部资料状态</option>
        <option value="COMPLETE">资料已完善</option>
        <option value="INCOMPLETE">资料未完善</option>
      </select>
      <select
        v-model="roleDraft"
        name="role"
        aria-label="角色"
        @change="applyFilters"
      >
        <option value="">全部角色</option>
        <option value="USER">普通用户</option>
        <option value="ADMIN">管理员</option>
      </select>
      <select
        v-model="sourceDraft"
        name="accountSource"
        aria-label="账号来源"
        @change="applyFilters"
      >
        <option value="">全部来源</option>
        <option v-for="(label, key) in sourceLabels" :key="key" :value="key">
          {{ label }}
        </option>
      </select>
      <button type="submit" class="secondary" :disabled="loading">查询</button>
      <button
        v-if="hasFilters && (items.length || error)"
        type="button"
        class="text-button"
        :disabled="loading"
        @click="resetFilters"
      >
        清除筛选
      </button>
    </form>
    <p class="privacy-note">
      用户资料默认脱敏。完整联系方式请到对应活动名单核验。
    </p>
    <p v-if="notice && !detailId" class="success-box" role="status">
      {{ notice }}
    </p>
    <p v-if="error" class="error-box" role="alert">
      {{ error
      }}<button
        class="text-button"
        :disabled="loading || interactionLocked"
        @click="load(page)"
      >
        重试
      </button>
    </p>
    <UiState v-if="loading && !items.length" kind="loading" compact
      >正在读取用户…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact>
      {{
        query || profile || role || accountSource
          ? "没有匹配的用户"
          : "暂无用户"
      }}
      <button
        v-if="hasFilters"
        type="button"
        class="text-button"
        @click="resetFilters"
      >
        清除筛选
      </button>
    </UiState>
    <div v-if="items.length" class="table-scroll" :aria-busy="loading">
      <table class="users-table record-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader">用户</th>
            <th role="columnheader">联系资料 · 已脱敏</th>
            <th role="columnheader">账号来源 / 角色</th>
            <th role="columnheader">报名记录</th>
            <th role="columnheader">注册时间 · 北京时间</th>
            <th role="columnheader">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr role="row" v-for="user in items" :key="user.id">
            <td role="cell" data-cell="title">
              <strong>{{ user.nickname || "未设置昵称" }}</strong
              ><br /><span class="record-id" :title="user.id">{{
                user.id
              }}</span>
            </td>
            <td role="cell" data-label="资料">
              {{ user.realName || "姓名未填写" }} ·
              {{ user.phone || "手机号未填写" }}<br /><span
                class="status-badge"
                :class="`tone-${profileTone(user.profileCompleted)}`"
                >{{ user.profileCompleted ? "资料已完善" : "资料未完善" }}</span
              >
            </td>
            <td role="cell" data-label="来源与角色">
              {{ sourceLabels[user.accountSource] || "其他来源" }}<br /><span
                class="status-badge"
                :class="`tone-${roleTone(user.role)}`"
                >{{ roleLabels[user.role] || "未知角色" }}</span
              >
            </td>
            <td role="cell" data-label="报名">
              有效 {{ user.confirmedRegistrationCount }} / 全部
              {{ user.registrationCount }}
              <template v-if="user.pendingRegistrationCount != null">
                · 待支付 {{ user.pendingRegistrationCount }}
              </template>
            </td>
            <td role="cell" data-label="注册时间">
              {{ dateTime(user.createdAt) }}
            </td>
            <td role="cell" data-cell="actions">
              <button
                class="text-button"
                :disabled="interactionLocked"
                @click="openUser(user)"
              >
                查看用户
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      :page-size="8"
      :has-more="hasMore"
      :busy="loading || interactionLocked"
      :page="page"
      :total="total"
      label="用户分页"
      @change="load"
    />

    <FormModal
      v-if="detailId"
      size="lg"
      class="user-detail-dialog"
      @close="closeUser"
      ><template #title><h2>用户详情</h2></template>
      <div aria-label="用户详情">
        <p class="record-id">
          {{ detail?.user.nickname || "正在读取用户" }} · 用户编号：{{
            detailId
          }}
        </p>
        <RouterLink
          v-if="detail"
          class="text-button"
          :to="{ path: '/memberships', query: { userId: detailId } }"
          >管理会员身份</RouterLink
        >
        <nav class="user-detail-tabs" aria-label="用户详情视图">
          <button
            :class="{ primary: detailTab === 'profile' }"
            :aria-pressed="detailTab === 'profile'"
            :disabled="interactionLocked"
            @click="detailTab = 'profile'"
          >
            资料与权限</button
          ><button
            :class="{ primary: detailTab === 'history' }"
            :aria-pressed="detailTab === 'history'"
            :disabled="interactionLocked"
            @click="detailTab = 'history'"
          >
            报名历史<template v-if="detail">
              · {{ detail.user.registrationCount }}</template
            >
          </button>
        </nav>
        <UiState v-if="detailLoading && !detail" kind="loading" compact
          >正在读取用户详情…</UiState
        >
        <p v-if="detailError" class="error-box" role="alert">
          {{ detailError
          }}<button
            class="text-button"
            :disabled="detailLoading || interactionLocked"
            @click="loadDetail(detail?.registrations.page || 0)"
          >
            重试
          </button>
        </p>
        <template v-if="detail">
          <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
          <section v-if="detailTab === 'profile'" aria-label="用户资料与权限">
            <dl class="user-detail-grid">
              <div>
                <dt>本人姓名 · 已脱敏</dt>
                <dd>{{ detail.user.realName || "未填写" }}</dd>
              </div>
              <div>
                <dt>联系手机号 · 已脱敏</dt>
                <dd>{{ detail.user.phone || "未填写" }}</dd>
              </div>
              <div>
                <dt>资料状态</dt>
                <dd>
                  {{ detail.user.profileCompleted ? "已完善" : "未完善" }}
                </dd>
              </div>
              <div>
                <dt>账号来源</dt>
                <dd>
                  {{ sourceLabels[detail.user.accountSource] || "其他来源" }}
                </dd>
              </div>
              <div>
                <dt>当前角色</dt>
                <dd>{{ roleLabels[detail.user.role] || "未知角色" }}</dd>
              </div>
              <div>
                <dt>注册时间 · 北京时间</dt>
                <dd>{{ dateTime(detail.user.createdAt) }}</dd>
              </div>
              <div>
                <dt>资料更新时间</dt>
                <dd>{{ dateTime(detail.user.profileUpdatedAt) }}</dd>
              </div>
              <div>
                <dt>最近报名</dt>
                <dd>{{ dateTime(detail.user.lastRegistrationAt) }}</dd>
              </div>
            </dl>
            <div class="user-role-section">
              <h3>权限管理</h3>
              <p class="muted">
                管理员可管理活动、报名名单、商品、订单和用户权限；角色变更后，该用户需重新微信登录。
              </p>
              <p v-if="roleError" class="error-box" role="alert">
                {{ roleError
                }}<button
                  class="text-button"
                  :disabled="detailLoading || interactionLocked"
                  @click="loadDetail(detail.registrations.page)"
                >
                  核对角色状态
                </button>
              </p>
              <button
                v-if="canChangeRole(detail.user)"
                :class="detail.user.role === 'ADMIN' ? 'danger' : 'primary'"
                :disabled="detailLoading || interactionLocked || roleBlocked"
                @click="prepareRole"
              >
                {{ detail.user.role === "ADMIN" ? "撤销管理员" : "设为管理员" }}
              </button>
              <p v-else class="privacy-note">
                {{ roleBlockReason(detail.user) }}
              </p>
            </div>
          </section>
          <section v-else aria-label="用户报名历史">
            <div class="section-heading">
              <h3>报名历史 · 资料已脱敏</h3>
              <label class="user-history-filter"
                >状态<select
                  v-model="detailStatus"
                  name="registrationStatus"
                  :disabled="detailLoading || interactionLocked"
                  @change="loadDetail()"
                >
                  <option value="">全部</option>
                  <option value="CONFIRMED">有效报名</option>
                  <option value="PENDING_PAYMENT">待支付</option>
                  <option value="CANCELLED">已取消</option>
                </select></label
              >
            </div>
            <UiState
              v-if="!detail.registrations.items.length && !detailLoading"
              kind="empty"
              compact
              >暂无匹配的报名记录，可切换状态查看。</UiState
            >
            <div v-else class="user-history" :aria-busy="detailLoading">
              <article
                v-for="registration in detail.registrations.items"
                :key="registration.id"
              >
                <div class="section-heading">
                  <strong>{{ registration.activityTitle }}</strong
                  ><span
                    class="status-badge"
                    :class="registrationBadgeTone(registration)"
                    >{{ registrationLabel(registration) }}</span
                  >
                </div>
                <p class="muted">
                  {{ dateTime(registration.createdAt) }} ·
                  {{ registration.participants.length }} 位参与人
                </p>
                <p
                  v-for="participant in registration.participants"
                  :key="participant.id"
                >
                  {{ participant.participantName }} · {{ participant.phone
                  }}<template v-if="participant.idNumber">
                    · 证件已脱敏</template
                  >
                </p>
                <RouterLink
                  class="text-button button"
                  :to="
                    registration.source === 'ACTIVITY_ORDER'
                      ? {
                          path: '/activity-orders',
                          query: {
                            activityId: registration.activityId,
                            orderId: registration.id,
                          },
                        }
                      : `/activities/${encodeURIComponent(registration.activityId)}/registrations`
                  "
                  >{{
                    registration.source === "ACTIVITY_ORDER"
                      ? "查看此活动订单"
                      : "查看活动名单"
                  }}</RouterLink
                >
              </article>
            </div>
            <nav
              v-if="detail.registrations.total > detail.registrations.size"
              class="pagination"
              aria-label="报名历史分页"
            >
              <span
                >第 {{ detail.registrations.page + 1 }} 页 · 共
                {{ detail.registrations.total }} 条</span
              >
              <div class="action-row">
                <button
                  :disabled="detailLoading || detail.registrations.page === 0"
                  @click="loadDetail(detail.registrations.page - 1)"
                >
                  上一页</button
                ><button
                  :disabled="detailLoading || !detail.registrations.hasMore"
                  @click="loadDetail(detail.registrations.page + 1)"
                >
                  下一页
                </button>
              </div>
            </nav>
          </section>
        </template>
      </div>
      <div class="dialog-actions">
        <button
          class="secondary"
          :disabled="interactionLocked"
          @click="closeUser"
        >
          关闭
        </button>
      </div>
    </FormModal>
    <ConfirmDialog
      v-if="pendingRole"
      :title="
        pendingRole.role === 'ADMIN' ? '设为管理员？' : '撤销管理员权限？'
      "
      :description="roleDescription"
      :confirm-label="
        pendingRole.role === 'ADMIN' ? '确认设为管理员' : '确认撤销管理员'
      "
      :danger="pendingRole.role === 'USER'"
      :busy="roleBusy"
      @cancel="cancelRole"
      @confirm="confirmRole"
    />
  </main>
</template>
