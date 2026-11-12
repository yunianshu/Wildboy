<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { Page } from "../types";
import FormModal from "../components/FormModal.vue";
type CustomerType = "GUEST" | "MEMBER" | "LEADER";
type PricingRule = {
  scope: "ACTIVITY" | "SHOP";
  enabled: boolean;
  pricingMode: "DISCOUNT" | "FIXED" | "REDUCTION";
  pricingValue: number;
  participantPricing: "ACCOUNT_ALL" | "ONE_BENEFIT" | null;
};
type RuleForm = Omit<PricingRule, "pricingValue"> & { value: number };
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
      r.value * (r.pricingMode === "DISCOUNT" ? 1000 : 100),
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
}
watch(currentUser, (u, old) => {
  if (u !== old) {
    reset();
    if (u) void load();
  }
});
function failure(e: unknown) {
  if (e instanceof ApiError && e.status === 409) {
    conflict.value = true;
    error.value = "会员资料或等级版本已变化，请重新加载后核对；不会自动覆盖。";
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
        `/admin/membership/users?${new URLSearchParams({ ...filter, page: String(p), size: "20" })}`,
      ),
    ]);
    if (n !== epoch || actor !== currentUser.value) return;
    tiers.value = t;
    users.value = u.items;
    page.value = p;
    total.value = u.total;
    more.value = u.hasMore;
    Object.assign(applied, filter);
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
function canLeave() {
  return !dirty.value || window.confirm("会员管理有未保存修改，确定放弃吗？");
}
function close() {
  if (busy.value || !canLeave()) return;
  opened.value = null;
  selectedUser.value = null;
  selectedTier.value = null;
  conflict.value = false;
  error.value = "";
}
onBeforeRouteLeave((to) => to.path === "/login" || (!busy.value && canLeave()));
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || busy.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  void load();
});
onUnmounted(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  reset();
});
async function reloadEditor() {
  if (busy.value || !currentUser.value || !canLeave()) return;
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
        scaled = r.value * (discount ? 1000 : 100);
      if (
        !Number.isFinite(scaled) ||
        Math.abs(scaled - Math.round(scaled)) > 0.000001 ||
        scaled < (discount ? 1 : 0) ||
        scaled > (discount ? 10000 : 100000000)
      ) {
        error.value = `${scopeLabels[r.scope]}：${discount ? "请输入 0.001–10 折，最多三位小数" : "请输入 0–1000000 元，最多两位小数"}`;
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
</script>
<template>
  <main class="workspace">
    <div class="page-heading">
      <div>
        <h1>会员管理</h1>
        <p>散客、会员、领队为业务身份；领队不获得管理员权限。</p>
      </div>
    </div>
    <p v-if="error && !opened" class="error-box" role="alert">{{ error }}</p>
    <section class="panel">
      <h2>会员等级与定价</h2>
      <p>活动、商品独立设置优惠，默认关闭。</p>
      <button
        class="primary button"
        :disabled="busy || loading"
        @click="openTier(null)"
      >
        新建等级
      </button>
      <p v-if="!loading && !tiers.length">暂无会员等级</p>
      <div class="table-scroll">
        <table v-if="tiers.length">
          <thead>
            <tr>
              <th>等级</th>
              <th>排序</th>
              <th>状态</th>
              <th>价格规则</th>

              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in tiers" :key="t.id">
              <td>{{ t.name }}</td>
              <td>{{ t.sortOrder }}</td>
              <td>{{ t.enabled ? "启用" : "停用" }}</td>
              <td>
                <div v-for="r in t.rules" :key="r.scope">
                  {{ scopeLabels[r.scope] }}：{{
                    r.enabled ? pricing(r) : "未启用"
                  }}
                </div>
              </td>
              <td>
                <button :disabled="busy || loading" @click="openTier(t)">
                  编辑等级
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <h2>用户业务身份</h2>
      <form class="member-filters" @submit.prevent="load(0, true)">
        <label
          >昵称或完整用户 ID<input
            v-model="query"
            aria-label="搜索用户"
            maxlength="80" /></label
        ><label
          >业务身份<select v-model="customerType" aria-label="筛选身份">
            <option value="">全部身份</option>
            <option v-for="(label, key) in labels" :key="key" :value="key">
              {{ label }}
            </option>
          </select></label
        ><button :disabled="busy || loading">搜索</button
        ><button type="button" :disabled="busy || loading" @click="load(page)">
          刷新列表
        </button>
      </form>
      <p v-if="loading" role="status">加载中…</p>
      <p v-else>共 {{ total }} 位用户，第 {{ page + 1 }} 页</p>
      <p v-if="!loading && !users.length">暂无匹配用户</p>
      <div class="table-scroll">
        <table v-if="users.length">
          <thead>
            <tr>
              <th>昵称 / ID</th>
              <th>业务身份</th>
              <th>会员等级</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>
                {{ u.nickname }}<br /><small>{{ u.id }}</small>
              </td>
              <td>{{ labels[u.customerType] }}</td>
              <td>
                {{ u.tierName || "—"
                }}{{
                  u.tierId && !u.tierEnabled ? "（已停用，不享受优惠）" : ""
                }}
              </td>
              <td>
                <button :disabled="busy || loading" @click="openUser(u)">
                  编辑身份
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="member-actions">
        <button
          :disabled="page === 0 || busy || loading"
          @click="load(page - 1)"
        >
          上一页</button
        ><button :disabled="!more || busy || loading" @click="load(page + 1)">
          下一页
        </button>
      </div>
    </section>
    <FormModal v-if="opened" @close="close"
      ><h2>
        {{
          opened === "tier"
            ? selectedTier
              ? "编辑会员等级"
              : "新建会员等级"
            : "编辑用户身份"
        }}
      </h2>
      <p v-if="error" class="error-box" role="alert">{{ error }}</p>
      <p v-if="success" role="status">{{ success }}</p>
      <button
        v-if="selectedTier || selectedUser"
        :disabled="busy"
        @click="reloadEditor"
      >
        重新加载最新资料
      </button>
      <form @submit.prevent="save">
        <fieldset :disabled="busy || conflict">
          <template v-if="opened === 'tier'">
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
            <label
              ><input
                v-model="tierForm.enabled"
                aria-label="启用等级"
                type="checkbox"
              />启用等级（停用后该等级会员不享受优惠）</label
            >
            <div v-for="r in tierForm.rules" :key="r.scope" class="rule-card">
              <label
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
                    <option value="ACCOUNT_ALL">同行全部享受账号等级价</option>
                    <option value="ONE_BENEFIT">
                      每单最多1个优惠名额（不验证参加者个人会员身份）
                    </option>
                  </select></label
                >
                <label
                  >优惠方式<select
                    v-model="r.pricingMode"
                    :aria-label="`${r.scope}定价方式`"
                    @change="r.value = r.pricingMode === 'DISCOUNT' ? 10 : 0"
                  >
                    <option value="DISCOUNT">打折</option>
                    <option value="FIXED">固定价格</option>
                    <option value="REDUCTION">减免金额</option>
                  </select></label
                >
                <label
                  >{{
                    r.pricingMode === "DISCOUNT"
                      ? "折扣（折，如 8 表示八折）"
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
              </template>
            </div>
          </template>
          <template v-else
            ><p>{{ selectedUser?.nickname }} · {{ selectedUser?.id }}</p>
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
            <p>
              只有会员关联等级；散客和领队不关联等级。领队不获得管理员权限。
            </p>
          </template>
          <button class="primary button" type="submit">
            {{ busy ? "保存中…" : "保存" }}
          </button>
        </fieldset>
      </form>
      <button class="secondary button" :disabled="busy" @click="close">
        关闭
      </button>
    </FormModal>
  </main>
</template>
<style scoped>
.rule-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px;
  display: grid;
  gap: 12px;
}
.panel {
  margin-bottom: 24px;
}
fieldset {
  border: 0;
  padding: 16px 0;
  display: grid;
  gap: 16px;
}
label {
  display: grid;
  gap: 8px;
}
label:has(input[type="checkbox"]) {
  display: flex;
  align-items: center;
}
.member-filters,
.member-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: end;
  gap: 12px;
  margin: 16px 0;
}
</style>
