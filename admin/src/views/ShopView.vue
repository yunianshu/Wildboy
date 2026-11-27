<script setup lang="ts">
import { useForegroundRefresh } from "../foregroundRefresh";
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { askConfirm } from "../confirm";
import { routeLocationKey, routerKey } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import { displayDate } from "../forms";
import { shopOrderTone } from "../statusTone";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import FormModal from "../components/FormModal.vue";
import ImageUpload from "../components/ImageUpload.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import AppIcon from "../components/AppIcon.vue";
import ProductDetailPreview from "../components/ProductDetailPreview.vue";
import ProductCategoriesView from "./ProductCategoriesView.vue";
import type {
  Order,
  Page,
  Product,
  ProductCategory,
  ProductInput,
  ProductStatus,
} from "../types";

const formOpen = ref(false);
const previewTarget = ref<Product | null>(null);
const previewMarkdown = ref("");
const previewContentLoading = ref(false);
const previewContentError = ref("");
let previewEpoch = 0;
const formError = ref("");
const formErrorElement = ref<HTMLElement>();
const products = ref<Product[]>([]),
  categories = ref<ProductCategory[]>([]),
  categoriesError = ref(""),
  orders = ref<Page<Order>>({
    items: [],
    total: 0,
    page: 0,
    size: 20,
    hasMore: false,
  }),
  page = ref(0),
  busy = ref(false),
  error = ref(""),
  editingId = ref(""),
  editingVersion = ref(0),
  revealed = ref(new Set<string>()),
  revealTarget = ref<Order | null>(null),
  detailed = ref(new Set<string>()),
  appliedCategory = ref(""),
  shipping = ref<Order | null>(null),
  shipCompany = ref(""),
  shipTracking = ref(""),
  tab = ref<"products" | "orders">("products"),
  form = ref({
    name: "",
    description: "",
    imageUrl: "",
    categoryId: "",
    originalPriceYuan: "99.00",
    currentPriceYuan: "99.00",
    stock: "0",
    status: "ON_SALE" as ProductStatus,
  }),
  baseline = ref({ categoryId: "", priceCents: 0, originalPriceCents: 0 }),
  pendingPayload = ref<(ProductInput & { version?: number }) | null>(null),
  pendingSummary = ref("");
let generation = 0;
const shippingError = ref("");
const shippingConflictId = ref("");
const route = inject(routeLocationKey, null);
const productQuery = ref("");
const productStatus = ref("");
const orderQuery = ref("");
const orderStatus = ref("");
const notice = ref("");
let formSnapshot = "";

const router = inject(routerKey, null);
const categoriesOpen = ref(false);
const categoryManager = ref<InstanceType<typeof ProductCategoriesView>>();
watch(
  () => route?.query.manageCategories,
  (value) => {
    if (value === "1") categoriesOpen.value = true;
  },
  { immediate: true },
);
async function toggleCategoryManager() {
  if (categoriesOpen.value && categoryManager.value && !(await categoryManager.value.canLeave())) return;
  categoriesOpen.value = !categoriesOpen.value;
  if (!categoriesOpen.value && route?.query.manageCategories && router) {
    const query = { ...route.query };
    delete query.manageCategories;
    void router.replace({ query });
  }
}
watch(
  () => route?.query.tab,
  (selected) => {
    const requested =
      selected ??
      new URLSearchParams(window.location.hash.split("?")[1] || "").get("tab");
    tab.value = requested === "orders" ? "orders" : "products";
    revealed.value = new Set();
    revealTarget.value = null;
  },
  { immediate: true },
);

function queryString(value: unknown) {
  return typeof value === "string" ? value : "";
}
appliedCategory.value = queryString(route?.query.category);
productQuery.value = queryString(route?.query.productQuery);
productStatus.value = queryString(route?.query.productStatus);
orderQuery.value = queryString(route?.query.orderQuery);
orderStatus.value = queryString(route?.query.orderStatus);
const initialPage = Number(queryString(route?.query.page));
page.value =
  Number.isSafeInteger(initialPage) && initialPage >= 0 && initialPage <= 100000
    ? initialPage
    : 0;
