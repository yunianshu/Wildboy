<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import { askConfirm } from "../confirm";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import type { ProductCategory } from "../types";
import FormModal from "../components/FormModal.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import UiState from "../components/UiState.vue";
import PaginationBar from "../components/PaginationBar.vue";
import AppIcon from "../components/AppIcon.vue";

defineProps<{ embedded?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const items = ref<ProductCategory[]>([]),
  loading = ref(false),
  busy = ref(false),
  error = ref(""),
  notice = ref(""),
  editing = ref(false),
  editingId = ref(""),
  editingVersion = ref(0),
  conflict = ref(false),
  uncertain = ref(false),
  reloadConfirmation = ref(false),
  page = ref(0);
const emptyForm = () => ({ name: "", sortOrder: "0" });
const form = ref(emptyForm()),
  baseline = ref(JSON.stringify(form.value));
const dirty = computed(
  () => editing.value && JSON.stringify(form.value) !== baseline.value,
);
const visible = computed(() =>
  items.value.slice(page.value * 8, (page.value + 1) * 8),
);
let alive = true,
  identity = 0,
  listEpoch = 0;
function clear() {
  identity++;
  listEpoch++;
  items.value = [];
  form.value = emptyForm();
  baseline.value = JSON.stringify(form.value);
  loading.value = busy.value = editing.value = reloadConfirmation.value = false;
  conflict.value = uncertain.value = false;
  error.value = notice.value = editingId.value = "";
  editingVersion.value = page.value = 0;
}
watch(
  currentUser,
  () => {
    clear();
    if (currentUser.value?.role === "ADMIN") void load();
  },
  { flush: "sync" },
);
async function load() {
  if (loading.value || busy.value || currentUser.value?.role !== "ADMIN")
    return;
  const actor = currentUser.value,
    started = identity,
    n = ++listEpoch;
  loading.value = true;
  error.value = "";
  try {
    const result = await request<ProductCategory[]>("/admin/shop/categories", {
      cache: "no-store",
    });
    if (!Array.isArray(result))
      throw new Error("商品分类读取失败，请重新加载。");
    if (
      !alive ||
      started !== identity ||
      actor !== currentUser.value ||
      n !== listEpoch
    )
      return;
    items.value = result;
    page.value = Math.min(
      page.value,
      Math.max(0, Math.ceil(result.length / 8) - 1),
    );
  } catch (reason) {
    if (
      alive &&
      started === identity &&
      actor === currentUser.value &&
      n === listEpoch
    )
      error.value = errorMessage(reason);
  } finally {
    if (started === identity && n === listEpoch) loading.value = false;
  }
}
async function canLeave() {
  return (
    !busy.value &&
    (!dirty.value ||
      (await askConfirm("分类修改尚未保存，确定放弃本次修改并离开吗？")))
  );
}
function adopt(category?: ProductCategory) {
  form.value = category
    ? { name: category.name, sortOrder: String(category.sortOrder) }
    : emptyForm();
  editingId.value = category?.id || "";
  editingVersion.value = category?.version || 0;
  baseline.value = JSON.stringify(form.value);
  error.value = notice.value = "";
  conflict.value = uncertain.value = false;
  editing.value = true;
}
async function open(category?: ProductCategory) {
  if (
    busy.value ||
    loading.value ||
    currentUser.value?.role !== "ADMIN" ||
    !(await canLeave())
  )
    return;
  adopt(category);
}
async function close() {
  if (busy.value || !(await canLeave())) return;
  const review = uncertain.value;
  editing.value = reloadConfirmation.value = false;
  form.value = emptyForm();
  baseline.value = JSON.stringify(form.value);
  conflict.value = uncertain.value = false;
  error.value = "";
  if (review) void load();
}
async function save() {
  if (
    busy.value ||
    loading.value ||
    conflict.value ||
    uncertain.value ||
    !editing.value ||
    currentUser.value?.role !== "ADMIN"
  )
    return;
  const name = form.value.name.trim(),
    sortOrder = Number(form.value.sortOrder);
  if (!name || name.length > 40 || /[\u0000-\u001f\u007f-\u009f]/.test(name)) {
    error.value = "分类名称须为 1–40 字，不能包含控制字符。";
    return;
  }
  if (
    !String(form.value.sortOrder).trim() ||
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 9999
  ) {
    error.value = "排序须为 0–9999 的整数，数值越小越靠前。";
    return;
  }
  const actor = currentUser.value,
    started = identity,
    id = editingId.value;
  busy.value = true;
  error.value = "";
  try {
    const result = await request<ProductCategory>(
      id
        ? `/admin/shop/categories/${encodeURIComponent(id)}`
        : "/admin/shop/categories",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          name,
          sortOrder,
          ...(id ? { version: editingVersion.value } : {}),
        }),
      },
    );
    if (!alive || started !== identity || actor !== currentUser.value) return;
    items.value = id
      ? items.value.map((item) => (item.id === id ? result : item))
      : [...items.value, result];
    editing.value = false;
    form.value = emptyForm();
    baseline.value = JSON.stringify(form.value);
    notice.value = `分类「${result.name}」已保存。`;
    emit("changed");
    busy.value = false;
    void load();
  } catch (reason) {
    if (!alive || started !== identity || actor !== currentUser.value) return;
    conflict.value =
      reason instanceof ApiError &&
      reason.status === 409 &&
      ["STALE_VERSION", "VERSION_CONFLICT"].includes(reason.code);
    uncertain.value =
      !id &&
      (!(reason instanceof ApiError) ||
        reason.status === 0 ||
        reason.status >= 500);
    error.value = uncertain.value
      ? "分类创建结果待核对，当前输入已保留。请返回列表核对，不要重复创建。"
      : conflict.value
        ? "分类已在其他会话更新。当前输入已保留且暂停保存；请重新读取最新版本后核对，不会自动覆盖。"
        : reason instanceof ApiError && reason.code === "CATEGORY_NAME_EXISTS"
          ? "该分类名称已存在，请修改名称后再保存。当前输入已保留。"
          : errorMessage(reason);
  } finally {
    if (started === identity) busy.value = false;
  }
}
function requestReload() {
  if (busy.value || loading.value || !editingId.value) return;
  if (dirty.value) reloadConfirmation.value = true;
  else void reloadCurrent();
}
async function reloadCurrent() {
  if (
    busy.value ||
    loading.value ||
    !editingId.value ||
    currentUser.value?.role !== "ADMIN"
  )
    return;
  const actor = currentUser.value,
    started = identity,
    id = editingId.value;
  busy.value = true;
  try {
    const result = await request<ProductCategory[]>("/admin/shop/categories", {
      cache: "no-store",
    });
    if (!Array.isArray(result))
      throw new Error("商品分类读取失败，请重新加载。");
    if (!alive || started !== identity || actor !== currentUser.value) return;
    const latest = result.find((item) => item.id === id);
    if (!latest)
      throw new Error("列表中未找到该分类，当前输入仍保留，请返回列表核对。");
    items.value = result;
    adopt(latest);
    reloadConfirmation.value = false;
  } catch (reason) {
    if (alive && started === identity && actor === currentUser.value) {
      error.value = `重新读取失败：${errorMessage(reason)} 当前输入仍保留。`;
      reloadConfirmation.value = false;
    }
  } finally {
    if (started === identity) busy.value = false;
  }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
defineExpose({ canLeave });
onBeforeRouteLeave(async (to) => to.path === "/login" || (await canLeave()));
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", beforeUnload);
});
onUnmounted(() => {
  alive = false;
  clear();
  window.removeEventListener("beforeunload", beforeUnload);
});
useForegroundRefresh(() => {
  if (!loading.value && !busy.value && !editing.value) void load();
});
</script>
<template>
  <component :is="embedded ? 'section' : 'main'" :class="embedded ? 'category-manager' : 'workspace'">
    <header class="page-heading">
      <component :is="embedded ? 'h2' : 'h1'">商品分类</component>
      <div class="action-row">
        <button class="primary" :disabled="loading || busy" @click="open()">
          <AppIcon name="plus" />新分类
        </button>
      </div>
    </header>
    <nav v-if="!embedded" class="task-tabs" aria-label="商城任务">
      <RouterLink class="button secondary" to="/shop?tab=products"
        >商品与库存</RouterLink
      ><RouterLink class="button secondary" to="/shop?tab=orders"
        >订单与发货</RouterLink
      ><RouterLink
        class="button primary"
        to="/shop/categories"
        aria-current="page"
        >商品分类</RouterLink
      >
    </nav>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="error && !editing" class="error-box" role="alert">
      {{ error
      }}<button class="text-button" :disabled="loading || busy" @click="load">
        重试
      </button>
    </p>
    <UiState v-if="loading && !items.length" kind="loading" compact
      >正在加载商品分类…</UiState
    >
    <UiState v-else-if="!items.length && !error" kind="empty" compact
      >暂无商品分类</UiState
    >
    <div v-if="items.length" class="table-scroll">
      <table class="product-categories-table record-table" role="table">
        <thead role="rowgroup">
          <tr role="row">
            <th role="columnheader">分类名称</th>
            <th role="columnheader">排序</th>
            <th role="columnheader">关联商品</th>
            <th role="columnheader">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr role="row" v-for="category in visible" :key="category.id">
            <td role="cell" data-cell="title">
              <strong class="cell-summary" :title="category.name">{{
                category.name
              }}</strong
              ><span v-if="category.id === 'uncategorized'" class="muted"
                >默认分类</span
              >
            </td>
            <td role="cell" data-label="排序" class="table-number">
              {{ category.sortOrder }}
            </td>
            <td role="cell" data-label="关联商品" class="table-number">
              <RouterLink
                class="text-button"
                :to="{ path: '/shop', query: { category: category.id } }"
                >{{ category.productCount }} 件</RouterLink
              >
            </td>
            <td role="cell" data-cell="actions">
              <button
                class="text-button"
                :disabled="loading || busy"
                @click="open(category)"
              >
                编辑分类
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PaginationBar
      :page="page"
      :page-size="8"
      :total="items.length"
      :has-more="(page + 1) * 8 < items.length"
      :busy="loading || busy"
      label="商品分类分页"
      count-unit="个分类"
      @change="page = $event"
    />
    <FormModal :busy="busy" v-if="editing" @close="close"
      ><template #title
        ><h2>{{ editingId ? "编辑商品分类" : "创建商品分类" }}</h2></template
      >
      <form
        id="product-category-form"
        class="modal-form"
        @submit.prevent="save"
      >
        <p v-if="error" class="error-box" role="alert">{{ error }}</p>
        <p v-if="editingId === 'uncategorized'" class="privacy-note">
          此分类用于未指定分类的商品。
        </p>
        <label
          >分类名称 *<input
            v-model="form.name"
            name="categoryName"
            required
            maxlength="40"
            :disabled="busy"
        /></label>
        <label
          >排序 *<input
            v-model="form.sortOrder"
            name="categorySortOrder"
            type="number"
            min="0"
            max="9999"
            required
            :disabled="busy"
        /></label>
        <p class="field-hint">0–9999 的整数，数值越小越靠前。</p>
      </form>
      <template #footer>
        <div class="dialog-actions">
          <button type="button" :disabled="busy" @click="close">
            {{ uncertain ? "返回分类列表核对" : "取消" }}</button
          ><button
            v-if="editingId"
            type="button"
            :disabled="busy || loading"
            @click="requestReload"
          >
            采用最新版本</button
          ><button
            class="primary"
            type="submit"
            form="product-category-form"
            :disabled="busy || loading || conflict || uncertain"
          >
            {{ busy ? "正在保存…" : "保存分类" }}
          </button>
        </div>
      </template>
    </FormModal>
    <ConfirmDialog
      v-if="reloadConfirmation"
      title="重新读取分类？"
      description="重新读取成功后将采用最新名称、排序和版本，放弃当前未保存修改；读取失败仍保留输入。"
      confirm-label="确认重新读取"
      :busy="busy"
      @cancel="!busy && (reloadConfirmation = false)"
      @confirm="reloadCurrent"
    />
  </component>
</template>
