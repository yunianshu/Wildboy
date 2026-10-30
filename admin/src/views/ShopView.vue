<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import { currentUser, errorMessage, request } from "../api";
import { displayDate } from "../forms";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import FormModal from "../components/FormModal.vue";
import ImageUpload from "../components/ImageUpload.vue";
import RichContentEditor from "../components/RichContentEditor.vue";
import type { Order, Page, Product, ProductStatus } from "../types";

const contentOpen = ref(false);
const formOpen = ref(false);
const contentEditor = ref<{ canLeave: () => boolean } | null>(null);
const products = ref<Product[]>([]),
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
  editingVersion = ref<number | null>(null),
  revealed = ref(new Set<string>()),
  shipping = ref<Order | null>(null),
  form = ref({
    name: "",
    description: "",
    imageUrl: "/assets/equipment.jpg",
    priceYuan: "99.00",
    stock: "0",
    status: "ON_SALE" as ProductStatus,
  });
let generation = 0;
function clear() {
  generation++;
  products.value = [];
  orders.value = { items: [], total: 0, page: 0, size: 20, hasMore: false };
  revealed.value = new Set();
  shipping.value = null;
  contentOpen.value = false;
  formOpen.value = false;
  editingId.value = "";
  editingVersion.value = null;
  busy.value = false;
}
watch(currentUser, clear, { flush: "sync" });

