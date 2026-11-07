<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import {
  ApiError,
  clearSession,
  currentUser,
  errorMessage,
  request,
  updateAdminUserRole,
} from "../api";
import type {
  AdminUser,
  AdminUserDetail,
  Page,
  RegistrationStatus,
  User,
} from "../types";
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
const items = ref<AdminUser[]>([]),
  loading = ref(false),
  error = ref(""),
  notice = ref(""),
  page = ref(0),
  total = ref(0),
  hasMore = ref(false),
  query = ref(""),
  profile = ref(""),
  role = ref(""),
  accountSource = ref(""),
  filterOpen = ref(false),
  queryDraft = ref(""),
  profileDraft = ref(""),
  roleDraft = ref(""),
  sourceDraft = ref("");
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
const filterSummary = computed(() =>
  [
    query.value ? `搜索：${query.value}` : "全部用户",
    profile.value
      ? profile.value === "COMPLETE"
        ? "资料已完善"
        : "资料未完善"
      : "",
    role.value ? roleLabels[role.value as AdminUser["role"]] : "",
    accountSource.value
      ? sourceLabels[accountSource.value as AdminUser["accountSource"]]
      : "",
  ]
    .filter(Boolean)
    .join(" · "),
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
  roleBlocked.value = filterOpen.value = false;
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
onMounted(() => void load());

async function load(next = 0) {
  const actor = currentUser.value,
    identity = session;
  if (loading.value || interactionLocked.value || !active(identity, actor))
    return;
  const n = ++epoch;
  loading.value = true;
  error.value = "";
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
  } catch (reason) {
    if (n === epoch && active(identity, actor) && !accessFailed(reason))
      error.value = errorMessage(reason);
  } finally {
    if (n === epoch && active(identity, actor)) loading.value = false;
  }
}
function openFilters() {
  if (loading.value || interactionLocked.value) return;
  queryDraft.value = query.value;
  profileDraft.value = profile.value;
  roleDraft.value = role.value;
  sourceDraft.value = accountSource.value;
  filterOpen.value = true;
}
function applyFilters() {
  if (loading.value || interactionLocked.value) return;
  query.value = queryDraft.value.trim();
  profile.value = profileDraft.value;
  role.value = roleDraft.value;
  accountSource.value = sourceDraft.value;
  filterOpen.value = false;
  void load();
}
function resetFilters() {
  queryDraft.value =
    profileDraft.value =
    roleDraft.value =
    sourceDraft.value =
      "";
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
</script>

<template>
  <header class="page-heading">
    <div>
      <h1>用户管理</h1>
      <p class="muted">查看用户资料、报名历史与真实微信账号的管理权限。</p>
    </div>
    <button :disabled="loading || interactionLocked" @click="load(page)">
      刷新用户
    </button>
  </header>
  <div class="range-label users-range">
    <span class="muted">{{ filterSummary }}</span
    ><button :disabled="loading || interactionLocked" @click="openFilters">
      筛选用户
    </button>
  </div>
  <p class="privacy-note">
    姓名、手机号与报名资料默认脱敏。不能代替用户修改资料；完整联系方式请在对应活动名单中按用途核验。
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
  <UiState v-else-if="!items.length && !error" kind="empty" compact
    >没有匹配的用户。可调整筛选条件后重新查询。<button @click="openFilters">
      调整筛选
    </button></UiState
  >
  <div v-if="items.length" class="table-scroll" :aria-busy="loading">
    <table class="users-table">
      <thead>
        <tr>
          <th>用户</th>
          <th>联系资料 · 已脱敏</th>
          <th>账号来源 / 角色</th>
          <th>报名记录</th>
          <th>注册时间 · 北京时间</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in items" :key="user.id">
          <td>
            <strong>{{ user.nickname || "未设置昵称" }}</strong
            ><br /><span class="record-id" :title="user.id">{{ user.id }}</span>
          </td>
          <td>
            {{ user.realName || "姓名未填写" }} ·
            {{ user.phone || "手机号未填写" }}<br /><span
              class="status-badge"
              >{{ user.profileCompleted ? "资料已完善" : "资料未完善" }}</span
            >
          </td>
          <td>
            {{ sourceLabels[user.accountSource] || "其他来源" }}<br /><span
              class="status-badge"
              >{{ roleLabels[user.role] || "未知角色" }}</span
            >
          </td>
          <td>
            有效 {{ user.confirmedRegistrationCount }} / 全部
            {{ user.registrationCount }}
          </td>
          <td>{{ dateTime(user.createdAt) }}</td>
          <td>
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
  <nav class="pagination" aria-label="用户分页">
    <span>第 {{ page + 1 }} 页 · 共 {{ total }} 位</span>
    <div class="action-row">
      <button
        :disabled="loading || interactionLocked || page === 0"
        @click="load(page - 1)"
      >
        上一页</button
      ><button
        :disabled="loading || interactionLocked || !hasMore"
        @click="load(page + 1)"
      >
        下一页
      </button>
    </div>
  </nav>

  <FormModal v-if="filterOpen" title="筛选用户" @close="filterOpen = false">
    <form class="form-section" @submit.prevent="applyFilters">
      <h2>筛选用户</h2>
      <label
        >昵称、姓名、用户编号或完整手机号<input
          v-model="queryDraft"
          name="userQuery"
          maxlength="80"
          placeholder="输入查找内容"
      /></label>
      <div class="field-row">
        <label
          >资料状态<select v-model="profileDraft" name="profile">
            <option value="">全部状态</option>
            <option value="COMPLETE">资料已完善</option>
            <option value="INCOMPLETE">资料未完善</option>
          </select></label
        ><label
          >角色<select v-model="roleDraft" name="role">
            <option value="">全部角色</option>
            <option value="USER">普通用户</option>
            <option value="ADMIN">管理员</option>
          </select></label
        >
      </div>
      <label
        >账号来源<select v-model="sourceDraft" name="accountSource">
          <option value="">全部来源</option>
          <option v-for="(label, key) in sourceLabels" :key="key" :value="key">
            {{ label }}
          </option>
        </select></label
      >
      <div class="dialog-actions">
        <button type="button" @click="resetFilters">清空条件</button
        ><button class="primary" :disabled="loading">查询用户</button>
      </div>
    </form>
  </FormModal>

  <FormModal
    v-if="detailId"
    title="用户详情"
    size="lg"
    :busy="interactionLocked"
    @close="closeUser"
  >
    <h2>用户详情</h2>
    <p class="record-id">
      {{ detail?.user.nickname || "正在读取用户" }} · 用户编号：{{ detailId }}
    </p>
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
        重新读取
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
            <dd>{{ detail.user.profileCompleted ? "已完善" : "未完善" }}</dd>
          </div>
          <div>
            <dt>账号来源</dt>
            <dd>{{ sourceLabels[detail.user.accountSource] || "其他来源" }}</dd>
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
              重新读取并核对
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
          <p v-else class="privacy-note">{{ roleBlockReason(detail.user) }}</p>
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
              ><span class="status-badge">{{
                registration.status === "CONFIRMED" ? "有效报名" : "已取消"
              }}</span>
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
              }}<template v-if="participant.idNumber"> · 证件已脱敏</template>
            </p>
            <RouterLink
              class="text-button button"
              :to="`/activities/${encodeURIComponent(registration.activityId)}/registrations`"
              >查看活动名单</RouterLink
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
    <div class="dialog-actions">
      <button
        :disabled="detailLoading || interactionLocked"
        @click="loadDetail(detail?.registrations.page || 0)"
      >
        刷新资料</button
      ><button class="primary" :disabled="interactionLocked" @click="closeUser">
        关闭
      </button>
    </div>
  </FormModal>
  <ConfirmDialog
    v-if="pendingRole"
    :title="pendingRole.role === 'ADMIN' ? '设为管理员？' : '撤销管理员权限？'"
    :description="roleDescription"
    :confirm-label="
      pendingRole.role === 'ADMIN' ? '确认设为管理员' : '确认撤销管理员'
    "
    :danger="pendingRole.role === 'USER'"
    :busy="roleBusy"
    @cancel="cancelRole"
    @confirm="confirmRole"
  />
</template>
