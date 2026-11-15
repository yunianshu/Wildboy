<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from "vue";
import { routeLocationKey, routerKey } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import { displayDate } from "../forms";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import FormModal from "../components/FormModal.vue";
import ImageUpload from "../components/ImageUpload.vue";
import RichContentEditor from "../components/RichContentEditor.vue";
import UiState from "../components/UiState.vue";
import type {
  Order,
  Page,
  Product,
  ProductCategory,
  ProductInput,
  ProductStatus,
} from "../types";

const contentOpen = ref(false);
const formOpen = ref(false);
const filterOpen = ref(false);
const formError = ref("");
const formErrorElement = ref<HTMLElement>();
const contentEditor = ref<{ canLeave: () => boolean } | null>(null);
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
  categoryFilterDraft = ref(""),
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
const router = inject(routerKey, null);
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

const filteredProducts = computed(() =>
  appliedCategory.value
    ? products.value.filter((p) => p.categoryId === appliedCategory.value)
    : products.value,
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
  contentOpen.value = false;
  formOpen.value = false;
  filterOpen.value = false;
  editingId.value = "";
  editingVersion.value = 0;
  pendingPayload.value = null;
  pendingSummary.value = "";
  busy.value = false;
  error.value = "";
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
    const [productData, orderData] = await Promise.all([
      request<Product[]>("/admin/shop/products"),
      request<Page<Order>>(`/admin/orders?page=${page.value}&size=20`),
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
  void load();
}
function openFilter() {
  categoryFilterDraft.value = appliedCategory.value;
  filterOpen.value = true;
}
function applyFilter() {
  appliedCategory.value = categoryFilterDraft.value;
  filterOpen.value = false;
}
function clearFilter() {
  appliedCategory.value = "";
  categoryFilterDraft.value = "";
  filterOpen.value = false;
}
function openNew() {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  formError.value = "";
  contentOpen.value = false;
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
  formOpen.value = true;
}
function edit(product: Product) {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  formError.value = "";
  contentOpen.value = false;
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
  formOpen.value = true;
}
function reset() {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  formError.value = "";
  contentOpen.value = false;
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
}
function closeContent() {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  contentOpen.value = false;
}
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
    reset();
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
</script>

<template>
  <main class="workspace">
    <section class="page-heading">
      <div>
        <h1>商城运营</h1>
      </div>
      <div v-show="tab === 'products'" class="action-row">
        <button class="secondary button" @click="openFilter">筛选商品</button>
        <button class="secondary button" @click="openNew">＋ 新商品</button>
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
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <section
      v-show="tab === 'products'"
      id="shop-products"
      class="editor-section"
    >
      <div class="section-heading">
        <h2>商品目录</h2>
        <span class="muted">{{ filteredProducts.length }} 件商品</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>分类</th>
              <th>原价 / 现价</th>
              <th>库存</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in filteredProducts" :key="product.id">
              <td>
                <strong>{{ product.name }}</strong>
              </td>
              <td>{{ product.categoryName || "未分类" }}</td>
              <td>
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
              <td>{{ product.stock }}</td>
              <td>{{ product.status === "ON_SALE" ? "上架" : "下架" }}</td>
              <td>
                <button class="text-button" @click="edit(product)">编辑</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section v-show="tab === 'orders'" id="shop-orders" class="editor-section">
      <div class="section-heading">
        <h2>装备订单</h2>
      </div>
      <div class="privacy-note">
        收货资料仅用于订单履约，请勿公开或用于无关营销。
      </div>
      <UiState v-if="busy && !orders.items.length" kind="loading" compact
        >正在加载订单…</UiState
      >
      <UiState v-else-if="!orders.items.length && !error" compact
        >还没有订单</UiState
      >
      <article
        v-for="order in orders.items"
        :key="order.id"
        class="order-admin-card"
        :aria-label="`订单 ${order.orderNo}`"
      >
        <div class="section-heading">
          <div>
            <strong
              >{{ orderStatuses[order.status] }} ·
              {{ money(order.totalCents) }}</strong
            >
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
            <p v-if="order.reconciliationRequired" class="error">
              需核对微信订单状态，库存暂保留，请勿手动回库。
            </p>
          </div>
          <button
            v-if="canShip(order) && shippingConflictId !== order.id"
            class="secondary button"
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
            {{ detailed.has(order.id) ? "隐藏明细" : "查看" }}</button
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
      <nav class="pagination" aria-label="订单分页">
        <button
          class="secondary"
          :disabled="busy || page === 0"
          @click="changePage(-1)"
        >
          上一页</button
        ><span>第 {{ page + 1 }} 页 · 共 {{ orders.total }} 笔</span
        ><button
          class="secondary"
          :disabled="busy || !orders.hasMore"
          @click="changePage(1)"
        >
          下一页
        </button>
      </nav>
    </section>
    <ConfirmDialog
      v-if="revealTarget"
      title="查看收货信息？"
      :description="`将显示订单 ${revealTarget.orderNo} 的完整手机号和地址，仅用于订单履约。`"
      confirm-label="确认查看"
      @cancel="revealTarget = null"
      @confirm="confirmReveal"
    />
    <div v-if="shipping" class="dialog-overlay" @click.self="closeShipping">
      <div class="dialog" role="dialog" aria-modal="true">
        <h2>确认订单已发货？</h2>
        <p>
          请在实际交给物流后确认发货。系统会为微信支付订单上报物流信息，
          可在微信「发货信息管理」中核对结果。
        </p>
        <p v-if="shippingError" role="alert" class="error-box">{{ shippingError }}</p>
        <label
          >物流公司<input
            v-model="shipCompany"
            maxlength="64"
            :disabled="busy"
            placeholder="名称或编码，如顺丰速运 / SF"
        /></label>
        <label
          >运单号<input
            v-model="shipTracking"
            maxlength="64"
            :disabled="busy"
            :placeholder="shipping.status === 'PAID' ? '微信支付订单必填' : '选填'"
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
      </div>
    </div>
    <ConfirmDialog
      v-if="pendingPayload"
      title="确认保存商品？"
      :description="`将保存商品「${pendingPayload.name}」：${pendingSummary}。保存后立即生效，历史订单金额保留。`"
      confirm-label="确认保存"
      :busy="busy"
      @cancel="cancelSave"
      @confirm="confirmSave"
    />
    <FormModal v-if="filterOpen" @close="filterOpen = false">
      <form class="form-section" @submit.prevent="applyFilter">
        <h2>筛选商品</h2>
        <label
          >商品分类<select v-model="categoryFilterDraft" name="categoryFilter">
            <option value="">全部分类</option>
            <option
              v-for="category in categories"
              :key="category.id"
              :value="category.id"
            >
              {{ category.name }}
            </option>
          </select></label
        >
        <div class="dialog-actions">
          <button type="button" @click="clearFilter">清除筛选</button
          ><button class="primary">应用筛选</button>
        </div>
      </form>
    </FormModal>
    <FormModal v-if="formOpen" size="lg" @close="reset">
      <div class="section-heading">
        <h2>{{ editingId ? "编辑商品" : "创建商品" }}</h2>
      </div>
      <p
        v-if="formError"
        ref="formErrorElement"
        class="error-box"
        role="alert"
        tabindex="-1"
      >
        {{ formError }}
      </p>
      <ImageUpload :disabled="busy" @uploaded="form.imageUrl = $event" />
      <p v-if="categoriesError" class="error-box" role="alert">
        {{ categoriesError }}
        <button class="text-button" :disabled="busy" @click="loadCategories">
          重新加载分类
        </button>
      </p>
      <form class="form-grid" @submit.prevent="save">
        <label
          >商品名称<input
            v-model="form.name"
            required
            maxlength="120"
            :disabled="busy"
        /></label>
        <ImageUpload :disabled="busy" @uploaded="form.imageUrl = $event" />
        <img
          v-if="form.imageUrl"
          class="cover-preview"
          :src="form.imageUrl"
          alt="商品图片预览"
        />
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
            <option value="ON_SALE">上架销售</option>
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
        <button class="primary" :disabled="busy || !!categoriesError">
          {{ busy ? "正在保存…" : "确认并保存" }}
        </button>
      </form>
      <button
        v-if="editingId"
        type="button"
        class="secondary content-button"
        @click="contentOpen = true"
      >
        编辑图文详情
      </button>
    </FormModal>
    <FormModal v-if="editingId && contentOpen" size="lg" @close="closeContent">
      <RichContentEditor
        ref="contentEditor"
        :path="`/admin/shop/products/${editingId}/content`"
        :disabled="busy"
      />
    </FormModal>
  </main>
</template>

<style scoped>
.editor-section {
  min-width: 0;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--admin-line);
  border-radius: var(--admin-radius);
  background: var(--admin-surface);
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
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}
.form-grid label {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.full-field {
  grid-column: 1 / -1;
}
.full-field textarea {
  min-height: 120px;
}
.form-grid .primary {
  justify-self: start;
}
.content-button {
  margin-top: 18px;
}
.order-admin-card {
  padding: 12px 0;
  border-top: 1px solid var(--admin-line);
  overflow-wrap: anywhere;
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
.order-detail {
  margin: 10px 0;
  padding: 12px 16px;
  border: 1px dashed var(--admin-line, #e5e8ec);
  border-radius: 8px;
  background: #fafafa;
}
.order-detail p {
  margin: 4px 0;
}
@media (max-width: 760px) {
  .editor-section {
    padding: 12px;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .full-field {
    grid-column: auto;
  }
}
</style>