function rememberFilters() {
  if (!route || !router) return;
  void router.replace({
    query: {
      ...route.query,
      category: appliedCategory.value || undefined,
      productQuery: productQuery.value.trim() || undefined,
      productStatus: productStatus.value || undefined,
      orderQuery: orderQuery.value.trim() || undefined,
      orderStatus: orderStatus.value || undefined,
      page: page.value ? String(page.value) : undefined,
    },
  });
}
function searchOrders() {
  page.value = 0;
  rememberFilters();
  void load();
}
const filteredProducts = computed(() =>
  products.value.filter(
    (p) =>
      (!appliedCategory.value || p.categoryId === appliedCategory.value) &&
      (!productStatus.value || p.status === productStatus.value) &&
      (!route?.query.productId || p.id === route.query.productId) &&
      p.name
        .toLocaleLowerCase()
        .includes(productQuery.value.trim().toLocaleLowerCase()),
  ),
);
const hasProductFilters = computed(() =>
  Boolean(
    appliedCategory.value || productStatus.value || productQuery.value.trim(),
  ),
);
function clear() {
  generation++;
  products.value = [];
  categories.value = [];
  categoriesError.value = "";
  orders.value = { items: [], total: 0, page: 0, size: 20, hasMore: false };
  revealed.value = new Set();
  revealTarget.value = null;
  detailed.value = new Set();
  appliedCategory.value = "";
  shipping.value = null;
  shippingError.value = "";
  shippingConflictId.value = "";
  formOpen.value = false;
  editingId.value = "";
  editingVersion.value = 0;
  pendingPayload.value = null;
  pendingSummary.value = "";
  busy.value = false;
  error.value = "";
  notice.value = "";
  formError.value = "";
}
watch(currentUser, clear, { flush: "sync" });

