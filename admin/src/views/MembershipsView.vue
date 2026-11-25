<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { readListSearch, rememberListSearch } from "../listSearchContext";
import PaginationBar from "../components/PaginationBar.vue";
import { askConfirm } from "../confirm";
import {
  inject,
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  watch,
} from "vue";
import { routeLocationKey, routerKey, onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Page } from "../types";
import AppIcon from "../components/AppIcon.vue";
import FormModal from "../components/FormModal.vue";
import UiState from "../components/UiState.vue";
type CustomerType = "GUEST" | "MEMBER" | "LEADER";
type PricingRule = {
  scope: "ACTIVITY" | "SHOP";
  enabled: boolean;
  pricingMode: "DISCOUNT" | "FIXED" | "REDUCTION";
  pricingValue: number;
  participantPricing: "ACCOUNT_ALL" | "ONE_BENEFIT" | null;
};
type RuleForm = Omit<PricingRule, "pricingValue"> & { value: number | "" };
const scopeLabels = {
  ACTIVITY: "活动",
  SHOP: "商品（每件）",
};
function rulesForForm(rules: PricingRule[] = []): RuleForm[] {
  return (["ACTIVITY", "SHOP"] as const).map((scope) => {
    const rule = rules.find((r) => r.scope === scope);
    return {
      scope,
      participantPricing:
        scope === "ACTIVITY" ? (rule?.participantPricing ?? null) : null,
      enabled: rule?.enabled ?? false,
      pricingMode: rule?.pricingMode ?? "DISCOUNT",
      value: rule
        ? rule.pricingValue / (rule.pricingMode === "DISCOUNT" ? 1000 : 100)
        : 10,
    };
  });
}
function rulePayload(r: RuleForm): PricingRule {
  return {
    scope: r.scope,
    participantPricing: r.scope === "ACTIVITY" ? r.participantPricing : null,
    enabled: r.enabled,
    pricingMode: r.pricingMode,
    pricingValue: Math.round(
      Number(r.value) * (r.pricingMode === "DISCOUNT" ? 1000 : 100),
    ),
  };
}
type Tier = {
  id: string;
  name: string;
  sortOrder: number;
  enabled: boolean;
  rules: PricingRule[];
  version: number;
};
type Member = {
  id: string;
  nickname: string;
  customerType: CustomerType;
  tierId: string | null;
  tierName: string | null;
  tierEnabled: boolean;
  version: number;
  createdAt: string;
};
const labels = { GUEST: "散客", MEMBER: "会员", LEADER: "领队" };
const userPageSize = 8;
const tiers = ref<Tier[]>([]),
  users = ref<Member[]>([]),
  page = ref(0),
  total = ref(0),
  more = ref(false);
const query = ref(""),
  customerType = ref(""),
  applied = reactive({ query: "", customerType: "" });
const loading = ref(false),
  busy = ref(false),
  error = ref(""),
  success = ref(""),
  conflict = ref(false);
const opened = ref<"tier" | "user" | null>(null),
  selectedTier = ref<Tier | null>(null),
  selectedUser = ref<Member | null>(null);
const route = inject(routeLocationKey, null);
const router = inject(routerKey, null);
const userIdParam = route?.query.userId;
const initialUserQuery =
  typeof userIdParam === "string" ? userIdParam.slice(0, 80) : "";
const rememberedSearch = !initialUserQuery
  ? readListSearch(currentUser.value, "memberships")
  : undefined;
const section = ref<"tiers" | "users">(
  initialUserQuery || rememberedSearch || route?.query.section === "users"
    ? "users"
    : "tiers",
);
const wantedType = route?.query.customerType;
if (
  typeof wantedType === "string" &&
  Object.keys(labels).includes(wantedType)
) {
  customerType.value = wantedType;
  applied.customerType = wantedType;
}
const wantedPage = Number(route?.query.page);
const initialPage =
  rememberedSearch?.page ??
  (Number.isSafeInteger(wantedPage) && wantedPage > 0 && wantedPage <= 100001
    ? wantedPage - 1
    : 0);