function money(cents: number) {
  return `¥${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}
const orderStatuses = {
  PENDING_PAYMENT: "待支付",
  PAID: "已支付",
  CANCELLED: "已取消",
  SHIPPED: "已发货",
  REFUNDED: "已退款",
};
function maskPhone(phone: string) {
  return phone.length > 7
    ? `${phone.slice(0, 3)}••••${phone.slice(-4)}`
    : "••••";
}
function toggle(id: string) {
  const next = new Set(revealed.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  revealed.value = next;
}
async function load() {
  const n = ++generation;
  busy.value = true;
  error.value = "";
  revealed.value = new Set();
  try {
    const [productData, orderData] = await Promise.all([
      request<Product[]>("/admin/shop/products"),
      request<Page<Order>>(`/admin/orders?page=${page.value}&size=20`),
    ]);
    if (n !== generation) return;
    products.value = productData;
    orders.value = orderData;
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
function changePage(delta: number) {
  page.value = Math.max(0, page.value + delta);
  void load();
}
function openNew() {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  contentOpen.value = false;
  editingId.value = "";
  editingVersion.value = null;
  form.value = {
    name: "",
    description: "",
    imageUrl: "/assets/equipment.jpg",
    priceYuan: "99.00",
    stock: "0",
    status: "ON_SALE",
  };
  formOpen.value = true;
}
function edit(product: Product) {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  contentOpen.value = false;
  editingId.value = product.id;
  editingVersion.value = product.version;
  form.value = {
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    priceYuan: (product.priceCents / 100).toFixed(2),
    stock: String(product.stock),
    status: product.status,
  };
  formOpen.value = true;
}
function reset() {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  contentOpen.value = false;
  editingId.value = "";
  editingVersion.value = null;
  formOpen.value = false;
  form.value = {
    name: "",
    description: "",
    imageUrl: "/assets/equipment.jpg",
    priceYuan: "99.00",
    stock: "0",
    status: "ON_SALE",
  };
}
function closeContent() {
  if (contentEditor.value && !contentEditor.value.canLeave()) return;
  contentOpen.value = false;
}
async function save() {
  if (busy.value) return;
  error.value = "";
  const name = form.value.name.trim(),
    imageUrl = form.value.imageUrl.trim(),
    stock = Number(form.value.stock),
    priceCents = Math.round(Number(form.value.priceYuan) * 100);
  if (!name || name.length > 120 || !form.value.description.trim()) {
    error.value = "请填写商品名称和说明";
    return;
  }
  if (
    !/^https:\/\/[^\s]+$/.test(imageUrl) &&
    !/^\/assets\/[A-Za-z0-9_./-]+$/.test(imageUrl)
  ) {
    error.value = "商品图片须为 HTTPS 或 /assets/ 路径";
    return;
  }
  if (
    !Number.isInteger(priceCents) ||
    priceCents < 1 ||
    priceCents > 100000000
  ) {
    error.value = "请输入有效商品价格";
    return;
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    error.value = "请输入有效库存整数";
    return;
  }
  busy.value = true;
  const n = generation;
  try {
    const id = editingId.value;
    const payload = {
      name,
      description: form.value.description,
      imageUrl,
      priceCents,
      stock,
      status: form.value.status,
      ...(id ? { version: editingVersion.value } : {}),
    };
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
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
async function ship() {
  if (!shipping.value || busy.value) return;
  const order = shipping.value;
  const n = generation;
  busy.value = true;
  error.value = "";
  try {
    await request<Order>(`/admin/orders/${order.id}/ship`, {
      method: "POST",
      body: JSON.stringify({ version: order.version }),
    });
    if (n !== generation) return;
    shipping.value = null;
    await load();
  } catch (e) {
    if (n === generation) error.value = errorMessage(e);
  } finally {
    if (n === generation) busy.value = false;
  }
}
onMounted(load);
onUnmounted(clear);
</script>

<template>
  <main class="workspace">
    <section class="page-heading">
      <div>
        <h1>商城运营</h1>
      </div>
      <button class="secondary button" @click="openNew">＋ 新商品</button>
    </section>
    <p v-if="error" role="alert" class="error-box">
      {{ error }} <button class="text-button" @click="load">重试</button>
    </p>
    <section class="editor-section">
      <div class="section-heading">
        <h2>商品目录</h2>
        <span class="muted">{{ products.length }} 件商品</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>商品</th>
              <th>价格</th>
              <th>库存</th>
              <th>状态</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="product in products" :key="product.id">
              <td>
                <strong>{{ product.name }}</strong>
              </td>
              <td>{{ money(product.priceCents) }}</td>
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
    <section class="editor-section">
      <div class="section-heading">
        <h2>装备订单</h2>
      </div>
      <div class="privacy-note">
        收货资料仅用于订单履约，请勿公开或用于无关营销。
      </div>
      <div v-if="!orders.items.length" class="empty-state">还没有订单</div>
      <article
        v-for="order in orders.items"
        v-else
        :key="order.id"
        class="order-admin-card"
      >
        <div class="section-heading">
          <div>
            <strong
              >{{ orderStatuses[order.status] }} ·
              {{ money(order.totalCents) }}</strong
            >
            <p class="muted">订单号 {{ order.orderNo }}</p>
            <p v-if="order.reconciliationRequired" class="error">
              需核对微信订单状态，库存暂保留，请勿手动回库。
            </p>
          </div>
          <button
            v-if="order.status === 'PAID'"
            class="secondary button"
            @click="shipping = order"
          >
            确认发货
          </button>
        </div>
        <p v-for="item in order.items" :key="item.id">
          {{ item.productName }} × {{ item.quantity }}
        </p>
        <p>收货人：{{ order.recipientName }}</p>
        <p>
          手机号：{{
            revealed.has(order.id) ? order.phone : maskPhone(order.phone)
          }}
        </p>
        <p>
          地址：{{
            revealed.has(order.id) ? order.address : "••••••••••••••••"
          }}
        </p>
        <button class="text-button" @click="toggle(order.id)">
          {{ revealed.has(order.id) ? "隐藏收货信息" : "查看收货信息" }}
        </button>
        <p class="muted">
          微信交易号：{{ order.paymentTransactionId || "尚未确认支付" }} ·
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
      v-if="shipping"
      title="确认订单已发货？"
      description="只有实际交给物流后才应标记发货，操作会写入订单状态。"
      confirm-label="确认发货"
      :busy="busy"
      @cancel="!busy && (shipping = null)"
      @confirm="ship"
    />
    <FormModal v-if="formOpen" size="lg" @close="reset">
      <div class="section-heading">
        <h2>{{ editingId ? "编辑商品" : "创建商品" }}</h2>
      </div>
      <ImageUpload :disabled="busy" @uploaded="form.imageUrl = $event" />
      <form class="form-grid" @submit.prevent="save">
        <label
          >商品名称<input
            v-model="form.name"
            required
            maxlength="120"
            :disabled="busy"
        /></label>
        <label
          >图片地址<input v-model="form.imageUrl" required :disabled="busy"
        /></label>
        <label
          >价格（元）<input
            v-model="form.priceYuan"
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
        <button class="primary" :disabled="busy">
          {{ busy ? "正在保存…" : editingId ? "保存商品" : "创建商品" }}
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
  margin-top: 32px;
  padding: 26px;
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--paper);
}
.section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}
.section-heading h2 {
  margin: 0;
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
  padding: 22px 0;
  border-top: 1px solid var(--line);
}
.order-admin-card .section-heading {
  align-items: flex-start;
}
@media (max-width: 760px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
  .full-field {
    grid-column: auto;
  }
}
</style>