function money(cents: number) {
  return `¥${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
const orderStatuses = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  CONFIRMED_FREE: "免支付已确认",
  CANCELLED: "已取消",
  SHIPPED: "已发货",
  REFUNDED: "已退款",
};
function canShip(order: Order) {
  return (
    !order.reconciliationRequired &&
    (order.status === "PAID" || order.status === "CONFIRMED_FREE")
  );
}
function maskPhone(phone: string) {
  return phone.length > 7
    ? `${phone.slice(0, 3)}••••${phone.slice(-4)}`
    : "••••";
}
function toggle(order: Order) {
  if (revealed.value.has(order.id)) revealed.value.delete(order.id);
  else revealTarget.value = order;
}
function confirmReveal() {
  const order = revealTarget.value;
  revealTarget.value = null;
  if (order && tab.value === "orders" && orders.value.items.includes(order))
    revealed.value.add(order.id);
}
function toggleDetail(id: string) {
  const next = new Set(detailed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  detailed.value = next;
}
function focusTab(which: "products" | "orders") {
  tab.value = which;
  revealed.value = new Set();
  revealTarget.value = null;
  if (router && route)
    void router.replace({ query: { ...route.query, tab: which } });
}
async function load() {
  const n = ++generation;
  busy.value = true;
  error.value = "";
  revealed.value = new Set();
  revealTarget.value = null;
  try {
    const params = new URLSearchParams({
      page: String(page.value),
      size: "20",
    });
    if (orderQuery.value.trim()) params.set("query", orderQuery.value.trim());
    if (orderStatus.value === "AWAITING_SHIPMENT")
      params.set("awaitingShipment", "true");
    else if (orderStatus.value && orderStatus.value in orderStatuses)
      params.set("status", orderStatus.value);
    const [productData, orderData] = await Promise.all([
      request<Product[]>("/admin/shop/products"),
      request<Page<Order>>(`/admin/orders?${params}`),
    ]);
    if (n !== generation) return;
    products.value = Array.isArray(productData) ? productData : [];
    orders.value = orderData;
    shippingConflictId.value = "";
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
async function loadCategories() {
  const n = generation;
  try {
    const result = await request<ProductCategory[]>("/admin/shop/categories");
    if (n !== generation) return;
    categories.value = Array.isArray(result) ? result : [];
    categoriesError.value = "";
  } catch (e) {
    if (n !== generation) return;
    categories.value = [];
    categoriesError.value = errorMessage(e);
  }
}
function changePage(delta: number) {
  page.value = Math.max(0, page.value + delta);
  rememberFilters();
  void load();
}
function clearProductFilters() {
  appliedCategory.value = productStatus.value = productQuery.value = "";
  rememberFilters();
}
async function loadPreviewMarkdown(productId: string) {
  const token = ++previewEpoch;
  previewContentLoading.value = true;
  previewContentError.value = "";
  try {
    const res = await request<{ markdown?: string }>(
      `/admin/shop/products/${encodeURIComponent(productId)}/content/markdown`,
    );
    if (token === previewEpoch) {
      previewMarkdown.value = res.markdown || "";
    }
  } catch (e) {
    if (token === previewEpoch) {
      previewContentError.value = `图文详情加载失败：${errorMessage(e)}`;
    }
  } finally {
    if (token === previewEpoch) {
      previewContentLoading.value = false;
    }
  }
}
function openPreview(item: Product, event: MouseEvent) {
  (event.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
  previewTarget.value = item;
  previewMarkdown.value = "";
  void loadPreviewMarkdown(item.id);
}
function closePreview() {
  previewEpoch++;
  previewTarget.value = null;
  previewMarkdown.value = "";
  previewContentLoading.value = false;
  previewContentError.value = "";
}
function openNew() {
  formError.value = "";
  editingId.value = "";
  editingVersion.value = 0;
  form.value = {
    name: "",
    description: "",
    imageUrl: "",
    categoryId: "",
    originalPriceYuan: "99.00",
    currentPriceYuan: "99.00",
    stock: "0",
    status: "ON_SALE",
  };
  baseline.value = { categoryId: "", priceCents: 0, originalPriceCents: 0 };
  formSnapshot = JSON.stringify(form.value);
  formOpen.value = true;
}
function edit(product: Product) {
  formError.value = "";
  editingId.value = product.id;
  editingVersion.value = product.version;
  form.value = {
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    categoryId: product.categoryId ?? "",
    originalPriceYuan: (
      (product.originalPriceCents ?? product.priceCents) / 100
    ).toFixed(2),
    currentPriceYuan: (product.priceCents / 100).toFixed(2),
    stock: String(product.stock),
    status: product.status,
  };
  baseline.value = {
    categoryId: product.categoryId ?? "",
    priceCents: product.priceCents,
    originalPriceCents: product.originalPriceCents ?? product.priceCents,
  };
  formSnapshot = JSON.stringify(form.value);
  formOpen.value = true;
}
async function reset(saved = false) {
  if (
    !saved &&
    formOpen.value &&
    JSON.stringify(form.value) !== formSnapshot &&
    !(await askConfirm("商品修改未保存，确定放弃吗？"))
  )
    return;
  formError.value = "";
  editingId.value = "";
  editingVersion.value = 0;
  formOpen.value = false;
  pendingPayload.value = null;
  pendingSummary.value = "";
  form.value = {
    name: "",
    description: "",
    imageUrl: "",
    categoryId: "",
    originalPriceYuan: "99.00",
    currentPriceYuan: "99.00",
    stock: "0",
    status: "ON_SALE",
  };
  if (router && route?.query.edit) {
    const { edit: _, ...query } = route.query;
    void router.replace({ query });
  }
}
watch(
  [products, () => route?.query.edit],
  ([items, id]) => {
    if (formOpen.value || typeof id !== "string" || !id) return;
    const product = items.find((item) => item.id === id);
    if (product) edit(product);
  },
  { immediate: true },
);
function parseYuan(value: string) {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return cents >= 1 && cents <= 100000000 ? cents : null;
}
function showFormError(message: string) {
  formError.value = message;
  void nextTick(() => formErrorElement.value?.focus());
}
async function save() {
  if (busy.value || pendingPayload.value) return;
  formError.value = "";
  const name = form.value.name.trim(),
    imageUrl = form.value.imageUrl.trim(),
    stock = Number(form.value.stock);
  if (!name || name.length > 120 || !form.value.description.trim()) {
    showFormError("请填写商品名称和说明");
    return;
  }
  if (!imageUrl) {
    showFormError("请上传商品图片");
    return;
  }
  if (
    !/^https:\/\/[^\s]+$/.test(imageUrl) &&
    !/^\/assets\/[A-Za-z0-9_./-]+$/.test(imageUrl)
  ) {
    showFormError("商品图片须为 HTTPS 或 /assets/ 路径");
    return;
  }
  const originalPriceCents = parseYuan(form.value.originalPriceYuan);
  if (originalPriceCents === null) {
    showFormError("请输入有效商品原价");
    return;
  }
  const priceCents = parseYuan(form.value.currentPriceYuan);
  if (priceCents === null) {
    showFormError("请输入有效商品现价");
    return;
  }
  if (originalPriceCents < priceCents) {
    showFormError("原价不能低于现价");
    return;
  }
  if (
    categories.value.length &&
    !categories.value.some((c) => c.id === form.value.categoryId)
  ) {
    showFormError("选择有效的商品分类");
    return;
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    showFormError("请输入有效库存整数");
    return;
  }
  const id = editingId.value;
  const payload: ProductInput & { version?: number } = {
    name,
    description: form.value.description,
    imageUrl,
    categoryId: form.value.categoryId,
    priceCents,
    originalPriceCents,
    stock,
    status: form.value.status,
    ...(id ? { version: editingVersion.value } : {}),
  };
  const commercialChange =
    priceCents !== baseline.value.priceCents ||
    originalPriceCents !== baseline.value.originalPriceCents ||
    form.value.categoryId !== baseline.value.categoryId;
  if (id && commercialChange && categories.value.length) {
    const categoryName =
      categories.value.find((c) => c.id === form.value.categoryId)?.name ||
      "未分类";
    pendingPayload.value = payload;
    pendingSummary.value = `分类「${categoryName}」、原价 ${money(originalPriceCents)}、现价 ${money(priceCents)}`;
    return;
  }
  await submitProduct(payload);
}
async function confirmSave() {
  const payload = pendingPayload.value;
  if (!payload || busy.value) return;
  pendingPayload.value = null;
  pendingSummary.value = "";
  await submitProduct(payload);
}
function cancelSave() {
  if (!busy.value) {
    pendingPayload.value = null;
    pendingSummary.value = "";
  }
}
async function submitProduct(payload: ProductInput & { version?: number }) {
  busy.value = true;
  const n = generation;
  try {
    const id = editingId.value;
    if (id)
      await request<Product>(`/admin/shop/products/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    else
      await request<Product>("/admin/shop/products", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    if (n !== generation) return;
    await reset(true);
    notice.value = "商品已保存";
    await load();
  } catch (e) {
    if (n === generation) showFormError(errorMessage(e));
  } finally {
    if (n === generation) busy.value = false;
  }
}
function openShipping(order: Order) {
  if (busy.value || !canShip(order) || shippingConflictId.value === order.id)
    return;
  shippingError.value = "";
  shipCompany.value = "";
  shipTracking.value = "";
  shipping.value = order;
}
function closeShipping() {
  if (busy.value) return;
  const refresh = shipping.value?.id === shippingConflictId.value;
  shipping.value = null;
  shippingError.value = "";
  if (refresh) void load();
}
async function ship() {
  if (
    !shipping.value ||
    busy.value ||
    !canShip(shipping.value) ||
    shippingConflictId.value === shipping.value.id
  )
    return;
  const order = shipping.value;
  if (
    order.status === "PAID" &&
    (!shipCompany.value.trim() || !shipTracking.value.trim())
  ) {
    shippingError.value = "微信支付订单必须填写物流公司和运单号后再标记发货。";
    return;
  }
  const n = generation;
  busy.value = true;
  shippingError.value = "";
  try {
    await request<Order>(`/admin/orders/${order.id}/ship`, {
      method: "POST",
      body: JSON.stringify({
        version: order.version,
        company: shipCompany.value.trim(),
        trackingNo: shipTracking.value.trim(),
      }),
    });
    if (n !== generation) return;
    shipping.value = null;
    notice.value = "发货信息已保存";
    await load();
  } catch (e) {
    if (n !== generation) return;
    if (e instanceof ApiError && e.status === 409) {
      shippingConflictId.value = order.id;
      shippingError.value = `${e.message} 请返回检查，刷新后核对订单状态。`;
    } else if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) {
      shippingConflictId.value = order.id;
      shippingError.value = "发货结果待核对。请返回检查，刷新订单后确认状态。";
    } else shippingError.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
onMounted(() => {
  void load();
  void loadCategories();
});
onUnmounted(clear);
useForegroundRefresh(() => {
  if (
    !busy.value &&
    !formOpen.value &&
    !shipping.value &&
    !revealed.value.size &&
    !revealTarget.value
  )
    void load();
});
</script>

<template>
  <main class="workspace">
    <section class="page-heading">
      <div>
        <h1>商城管理</h1>
      </div>
      <div v-show="tab === 'products'" class="action-row">
        <button
          type="button"
          class="secondary"
          :aria-expanded="categoriesOpen"
          aria-controls="shop-category-manager"
          @click="toggleCategoryManager"
        >
          {{ categoriesOpen ? "收起商品分类" : "管理商品分类" }}
        </button>
        <button class="primary" @click="openNew">
          <AppIcon name="plus" :size="16" />新商品
        </button>
      </div>
    </section>
    <nav class="task-tabs" aria-label="商城任务">
      <button
        :class="tab === 'products' ? 'primary' : 'secondary'"
        :aria-pressed="tab === 'products'"
        @click="focusTab('products')"
      >
        商品与库存</button
      ><button
        :class="tab === 'orders' ? 'primary' : 'secondary'"
        :aria-pressed="tab === 'orders'"
        @click="focusTab('orders')"
      >
        订单与发货
      </button>
    </nav>
    <p v-if="notice" class="success-box" role="status">{{ notice }}</p>
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <section v-show="tab === 'products'" id="shop-products">
      <div id="shop-category-manager" :hidden="!categoriesOpen">
        <ProductCategoriesView
          v-if="categoriesOpen"
          ref="categoryManager"
          embedded
          @changed="loadCategories"
        />
      </div>
      <form
        class="list-filters"
        role="search"
        aria-label="筛选商品"
        @submit.prevent="rememberFilters"
      >
        <input
          v-model="productQuery"
          type="search"
          aria-label="搜索商品名称"
          placeholder="搜索商品名称"
          @input="rememberFilters"
        />
        <select
          v-model="appliedCategory"
          name="categoryFilter"
          aria-label="商品分类"
          @change="rememberFilters"
        >
          <option value="">全部分类</option>
          <option
            v-if="
              appliedCategory &&
              !categories.some((category) => category.id === appliedCategory)
            "
            :value="appliedCategory"
          >
            当前分类
          </option>
          <option
            v-for="category in categories"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
        <select
          v-model="productStatus"
          aria-label="销售状态"
          @change="rememberFilters"
        >
          <option value="">全部销售状态</option>
          <option value="ON_SALE">上架</option>
          <option value="OFF_SHELF">下架</option>
        </select>
        <RouterLink v-if="route?.query.productId" class="text-button" to="/shop"
          >查看全部商品</RouterLink
        >
        <button
          v-else-if="hasProductFilters && (filteredProducts.length || error)"
          class="text-button"
          type="button"
          @click="clearProductFilters"
        >
          清除筛选
        </button>
      </form>
      <UiState v-if="categoriesError" kind="error" compact>
        商品分类加载失败。<button
          class="text-button"
          type="button"
          @click="loadCategories"
        >
          重试
        </button>
      </UiState>
      <UiState v-if="busy && !products.length" kind="loading" compact
        >正在加载商品…</UiState
      >
      <UiState v-else-if="!busy && !error && !filteredProducts.length" compact>
        {{
          hasProductFilters || route?.query.productId
            ? "没有符合条件的商品"
            : "暂无商品"
        }}
        <button
          v-if="hasProductFilters && !route?.query.productId"
          class="text-button"
          type="button"
          @click="clearProductFilters"
        >
          清除筛选
        </button>
      </UiState>
      <div v-if="filteredProducts.length" class="table-scroll">
        <table class="record-table" role="table">
          <thead role="rowgroup">
            <tr role="row">
              <th role="columnheader">商品</th>
              <th role="columnheader">分类</th>
              <th role="columnheader">原价 / 现价</th>
              <th role="columnheader">库存</th>
              <th role="columnheader">状态</th>
              <th role="columnheader" scope="col">操作</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr
              role="row"
              v-for="product in filteredProducts"
              :key="product.id"
            >
              <td role="cell" data-cell="title">
                <strong>{{ product.name }}</strong>
              </td>
              <td role="cell" data-label="分类">
                {{ categories.find((category) => category.id === product.categoryId)?.name || product.categoryName || "未分类" }}
              </td>
              <td role="cell" data-label="原价 / 现价">
                <del
                  v-if="
                    (product.originalPriceCents ?? product.priceCents) >
                    product.priceCents
                  "
                  >{{
                    money(product.originalPriceCents ?? product.priceCents)
                  }}</del
                >
                {{ money(product.priceCents) }}
              </td>
              <td role="cell" data-label="库存">
                <span
                  :class="{
                    'stock-warning':
                      product.status === 'ON_SALE' && !product.stock,
                  }"
                  >{{ product.stock }}</span
                >
                <small
                  v-if="product.status === 'ON_SALE' && !product.stock"
                  class="stock-hint"
                  >缺货，无法下单</small
                >
              </td>
              <td role="cell" data-label="销售状态">
                {{ product.status === "ON_SALE" ? "上架" : "下架" }}
              </td>
              <td role="cell" data-cell="actions">
                <div class="product-actions">
                  <RouterLink
                    class="button text-button"
                    :to="{
                      path: `/shop/products/${encodeURIComponent(product.id)}/content`,
                      query: route?.query,
                    }"
                    >编辑商品</RouterLink
                  >
                  <button
                    type="button"
                    class="text-button"
                    aria-haspopup="dialog"
                    :aria-expanded="previewTarget?.id === product.id"
                    title="预览小程序商品详情页"
                    @click="openPreview(product, $event)"
                  >
                    预览
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="filteredProducts.length" class="pagination-count">
        共 {{ filteredProducts.length }} 件商品
      </p>
    </section>
    <section v-show="tab === 'orders'" id="shop-orders">
      <form
        class="list-filters"
        role="search"
        aria-label="筛选装备订单"
        @submit.prevent="searchOrders"
      >
        <input
          v-model="orderQuery"
          type="search"
          maxlength="100"
          aria-label="搜索装备订单"
          placeholder="搜索订单号"
        />
        <select
          v-model="orderStatus"
          aria-label="装备订单状态"
          @change="searchOrders"
        >
          <option value="">全部订单状态</option>
          <option value="AWAITING_SHIPMENT">待发货</option>
          <option
            v-for="(label, value) in orderStatuses"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
        <button class="secondary" :disabled="busy">查询</button>
      </form>
      <div class="privacy-note">
        收货资料仅用于订单履约，请勿公开或用于无关营销。
      </div>
      <UiState v-if="busy && !orders.items.length" kind="loading" compact
        >正在加载订单…</UiState
      >
      <UiState v-else-if="!orders.items.length && !error" compact>
        {{ orderQuery || orderStatus ? "没有符合条件的订单" : "暂无装备订单" }}
      </UiState>
      <article
        v-for="order in orders.items"
        :key="order.id"
        class="order-admin-card"
        :aria-label="`订单 ${order.orderNo}`"
      >
        <div class="section-heading">
          <div>
            <div class="order-title-line">
              <span
                class="status-pill inline"
                :class="`tone-${shopOrderTone(order.status)}`"
                >{{ orderStatuses[order.status] }}</span
              ><strong>{{ money(order.totalCents) }}</strong>
            </div>
            <p class="muted record-id">订单号 {{ order.orderNo }}</p>
            <p
              v-if="
                order.originalTotalCents != null &&
                order.originalTotalCents !== order.totalCents
              "
            >
              会员优惠前 {{ money(order.originalTotalCents) }} · 优惠
              {{ money(order.originalTotalCents - order.totalCents) }}
            </p>
            <p
              v-if="
                order.status === 'SHIPPED' &&
                (order.shippingCompany || order.shippingTrackingNo)
              "
              class="muted"
            >
              {{ order.shippingCompany || "物流" }}
              {{ order.shippingTrackingNo }}
            </p>
            <p v-if="order.reconciliationRequired" class="error">
              需核对微信订单状态，库存暂保留，请勿手动回库。
            </p>
          </div>
          <button
            v-if="canShip(order) && shippingConflictId !== order.id"
            class="primary button"
            @click="openShipping(order)"
          >
            确认发货
          </button>
        </div>
        <p class="order-summary">
          {{ order.items[0]?.productName
          }}<template v-if="order.items.length > 1">
            等 {{ order.items.length }} 种商品</template
          >
        </p>
        <div class="action-row">
          <button class="text-button" @click="toggleDetail(order.id)">
            {{ detailed.has(order.id) ? "隐藏明细" : "展开商品明细" }}</button
          ><button class="text-button" @click="toggle(order)">
            {{ revealed.has(order.id) ? "隐藏收货信息" : "查看收货信息" }}
          </button>
        </div>
        <div class="order-contact">
          <span>收货人：{{ order.recipientName }}</span>
          <span
            >手机号：{{
              revealed.has(order.id) ? order.phone : maskPhone(order.phone)
            }}</span
          >
          <span
            >地址：{{
              revealed.has(order.id) ? order.address : "••••••••••••••••"
            }}</span
          >
        </div>
        <div v-if="detailed.has(order.id)" class="order-detail">
          <p v-for="item in order.items" :key="item.id" class="muted">
            {{ item.productName }} × {{ item.quantity }} ·
            {{ money(item.priceCents * item.quantity) }}
            <span v-if="item.tierName">
              · {{ item.tierName }}优惠价 {{ money(item.priceCents) }} /
              件</span
            >
          </p>
          <p class="muted">实付合计 {{ money(order.totalCents) }}</p>
        </div>
        <p class="muted">
          <template v-if="order.totalCents === 0 && !order.paymentTransactionId"
            >免支付订单，无微信交易号</template
          >
          <template v-else
            >微信交易号：{{
              order.paymentTransactionId || "尚未确认支付"
            }}</template
          >
          ·
          {{ displayDate(order.createdAt) }}
        </p>
      </article>
      <PaginationBar
        :page="orders.page"
        :page-size="orders.size"
        :total="orders.total"
        :has-more="orders.hasMore"
        :busy="busy"
        label="订单分页"
        @change="(next) => changePage(next - page)"
      />
    </section>
    <ConfirmDialog
      v-if="revealTarget"
      title="查看收货信息？"
      :description="`将显示订单 ${revealTarget.orderNo} 的完整手机号和地址，仅用于订单履约。`"
      confirm-label="确认查看"
      @cancel="revealTarget = null"
      @confirm="confirmReveal"
    />
    <FormModal
      :busy="busy"
      v-if="shipping"
      label="确认订单已发货"
      @close="closeShipping"
      ><template #title
        ><h2 id="shipping-dialog-title">确认订单已发货？</h2></template
      >

      <p>请确认商品已交给物流。</p>
      <!-- 弹窗打开后背景变暗，列出来自哪个订单，避免发错货。 -->
      <dl v-if="shipping" class="ship-order-summary">
        <div>
          <dt>订单号</dt>
          <dd>{{ shipping.orderNo }}</dd>
        </div>
        <div>
          <dt>收货人</dt>
          <dd>{{ shipping.recipientName }}</dd>
        </div>
        <div>
          <dt>商品</dt>
          <dd>
            <span v-for="item in shipping.items" :key="item.id">
              {{ item.productName }} × {{ item.quantity }}
            </span>
          </dd>
        </div>
      </dl>
      <p v-if="shippingError" role="alert" class="error-box">
        {{ shippingError }}
      </p>
      <label
        >物流公司<input
          v-model="shipCompany"
          maxlength="64"
          :disabled="busy"
          :placeholder="
            shipping.status === 'PAID'
              ? '微信支付订单必填，如顺丰速运 / SF'
              : '选填，如顺丰速运 / SF'
          "
      /></label>
      <label
        >运单号<input
          v-model="shipTracking"
          maxlength="64"
          :disabled="busy"
          :placeholder="
            shipping.status === 'PAID' ? '微信支付订单必填' : '选填'
          "
      /></label>
      <div class="dialog-actions">
        <button
          type="button"
          class="secondary"
          :disabled="busy"
          @click="closeShipping"
        >
          返回
        </button>
        <button
          type="button"
          class="primary"
          :disabled="
            busy ||
            shippingConflictId === shipping.id ||
            (shipping.status === 'PAID' &&
              (!shipCompany.trim() || !shipTracking.trim()))
          "
          @click="ship"
        >
          确认发货
        </button>
      </div>
    </FormModal>
    <ConfirmDialog
      v-if="pendingPayload"
      title="确认保存商品？"
      :description="`将保存商品「${pendingPayload.name}」：${pendingSummary}。保存后立即生效，历史订单金额保留。`"
      confirm-label="确认保存"
      :busy="busy"
      @cancel="cancelSave"
      @confirm="confirmSave"
    />
    <FormModal :busy="busy" v-if="formOpen" size="lg" @close="reset()"
      ><template #title
        ><h2>{{ editingId ? "编辑商品信息" : "创建商品" }}</h2></template
      >

      <p
        v-if="formError"
        ref="formErrorElement"
        class="error-box"
        role="alert"
        tabindex="-1"
      >
        {{ formError }}
      </p>
      <p v-if="categoriesError" class="error-box" role="alert">
        {{ categoriesError }}
        <button class="text-button" :disabled="busy" @click="loadCategories">
          重试
        </button>
      </p>
      <form id="shop-product-form" class="form-grid" @submit.prevent="save">
        <label
          >商品名称<input
            v-model="form.name"
            required
            maxlength="120"
            :disabled="busy"
        /></label>
        <label
          >商品分类<select
            v-model="form.categoryId"
            name="productCategory"
            :disabled="busy || !categories.length"
          >
            <option value="">请选择分类</option>
            <option
              v-for="category in categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select></label
        >
        <label
          >原价（元）<input
            v-model="form.originalPriceYuan"
            name="originalPrice"
            inputmode="decimal"
            required
            :disabled="busy"
        /></label>
        <label
          >现价（元）<input
            v-model="form.currentPriceYuan"
            name="currentPrice"
            inputmode="decimal"
            required
            :disabled="busy"
        /></label>
        <label
          >库存<input
            v-model="form.stock"
            type="number"
            min="0"
            max="1000000"
            required
            :disabled="busy"
        /></label>
        <label
          >销售状态<select v-model="form.status" :disabled="busy">
            <option value="ON_SALE">上架</option>
            <option value="OFF_SHELF">下架</option>
          </select></label
        >
        <label class="full-field"
          >商品说明<textarea
            v-model="form.description"
            required
            maxlength="20000"
            :disabled="busy"
          />
        </label>
        <ImageUpload
          class="full-field"
          label="上传商品图片"
          category="SHOP"
          :preview="form.imageUrl"
          preview-alt="商品图片预览"
          :disabled="busy"
          @uploaded="form.imageUrl = $event"
        />
      </form>
      <template #footer>
        <div class="dialog-actions">
          <button
            class="primary"
            type="submit"
            form="shop-product-form"
            :disabled="busy || !!categoriesError"
          >
            {{ busy ? "正在保存…" : "确认并保存" }}
          </button>
        </div>
      </template>
    </FormModal>
    <FormModal
      v-if="previewTarget"
      placement="right"
      size="sm"
      :title="`小程序详情预览 · ${previewTarget.name}`"
      @close="closePreview"
    >
      <ProductDetailPreview
        :product="previewTarget"
        :markdown="previewMarkdown"
        :content-loading="previewContentLoading"
        :content-error="previewContentError"
        subtitle="按当前已保存的商品信息与图文详情渲染"
        @retry-content="previewTarget && loadPreviewMarkdown(previewTarget.id)"
      />
    </FormModal>
  </main>