function rememberFilters() {
  if (!router || !route) return;
  void router.replace({
    query: {
      ...route.query,
      section: section.value === "users" ? "users" : undefined,
      customerType: applied.customerType || undefined,
      page:
        page.value && (!applied.query || applied.query === initialUserQuery)
          ? String(page.value + 1)
          : undefined,
      userId:
        applied.query === initialUserQuery && initialUserQuery
          ? initialUserQuery
          : undefined,
    },
  });
}
function selectSection(value: "tiers" | "users") {
  section.value = value;
  rememberFilters();
}
query.value = initialUserQuery || rememberedSearch?.query || "";
applied.query = query.value;
const tierForm = reactive({
  name: "",
  sortOrder: 0,
  enabled: true,
  rules: rulesForForm(),
});
const userForm = reactive({
  customerType: "GUEST" as CustomerType,
  tierId: "",
});
const snapshot = ref("");
const dirty = computed(
  () =>
    !!opened.value &&
    JSON.stringify(opened.value === "tier" ? tierForm : userForm) !==
      snapshot.value,
);
let epoch = 0;
function reset() {
  epoch++;
  tiers.value = [];
  users.value = [];
  opened.value = null;
  selectedTier.value = null;
  selectedUser.value = null;
  Object.assign(tierForm, {
    name: "",
    sortOrder: 0,
    enabled: true,
    rules: rulesForForm(),
  });
  Object.assign(userForm, { customerType: "GUEST", tierId: "" });
  query.value = "";
  customerType.value = "";
  applied.query = "";
  applied.customerType = "";
  page.value = 0;
  total.value = 0;
  more.value = false;
  busy.value = false;
  loading.value = false;
  error.value = "";
  success.value = "";
  conflict.value = false;
  section.value = "tiers";
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
function failure(e: unknown) {
  if (e instanceof ApiError && e.code === "TIER_NAME_EXISTS") {
    error.value = e.message;
    return;
  }
  if (e instanceof ApiError && e.status === 409) {
    conflict.value = true;
    error.value =
      e.code === "TIER_DISABLED"
        ? "该会员等级已停用，请重新加载后选择启用的等级。"
        : "会员资料或等级版本已变化，请重新加载后核对；不会自动覆盖。";
  } else error.value = errorMessage(e);
}
async function load(p = 0, search = false) {
  if (loading.value || busy.value || !currentUser.value) return;
  if (search && query.value.trim().length > 80) {
    error.value = "搜索内容最多 80 字";
    return;
  }
  const filter = search
    ? { query: query.value.trim(), customerType: customerType.value }
    : { ...applied };
  const n = epoch,
    actor = currentUser.value;
  loading.value = true;
  error.value = "";
  try {
    const [t, u] = await Promise.all([
      request<Tier[]>("/admin/membership/tiers"),
      request<Page<Member>>(
        `/admin/membership/users?${new URLSearchParams({ ...filter, page: String(p), size: String(userPageSize) })}`,
      ),
    ]);
    if (n !== epoch || actor !== currentUser.value) return;
    tiers.value = t;
    users.value = u.items;
    page.value = p;
    total.value = u.total;
    more.value = u.hasMore;
    Object.assign(applied, filter);
    if (actor && (!initialUserQuery || filter.query !== initialUserQuery))
      rememberListSearch(actor, "memberships", filter.query, p);
    rememberFilters();
  } catch (e) {
    if (n === epoch) failure(e);
  } finally {
    if (n === epoch) loading.value = false;
  }
}
function fillTier(t: Tier | null) {
  selectedTier.value = t;
  Object.assign(tierForm, {
    name: t?.name ?? "",
    sortOrder: t?.sortOrder ?? 0,
    enabled: t?.enabled ?? true,
    rules: rulesForForm(t?.rules),
  });
  snapshot.value = JSON.stringify(tierForm);
}
function fillUser(u: Member) {
  selectedUser.value = u;
  Object.assign(userForm, {
    customerType: u.customerType,
    tierId: u.tierId ?? "",
  });
  snapshot.value = JSON.stringify(userForm);
}
function openTier(t: Tier | null) {
  if (busy.value || loading.value || !currentUser.value) return;
  fillTier(t);
  opened.value = "tier";
  conflict.value = false;
  error.value = "";
  success.value = "";
}
function openUser(u: Member) {
  if (busy.value || loading.value || !currentUser.value) return;
  fillUser(u);
  opened.value = "user";
  conflict.value = false;
  error.value = "";
  success.value = "";
}
async function canLeave() {
  return (
    !dirty.value || (await askConfirm("会员管理有未保存修改，确定放弃吗？"))
  );
}
async function close() {
  if (busy.value || !(await canLeave())) return;
  opened.value = null;
  selectedUser.value = null;
  selectedTier.value = null;
  conflict.value = false;
  error.value = "";
}
onBeforeRouteLeave(
  async (to) => to.path === "/login" || (!busy.value && (await canLeave())),
);
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  void load(initialPage, !!initialUserQuery);
});
onUnmounted(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  reset();
});
async function reloadEditor() {
  if (busy.value || !currentUser.value || !(await canLeave())) return;
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  error.value = "";
  try {
    const t = await request<Tier[]>("/admin/membership/tiers");
    let u: Member | undefined;
    if (opened.value === "user" && selectedUser.value) {
      const result = await request<Page<Member>>(
        `/admin/membership/users?${new URLSearchParams({ query: selectedUser.value.id, page: "0", size: "20" })}`,
      );
      u = result.items.find((item) => item.id === selectedUser.value?.id);
      if (!u) throw new Error("用户已不存在，请关闭后刷新列表");
    }
    if (n !== epoch || actor !== currentUser.value) return;
    tiers.value = t;
    if (opened.value === "tier") {
      const latest = t.find((item) => item.id === selectedTier.value?.id);
      if (!latest) throw new Error("等级已不存在，请关闭后刷新列表");
      fillTier(latest);
    } else if (u) fillUser(u);
    conflict.value = false;
  } catch (e) {
    if (n === epoch) failure(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
async function save() {
  if (busy.value || conflict.value || !opened.value || !currentUser.value)
    return;
  error.value = "";
  success.value = "";
  if (opened.value === "tier") {
    if (!tierForm.name.trim() || tierForm.name.trim().length > 40) {
      error.value = "等级名称需为 1–40 字";
      return;
    }
    if (
      !Number.isInteger(tierForm.sortOrder) ||
      tierForm.sortOrder < 0 ||
      tierForm.sortOrder > 10000
    ) {
      error.value = "排序需为 0–10000 的整数";
      return;
    }
    for (const r of tierForm.rules) {
      if (r.scope === "ACTIVITY" && r.enabled && !r.participantPricing) {
        error.value = "请选择活动多人优惠范围";
        return;
      }
      const discount = r.pricingMode === "DISCOUNT",
        scaled = Number(r.value) * (discount ? 1000 : 100);
      if (
        (r.enabled &&
          (r.value === "" || (r.pricingMode === "REDUCTION" && scaled <= 0))) ||
        !Number.isFinite(scaled) ||
        Math.abs(scaled - Math.round(scaled)) > 0.000001 ||
        scaled < (discount ? 1 : 0) ||
        scaled > (discount ? 10000 : 100000000)
      ) {
        error.value = `${scopeLabels[r.scope]}：${discount ? "请输入 0.001–10 折，最多三位小数" : r.pricingMode === "REDUCTION" ? "请输入大于 0 的减免金额，最多两位小数" : "请输入 0–1000000 元，最多两位小数"}`;
        return;
      }
    }
  } else if (
    userForm.customerType === "MEMBER" &&
    !tiers.value.some((t) => t.id === userForm.tierId && t.enabled)
  ) {
    error.value = "会员必须选择启用的等级";
    return;
  }
  const n = epoch,
    actor = currentUser.value;
  busy.value = true;
  try {
    if (opened.value === "tier") {
      const freeScopes = tierForm.rules
        .filter(
          (rule) =>
            tierForm.enabled &&
            rule.enabled &&
            rule.pricingMode === "FIXED" &&
            rule.value === 0,
        )
        .map((rule) => scopeLabels[rule.scope]);
      if (freeScopes.length) {
        const confirmed = await askConfirm({
          title: "设为免费？",
          description:
            "符合条件的用户无需支付该等级的" +
            freeScopes.join("、") +
            "固定价格。",
          confirmLabel: "确认设为免费",
        });
        if (!confirmed || n !== epoch || actor !== currentUser.value) return;
      }
      const saved = await request<Tier>(
        `/admin/membership/tiers${selectedTier.value ? "/" + encodeURIComponent(selectedTier.value.id) : ""}`,
        {
          method: selectedTier.value ? "PUT" : "POST",
          body: JSON.stringify({
            ...tierForm,
            rules: tierForm.rules.map(rulePayload),
            name: tierForm.name.trim(),
            version: selectedTier.value?.version ?? null,
          }),
        },
      );
      if (n !== epoch || actor !== currentUser.value) return;
      fillTier(saved);
      const index = tiers.value.findIndex((t) => t.id === saved.id);
      if (index < 0) tiers.value.push(saved);
      else tiers.value[index] = saved;
      users.value = users.value.map((u) =>
        u.tierId === saved.id
          ? { ...u, tierName: saved.name, tierEnabled: saved.enabled }
          : u,
      );
    } else if (selectedUser.value) {
      const saved = await request<Member>(
        `/admin/membership/users/${encodeURIComponent(selectedUser.value.id)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            customerType: userForm.customerType,
            tierId: userForm.customerType === "MEMBER" ? userForm.tierId : null,
            version: selectedUser.value.version,
          }),
        },
      );
      if (n !== epoch || actor !== currentUser.value) return;
      fillUser(saved);
      users.value = users.value.map((u) => (u.id === saved.id ? saved : u));
    }
    success.value = "已保存";
  } catch (e) {
    if (n === epoch) failure(e);
  } finally {
    if (n === epoch) busy.value = false;
  }
}
function pricing(t: PricingRule) {
  return t.pricingMode === "DISCOUNT"
    ? `${t.pricingValue / 1000} 折`
    : t.pricingMode === "FIXED"
      ? `固定单价 ¥${(t.pricingValue / 100).toFixed(2)}`
      : `减免 ¥${(t.pricingValue / 100).toFixed(2)}`;
}
function tierPrice(tier: Tier, scope: PricingRule["scope"]) {
  const rule = tier.rules.find((item) => item.scope === scope);
  if (!rule?.enabled) return "未启用";
  if (!tier.enabled) return "停用期间不生效";
  const amount = pricing(rule);
  if (scope === "SHOP") return `${amount} / 件`;
  if (!rule.participantPricing) return amount;
  return `${amount} · ${rule.participantPricing === "ONE_BENEFIT" ? "每单最多 1 个优惠名额" : "同行全部"}`;
}
useForegroundRefresh(() => {
  if (!busy.value && !loading.value && !opened.value) void load(page.value);
});
</script>
<template>
  <main class="workspace member-workspace">
    <header class="page-heading">
      <h1>会员管理</h1>
      <button
        v-if="section === 'tiers'"
        class="primary"
        type="button"
        :disabled="busy || loading"
        @click="openTier(null)"
      >
        <AppIcon name="plus" :size="16" />新建等级
      </button>
    </header>
    <nav class="task-tabs" aria-label="会员管理视图">
      <button
        class="secondary"
        :aria-pressed="section === 'tiers'"
        aria-controls="member-tiers"
        @click="selectSection('tiers')"
      >
        会员等级
      </button>
      <button
        class="secondary"
        :aria-pressed="section === 'users'"
        aria-controls="member-users"
        @click="selectSection('users')"
      >
        用户业务身份
      </button>
    </nav>
    <UiState v-if="error && !opened" kind="error" compact>{{ error }}</UiState>
    <section
      v-show="section === 'tiers'"
      id="member-tiers"
      aria-label="会员等级与定价"
    >
      <UiState v-if="loading && !tiers.length" kind="loading" compact
        >正在读取会员等级…</UiState
      >
      <UiState v-else-if="!tiers.length && !error" kind="empty" compact
        >暂无会员等级。可新建等级设置活动和商品优惠。</UiState
      >
      <div v-if="tiers.length" class="table-scroll" :aria-busy="loading">
        <table class="membership-table record-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader">等级</th>
              <th role="columnheader" class="member-number">排序</th>
              <th role="columnheader" class="member-status-cell">状态</th>
              <th role="columnheader">活动优惠</th>
              <th role="columnheader">商品优惠</th>
              <th role="columnheader">操作</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr role="row" v-for="t in tiers" :key="t.id">
              <td role="cell" data-cell="title" class="member-name">
                {{ t.name }}
              </td>
              <td role="cell" data-label="排序" class="member-number">
                {{ t.sortOrder }}
              </td>
              <td role="cell" data-label="状态" class="member-status-cell">
                <span
                  class="member-tag"
                  :class="{ 'member-tag-muted': !t.enabled }"
                  >{{ t.enabled ? "启用" : "停用" }}</span
                >
              </td>
              <td role="cell" data-label="活动优惠">
                {{ tierPrice(t, "ACTIVITY") }}
              </td>
              <td role="cell" data-label="商品优惠">
                {{ tierPrice(t, "SHOP") }}
              </td>
              <td role="cell" data-cell="actions">
                <button
                  class="text-button"
                  :disabled="busy || loading"
                  @click="openTier(t)"
                >
                  编辑等级
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="tiers.length" class="member-note">
        活动和商品优惠分别设置。更新规则不影响历史订单成交金额。
      </p>
    </section>
    <section
      v-show="section === 'users'"
      id="member-users"
      aria-label="用户业务身份"
    >
      <form
        class="list-filters"
        role="search"
        aria-label="筛选会员"
        @submit.prevent="load(0, true)"
      >
        <input
          v-model="query"
          aria-label="搜索用户"
          type="search"
          placeholder="昵称或完整用户 ID"
          maxlength="80"
        />
        <select
          v-model="customerType"
          aria-label="筛选身份"
          @change="load(0, true)"
        >
          <option value="">全部身份</option>
          <option v-for="(label, key) in labels" :key="key" :value="key">
            {{ label }}
          </option>
        </select>
        <button type="submit" class="secondary" :disabled="busy || loading">
          搜索
        </button>
      </form>
      <UiState v-if="loading && !users.length" kind="loading" compact
        >正在读取用户业务身份…</UiState
      >
      <UiState v-else-if="!users.length && !error" kind="empty" compact>
        {{
          applied.query || applied.customerType ? "暂无匹配用户" : "暂无用户"
        }}
      </UiState>
      <div v-if="users.length" class="table-scroll" :aria-busy="loading">
        <table class="membership-user-table record-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader">昵称 / ID</th>
              <th role="columnheader">业务身份</th>
              <th role="columnheader">会员等级</th>
              <th role="columnheader">操作</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr role="row" v-for="u in users" :key="u.id">
              <td role="cell" data-cell="title">
                <strong>{{ u.nickname }}</strong
                ><br /><small>{{ u.id }}</small>
              </td>
              <td role="cell" data-label="业务身份" class="member-status-cell">
                <span
                  class="member-tag"
                  :class="{ 'member-tag-muted': u.customerType === 'GUEST' }"
                  >{{ labels[u.customerType] }}</span
                >
              </td>
              <td role="cell" data-label="会员等级">
                {{ u.tierName || "—"
                }}{{
                  u.tierId && !u.tierEnabled ? "（已停用，不享受优惠）" : ""
                }}
              </td>
              <td role="cell" data-cell="actions">
                <button
                  class="text-button"
                  :disabled="busy || loading"
                  @click="openUser(u)"
                >
                  编辑身份
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationBar
        v-if="users.length || page > 0"
        :page-size="userPageSize"
        :has-more="more"
        :busy="busy || loading"
        :page="page"
        :total="total"
        label="用户业务身份分页"
        @change="load"
      />
    </section>
    <FormModal
      :busy="busy"
      v-if="opened"
      :size="opened === 'tier' ? 'xl' : 'md'"
      @close="close"
      ><template #title
        ><h2 class="modal-heading">
          {{
            opened === "tier"
              ? selectedTier
                ? "编辑会员等级"
                : "新建会员等级"
              : "编辑用户身份"
          }}
        </h2></template
      >
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <button
        v-if="selectedTier || selectedUser"
        class="member-reload"
        :class="conflict ? 'secondary' : 'text-button'"
        :disabled="busy"
        @click="reloadEditor"
      >
        采用最新资料
      </button>
      <form @submit.prevent="save">
        <fieldset :disabled="busy || conflict">
          <template v-if="opened === 'tier'">
            <div class="member-tier-main">
              <label
                >等级名称<input
                  v-model="tierForm.name"
                  aria-label="等级名称"
                  maxlength="40"
                  required
              /></label>
              <label
                >排序（0–10000）<input
                  v-model.number="tierForm.sortOrder"
                  aria-label="等级排序"
                  type="number"
                  min="0"
                  max="10000"
                  step="1"
                  required
              /></label>
            </div>
            <label class="checkbox-field"
              ><input
                v-model="tierForm.enabled"
                aria-label="启用等级"
                type="checkbox"
              />启用等级（停用后该等级会员不享受优惠）</label
            >
            <div class="member-rules">
              <div v-for="r in tierForm.rules" :key="r.scope" class="rule-card">
                <label class="checkbox-field"
                  ><input
                    v-model="r.enabled"
                    :aria-label="`${r.scope}启用优惠`"
                    type="checkbox"
                  />{{ scopeLabels[r.scope] }}优惠</label
                >
                <template v-if="r.enabled">
                  <label v-if="r.scope === 'ACTIVITY'"
                    >多人优惠范围<select
                      v-model="r.participantPricing"
                      aria-label="活动多人优惠范围"
                      required
                    >
                      <option :value="null">请选择</option>
                      <option value="ACCOUNT_ALL">
                        同行全部享受账号等级价
                      </option>
                      <option value="ONE_BENEFIT">每单最多 1 个优惠名额</option>
                    </select></label
                  >
                  <div class="member-pricing">
                    <label
                      >优惠方式<select
                        v-model="r.pricingMode"
                        :aria-label="`${r.scope}定价方式`"
                        @change="
                          r.value = r.pricingMode === 'DISCOUNT' ? 10 : ''
                        "
                      >
                        <option value="DISCOUNT">打折</option>
                        <option value="FIXED">固定价格</option>
                        <option value="REDUCTION">减免金额</option>
                      </select></label
                    >
                    <label
                      >{{
                        r.pricingMode === "DISCOUNT"
                          ? "折扣（折）"
                          : "金额（元）"
                      }}<input
                        v-model.number="r.value"
                        :aria-label="`${r.scope}定价值`"
                        type="number"
                        :min="r.pricingMode === 'DISCOUNT' ? 0.001 : 0"
                        :max="r.pricingMode === 'DISCOUNT' ? 10 : 1000000"
                        :step="r.pricingMode === 'DISCOUNT' ? 0.001 : 0.01"
                        required
                    /></label>
                  </div>
                  <p class="member-field-note">
                    {{
                      r.scope === "ACTIVITY"
                        ? "按报名账号的会员等级计价。"
                        : "以商品现价为优惠前价格。"
                    }}
                  </p>
                </template>
              </div>
            </div>
          </template>
          <template v-else
            ><div class="member-identity">
              <strong>{{ selectedUser?.nickname }}</strong
              ><span>完整用户 ID {{ selectedUser?.id }}</span>
            </div>
            <label
              >业务身份<select
                v-model="userForm.customerType"
                aria-label="用户身份"
                @change="userForm.tierId = ''"
              >
                <option v-for="(label, key) in labels" :key="key" :value="key">
                  {{ label }}
                </option>
              </select></label
            >
            <label v-if="userForm.customerType === 'MEMBER'"
              >会员等级<select
                v-model="userForm.tierId"
                aria-label="会员等级"
                required
              >
                <option value="">请选择启用等级</option>
                <option
                  v-for="t in tiers"
                  :key="t.id"
                  :value="t.id"
                  :disabled="!t.enabled"
                >
                  {{ t.name }}{{ t.enabled ? "" : "（已停用）" }}
                </option>
              </select></label
            >
            <p class="member-field-note">
              只有会员关联等级；散客和领队不关联等级。领队不获得管理员权限。
            </p>
          </template>
        </fieldset>
        <div class="footer-actions member-footer">
          <button
            class="secondary"
            type="button"
            :disabled="busy"
            @click="close"
          >
            关闭
          </button>
          <button class="primary" type="submit" :disabled="busy || conflict">
            {{ busy ? "保存中…" : opened === "tier" ? "保存等级" : "保存身份" }}
          </button>
        </div>
      </form>
    </FormModal>
  </main>
</template>
<style scoped>
.rule-card {
  border: 1px solid var(--admin-line);
  border-radius: 14px;
  padding: 16px;
  background: var(--admin-surface);
  box-shadow: var(--rf-shadow-sm);
  display: grid;
  align-content: start;
  gap: 10px;
}
.member-rules,
.member-tier-main,
.member-pricing {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: 12px;
}
.member-tier-main {
  grid-template-columns: minmax(0, 1fr) minmax(100px, 180px);
}
.member-workspace fieldset {
  display: grid;
  gap: 12px;
}
.member-workspace label {
  display: grid;
  min-width: 0;
  gap: 4px;
  margin: 0;
}
.member-workspace label input,
.member-workspace label select {
  margin: 0;
}
.member-workspace .checkbox-field {
  display: flex;
  align-items: center;
}
.member-workspace .checkbox-field input {
  flex: 0 0 18px;
}
.membership-table {
  min-width: 640px;
}
.membership-user-table {
  min-width: 460px;
}
.member-name,
.member-identity {
  overflow-wrap: anywhere;
}
.member-number {
  max-width: 80px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.member-status-cell {
  white-space: nowrap;
}
.member-tag {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--admin-tint);
  color: var(--rf-primary-text);
  font-size: 10px;
  font-weight: 600;
}
.member-tag-muted {
  background: var(--admin-paper);
  color: var(--admin-muted);
}
.member-note,
.member-field-note,
.member-identity span,
.membership-user-table small {
  color: var(--admin-muted);
  font-size: 13px;
}
.member-field-note {
  margin: 0;
}
.member-identity {
  display: grid;
  gap: 3px;
}
.member-note {
  margin: 12px 0 0;
  padding: 8px 12px;
  border-radius: var(--admin-radius);
  background: var(--admin-tint);
}
.member-workspace > :deep(.ui-state) {
  margin-bottom: 12px;
}
.member-reload {
  margin-bottom: 10px;
}
.member-pagination {
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
  color: var(--admin-muted);
}
.member-pagination span {
  margin-right: auto;
  font-size: 12px;
}
.member-footer {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--admin-line);
}
@media (max-width: 600px) {
  .member-rules {
    grid-template-columns: 1fr;
  }
}
</style>