</template>

<style scoped>
#shop-category-manager:not([hidden]) {
  margin-bottom: 18px;
  padding: 16px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-surface);
}
.product-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
}
.section-heading h2 {
  margin: 0;
  font-size: 16px;
}
.order-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}
.order-title-line strong {
  font-size: 17px;
  font-variant-numeric: tabular-nums;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}
.full-field {
  grid-column: 1 / -1;
}
.full-field textarea {
  min-height: 120px;
}
.order-admin-card {
  margin-bottom: 12px;
  padding: 20px;
  overflow-wrap: anywhere;
  border: 1px solid var(--admin-line);
  border-radius: 14px;
  background: var(--admin-surface);
  box-shadow: var(--rf-shadow-sm);
}
.order-admin-card .section-heading {
  align-items: flex-start;
}
.order-admin-card p {
  margin: 4px 0;
}
.order-admin-card .record-id {
  font-size: 12px;
  color: var(--admin-muted);
}
.order-contact {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--admin-muted);
  font-size: 12px;
}
.ship-order-summary {
  display: grid;
  gap: 8px;
  margin: 0 0 16px;
  padding: 12px 14px;
  border: 1px solid var(--admin-line);
  border-radius: 10px;
  background: var(--rf-bg);
  font-size: 13px;
}
.ship-order-summary > div {
  display: grid;
  grid-template-columns: 4.5em minmax(0, 1fr);
  gap: 8px;
}
.ship-order-summary dt {
  color: var(--admin-muted);
}
.ship-order-summary dd {
  margin: 0;
  overflow-wrap: anywhere;
}
.ship-order-summary dd span {
  display: block;
}
.stock-warning {
  color: var(--rf-warning);
  font-weight: 600;
}
.stock-hint {
  display: block;
  margin-top: 2px;
  color: var(--rf-warning);
  font-size: 12px;
  white-space: nowrap;
}
.order-detail {
  margin: 12px 0;
  padding: 14px 16px;
  border: 1px solid var(--admin-line);
  border-radius: 10px;
  background: var(--rf-bg);
}
.order-detail p {
  margin: 4px 0;
}
@media (max-width: 760px) {
  .form-grid {
    gap: 14px 12px;
  }
}
</style>
