<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from "vue-router";
import { currentUser, errorMessage, request } from "../api";
import { askConfirm } from "../confirm";
import AppIcon from "../components/AppIcon.vue";
import ConfirmDialog from "../components/ConfirmDialog.vue";
import FormModal from "../components/FormModal.vue";
import ImageUpload from "../components/ImageUpload.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import ProductDetailPreview, {
  type ProductPreviewData,
} from "../components/ProductDetailPreview.vue";
import UiState from "../components/UiState.vue";
import type {
  Product,
  ProductCategory,
  ProductInput,
  ProductStatus,
} from "../types";

const route = useRoute();
const productId = computed(() => String(route.params.id));
const productPath = computed(
  () => `/admin/shop/products/${encodeURIComponent(productId.value)}`,
);
const backTarget = computed(() => ({ path: "/shop", query: route.query }));
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
const activeSection = ref<"basic" | "detail">("basic");

function scrollToSection(id: "product-basic" | "product-detail") {
  activeSection.value = id === "product-basic" ? "basic" : "detail";
  const reducedMotion = Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  document.getElementById(id)?.scrollIntoView?.({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
  });
}

const product = ref<Product | null>(null);
const categories = ref<ProductCategory[]>([]);
const categoriesError = ref("");
const loading = ref(false);
const savingBasic = ref(false);
const error = ref("");
const formError = ref("");
const formErrorElement = ref<HTMLElement>();
const saveNotice = ref("");
const editor = ref<InstanceType<typeof MarkdownEditor>>();
const savedVersion = ref<number | null>(null);
const detailPreviewOpen = ref(false);
const previewMarkdown = ref("");
const previewContentLoading = ref(false);
const previewContentError = ref("");
let previewEpoch = 0;
const pendingPayload = ref<(ProductInput & { version: number }) | null>(null);
const pendingSummary = ref("");
let pendingSaveContent = false;
let controller: AbortController | undefined;
let categoriesController: AbortController | undefined;
let generation = 0;

const form = ref({
  name: "",
  description: "",
  imageUrl: "",
  categoryId: "",
  originalPriceYuan: "99.00",
  currentPriceYuan: "99.00",
  stock: "0",
  status: "ON_SALE" as ProductStatus,
});
const baseline = ref({
  categoryId: "",
  priceCents: 0,
  originalPriceCents: 0,
});
const formSnapshot = ref("");

const basicDirty = computed(
  () => !!product.value && JSON.stringify(form.value) !== formSnapshot.value,
);
const contentDirty = computed(() => Boolean(editor.value?.dirty));
const anyDirty = computed(() => basicDirty.value || contentDirty.value);
const anyBusy = computed(
  () => savingBasic.value || Boolean(editor.value?.busy),
);

function syncFormFromProduct(p: Product) {
  form.value = {
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    categoryId: p.categoryId ?? "",
    originalPriceYuan: ((p.originalPriceCents ?? p.priceCents) / 100).toFixed(
      2,
    ),
    currentPriceYuan: (p.priceCents / 100).toFixed(2),
    stock: String(p.stock),
    status: p.status,
  };
  baseline.value = {
    categoryId: p.categoryId ?? "",
    priceCents: p.priceCents,
    originalPriceCents: p.originalPriceCents ?? p.priceCents,
  };
  formSnapshot.value = JSON.stringify(form.value);
}

async function loadCategories() {
  categoriesController?.abort();
  categoriesError.value = "";
  if (!currentUser.value) return;
  const attempt = new AbortController();
  categoriesController = attempt;
  try {
    const list = await request<ProductCategory[]>("/admin/shop/categories", {
      signal: attempt.signal,
    });
    if (!attempt.signal.aborted) {
      categories.value = Array.isArray(list) ? list : [];
    }
  } catch (e) {
    if (!attempt.signal.aborted) {
      categories.value = [];
      categoriesError.value = errorMessage(e);
    }
  }
}

async function loadProduct() {
  generation++;
  controller?.abort();
  product.value = null;
  savedVersion.value = null;
  detailPreviewOpen.value = false;
  previewEpoch++;
  previewMarkdown.value = "";
  previewContentLoading.value = false;
  previewContentError.value = "";
  saveNotice.value = "";
  error.value = "";
  formError.value = "";
  pendingPayload.value = null;
  pendingSummary.value = "";
  pendingSaveContent = false;
  if (!currentUser.value) return;
  const attempt = new AbortController();
  controller = attempt;
  loading.value = true;
  void loadCategories();
  try {
    const result = await request<Product>(productPath.value, {
      signal: attempt.signal,
    });
    if (!attempt.signal.aborted) {
      product.value = result;
      syncFormFromProduct(result);
    }
  } catch (e) {
    if (!attempt.signal.aborted) error.value = errorMessage(e);
  } finally {
    if (!attempt.signal.aborted) loading.value = false;
  }
}

function parseYuan(value: string) {
  const text = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const cents = Math.round(Number(text) * 100);
  return cents >= 1 && cents <= 100000000 ? cents : null;
}

const previewProduct = computed<ProductPreviewData>(() => {
  const currentCents =
    parseYuan(form.value.currentPriceYuan) ?? product.value?.priceCents ?? 0;
  const originalCents =
    parseYuan(form.value.originalPriceYuan) ??
    product.value?.originalPriceCents ??
    currentCents;
  const parsedStock = Number(form.value.stock);
  const categoryName =
    categories.value.find((c) => c.id === form.value.categoryId)?.name ||
    product.value?.categoryName;
  return {
    id: product.value?.id,
    name: form.value.name,
    description: form.value.description,
    imageUrl: form.value.imageUrl,
    categoryName,
    priceCents: currentCents,
    originalPriceCents: originalCents,
    stock: Number.isFinite(parsedStock) && parsedStock >= 0 ? Math.floor(parsedStock) : 0,
    status: form.value.status,
  };
});

async function loadPreviewMarkdown() {
  const token = ++previewEpoch;
  previewContentLoading.value = true;
  previewContentError.value = "";
  try {
    const res = await request<{ markdown?: string }>(
      `${productPath.value}/content/markdown`,
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

function openDetailPreview() {
  detailPreviewOpen.value = true;
  previewContentError.value = "";
  const liveContent =
    typeof editor.value?.readContent === "function"
      ? editor.value.readContent()
      : null;
  if (liveContent) {
    previewEpoch++;
    previewContentLoading.value = false;
    previewMarkdown.value = liveContent.markdown;
    return;
  }
  void loadPreviewMarkdown();
}

function closeDetailPreview() {
  previewEpoch++;
  detailPreviewOpen.value = false;
  previewContentLoading.value = false;
  previewContentError.value = "";
}

function showFormError(message: string) {
  formError.value = message;
  scrollToSection("product-basic");
  void nextTick(() => formErrorElement.value?.focus());
}

function validateBasicPayload(): (ProductInput & { version: number }) | null {
  if (!product.value) return null;
  formError.value = "";
  const name = form.value.name.trim(),
    imageUrl = form.value.imageUrl.trim(),
    stock = Number(form.value.stock);
  if (!name || name.length > 120 || !form.value.description.trim()) {
    showFormError("请填写商品名称和说明");
    return null;
  }
  if (!imageUrl) {
    showFormError("请上传商品图片");
    return null;
  }
  if (
    !/^https:\/\/[^\s]+$/.test(imageUrl) &&
    !/^\/assets\/[A-Za-z0-9_./-]+$/.test(imageUrl)
  ) {
    showFormError("商品图片须为 HTTPS 或 /assets/ 路径");
    return null;
  }
  const originalPriceCents = parseYuan(form.value.originalPriceYuan);
  if (originalPriceCents === null) {
    showFormError("请输入有效商品原价");
    return null;
  }
  const priceCents = parseYuan(form.value.currentPriceYuan);
  if (priceCents === null) {
    showFormError("请输入有效商品现价");
    return null;
  }
  if (originalPriceCents < priceCents) {
    showFormError("原价不能低于现价");
    return null;
  }
  if (
    categories.value.length &&
    !categories.value.some((c) => c.id === form.value.categoryId)
  ) {
    showFormError("选择有效的商品分类");
    return null;
  }
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) {
    showFormError("请输入有效库存整数");
    return null;
  }
  return {
    name,
    description: form.value.description,
    imageUrl,
    categoryId: form.value.categoryId,
    priceCents,
    originalPriceCents,
    stock,
    status: form.value.status,
    version: product.value.version,
  };
}

async function submitBasic(
  payload: ProductInput & { version: number },
  alsoSaveContent: boolean,
) {
  savingBasic.value = true;
  const n = generation;
  try {
    const updated = await request<Product>(productPath.value, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    if (n !== generation) return;
    product.value = updated;
    syncFormFromProduct(updated);
    if (alsoSaveContent && editor.value?.dirty && !editor.value.versionConflict) {
      await editor.value.save();
      saveNotice.value = "商品信息与图文已保存";
    } else {
      saveNotice.value = "商品信息已保存";
    }
  } catch (e) {
    if (n === generation) showFormError(errorMessage(e));
  } finally {
    if (n === generation) savingBasic.value = false;
  }
}

async function saveAll(onlyBasic = false) {
  if (anyBusy.value || pendingPayload.value) return;
  saveNotice.value = "";
  const needBasic = onlyBasic || basicDirty.value;
  const needContent =
    !onlyBasic &&
    contentDirty.value &&
    Boolean(editor.value?.ready && editor.value.loaded && !editor.value.versionConflict);
  if (needBasic) {
    if (categoriesError.value) {
      showFormError("请先重试加载商品分类后再保存");
      return;
    }
    const payload = validateBasicPayload();
    if (!payload) return;
    const commercialChange =
      payload.priceCents !== baseline.value.priceCents ||
      payload.originalPriceCents !== baseline.value.originalPriceCents ||
      payload.categoryId !== baseline.value.categoryId;
    if (commercialChange && categories.value.length) {
      const categoryName =
        categories.value.find((c) => c.id === payload.categoryId)?.name ||
        "未分类";
      pendingPayload.value = payload;
      pendingSummary.value = `分类「${categoryName}」、原价 ${money(payload.originalPriceCents)}、现价 ${money(payload.priceCents)}`;
      pendingSaveContent = needContent;
      return;
    }
    await submitBasic(payload, needContent);
    return;
  }
  if (needContent && editor.value) {
    await editor.value.save();
  }
}

async function confirmSaveBasic() {
  const payload = pendingPayload.value;
  const alsoContent = pendingSaveContent;
  if (!payload || savingBasic.value) return;
  pendingPayload.value = null;
  pendingSummary.value = "";
  pendingSaveContent = false;
  await submitBasic(payload, alsoContent);
}

function cancelSaveBasic() {
  if (!savingBasic.value) {
    pendingPayload.value = null;
    pendingSummary.value = "";
    pendingSaveContent = false;
  }
}

const canSave = computed(() => {
  if (anyBusy.value) return false;
  if (basicDirty.value) return !categoriesError.value;
  return Boolean(
    editor.value?.ready &&
      editor.value.loaded &&
      editor.value.dirty &&
      !editor.value.versionConflict,
  );
});

const saveStatusText = computed(() => {
  if (basicDirty.value && contentDirty.value) {
    return "商品信息与图文均有未保存修改";
  }
  if (basicDirty.value) return "商品信息有未保存修改";
  if (contentDirty.value) return "图文有未保存修改";
  if (savedVersion.value !== null && !saveNotice.value) {
    return `图文已保存 · 版本 ${savedVersion.value}`;
  }
  if (saveNotice.value) {
    return savedVersion.value !== null
      ? `${saveNotice.value} · 图文版本 ${savedVersion.value}`
      : saveNotice.value;
  }
  return "当前商品信息与图文已保存";
});

async function canLeave() {
  if (savingBasic.value || editor.value?.writeBusy) return false;
  if (basicDirty.value) {
    const ok = await askConfirm("商品信息有未保存修改，确定离开吗？");
    if (!ok) return false;
  }
  return (await editor.value?.canLeave()) ?? true;
}

async function loadLatest() {
  const current = editor.value;
  if (current && (await current.canLeave()) && current === editor.value) {
    savedVersion.value = null;
    await current.load();
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!basicDirty.value && !savingBasic.value && !editor.value?.dirty && !editor.value?.busy) {
    return;
  }
  event.preventDefault();
  event.returnValue = "";
}

watch([productId, currentUser], () => void loadProduct(), { immediate: true });
onBeforeRouteLeave((to) => to.path === "/login" || canLeave());
onBeforeRouteUpdate(
  (to, from) => to.params.id === from.params.id || canLeave(),
);
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onUnmounted(() => {
  controller?.abort();
  categoriesController?.abort();
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<template>
  <main class="workspace product-content">
    <header class="page-heading product-topbar">
      <div class="product-heading-copy">
        <div class="product-title-line">
          <h1>商品编辑</h1>
          <span
            v-if="product"
            class="status-pill inline"
            :class="
              form.status === 'ON_SALE' ? 'tone-success' : 'tone-neutral'
            "
          >
            {{ form.status === "ON_SALE" ? "上架" : "下架" }}
          </span>
        </div>
        <p>在同一页面完善商品基础信息与图文详情，统一保存生效。</p>
      </div>
      <div class="action-row">
        <button
          v-if="product"
          type="button"
          class="secondary"
          aria-haspopup="dialog"
          :aria-expanded="detailPreviewOpen"
          @click="openDetailPreview"
        >
          <AppIcon name="eye" :size="16" />小程序详情预览
        </button>
        <RouterLink class="secondary button" :to="backTarget">
          <AppIcon name="back" :size="16" />返回商品
        </RouterLink>
      </div>
    </header>

    <UiState v-if="loading" kind="loading" compact>正在读取商品…</UiState>
    <UiState v-else-if="error" kind="error" compact>
      {{ error }}
      <button type="button" class="secondary" @click="loadProduct">重试</button>
    </UiState>

    <div v-else-if="product" class="product-editor-layout">
      <nav class="product-section-nav" aria-label="商品编辑分区">
        <button
          type="button"
          :class="{ 'is-current': activeSection === 'basic' }"
          :aria-current="activeSection === 'basic' ? 'location' : undefined"
          @click="scrollToSection('product-basic')"
        >
          <span class="product-step-number">01</span>
          <span><strong>商品信息</strong><small>图片、价格与库存</small></span>
        </button>
        <button
          type="button"
          :class="{ 'is-current': activeSection === 'detail' }"
          :aria-current="activeSection === 'detail' ? 'location' : undefined"
          @click="scrollToSection('product-detail')"
        >
          <span class="product-step-number">02</span>
          <span><strong>图文详情</strong><small>卖点与使用说明</small></span>
        </button>
      </nav>

      <div class="product-editor-main">
        <section
          id="product-basic"
          class="product-info-card"
          aria-labelledby="product-info-title"
          @focusin="activeSection = 'basic'"
        >
          <header class="product-section-heading">
            <div class="product-section-title">
              <span class="product-section-number">01</span>
              <div>
                <h2 id="product-info-title">商品信息</h2>
                <p>基础资料、分类、售价、库存与商品主图</p>
              </div>
            </div>
            <span v-if="basicDirty" class="product-dirty-tag">有未保存修改</span>
          </header>

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
            <button
              type="button"
              class="text-button"
              :disabled="savingBasic"
              @click="loadCategories"
            >
              重试
            </button>
          </p>

          <form
            id="shop-product-form"
            class="form-grid"
            @submit.prevent="saveAll(true)"
          >
            <label
              >商品名称<input
                v-model="form.name"
                required
                maxlength="120"
                :disabled="savingBasic"
            /></label>
            <label
              >商品分类<select
                v-model="form.categoryId"
                name="productCategory"
                :disabled="savingBasic || !categories.length"
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
                :disabled="savingBasic"
            /></label>
            <label
              >现价（元）<input
                v-model="form.currentPriceYuan"
                name="currentPrice"
                inputmode="decimal"
                required
                :disabled="savingBasic"
            /></label>
            <label
              >库存<input
                v-model="form.stock"
                type="number"
                min="0"
                max="1000000"
                required
                :disabled="savingBasic"
            /></label>
            <label
              >销售状态<select v-model="form.status" :disabled="savingBasic">
                <option value="ON_SALE">上架</option>
                <option value="OFF_SHELF">下架</option>
              </select></label
            >
            <label class="full-field"
              >商品说明<textarea
                v-model="form.description"
                required
                maxlength="20000"
                :disabled="savingBasic"
              />
            </label>
            <ImageUpload
              class="full-field"
              label="上传商品图片"
              category="SHOP"
              :preview="form.imageUrl"
              preview-alt="商品图片预览"
              :disabled="savingBasic"
              @uploaded="form.imageUrl = $event"
            />
          </form>
        </section>

        <section
          id="product-detail"
          class="product-detail-card"
          aria-labelledby="product-detail-title"
          @focusin="activeSection = 'detail'"
        >
          <header class="product-section-heading">
            <div class="product-section-title">
              <span class="product-section-number">02</span>
              <div>
                <h2 id="product-detail-title">图文详情</h2>
                <p>展示商品卖点、规格参数与使用说明</p>
              </div>
            </div>
            <span class="product-detail-channel"
              ><AppIcon name="image" :size="16" />小程序商品详情页</span
            >
          </header>
          <MarkdownEditor
            media-category="SHOP"
            :key="productId"
            ref="editor"
            class="product-detail-editor"
            :path="`${productPath}/content/markdown`"
            :components="false"
            :height="620"
            placeholder="输入商品卖点、规格参数或使用说明，可直接粘贴图片…"
            managed-navigation
            @saved="savedVersion = $event"
          />
          <p class="product-editor-tip">
            建议先讲核心卖点，再补充规格与使用说明；修改商品信息或图文后，点击下方「保存商品」即可统一保存。
          </p>
        </section>

        <footer class="product-content-footer">
          <span
            class="product-save-status"
            :class="{ 'is-dirty': anyDirty }"
            role="status"
          >
            <i aria-hidden="true"></i>
            {{ saveStatusText }}
          </span>
          <div class="footer-actions">
            <button
              v-if="editor?.versionConflict"
              type="button"
              class="secondary"
              :disabled="anyBusy"
              @click="loadLatest"
            >
              读取最新版本
            </button>
            <button
              type="button"
              class="primary"
              :disabled="!canSave"
              @click="saveAll(false)"
            >
              {{ anyBusy ? "正在保存…" : "保存商品" }}
            </button>
          </div>
        </footer>
      </div>
    </div>

    <ConfirmDialog
      v-if="pendingPayload"
      title="确认保存商品？"
      :description="`将保存商品「${pendingPayload.name}」：${pendingSummary}。保存后立即生效，历史订单金额保留。`"
      confirm-label="确认保存"
      :busy="savingBasic"
      @cancel="cancelSaveBasic"
      @confirm="confirmSaveBasic"
    />
    <FormModal
      v-if="detailPreviewOpen && product"
      placement="right"
      size="sm"
      :title="`小程序详情预览 · ${form.name || product.name}`"
      @close="closeDetailPreview"
    >
      <ProductDetailPreview
        :product="previewProduct"
        :markdown="previewMarkdown"
        :content-loading="previewContentLoading"
        :content-error="previewContentError"
        subtitle="按当前编辑内容实时渲染（未保存修改也会同步呈现）"
        @retry-content="loadPreviewMarkdown"
      />
    </FormModal>
  </main>
</template>

<style scoped>
.product-content {
  max-width: 1400px;
}
.product-topbar {
  margin-bottom: 24px;
}
.product-heading-copy,
.product-editor-main {
  min-width: 0;
}
.product-title-line {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.product-heading-copy > p {
  margin: 7px 0 0;
  color: var(--rf-muted);
  font-size: 13px;
}
.product-editor-layout {
  display: grid;
  grid-template-columns: 176px minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}
.product-section-nav {
  position: sticky;
  top: 24px;
  display: grid;
  gap: 8px;
}
.product-section-nav button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 66px;
  padding: 10px;
  border-color: transparent;
  border-radius: 12px;
  color: var(--rf-muted);
  background: transparent;
  text-align: left;
  white-space: normal;
}
.product-section-nav button.is-current {
  border-color: var(--rf-line);
  color: var(--rf-ink);
  background: var(--rf-surface);
  box-shadow: var(--rf-shadow-sm);
}
.product-section-nav strong,
.product-section-nav small {
  display: block;
}
.product-section-nav strong {
  font-size: 13px;
  font-weight: 600;
}
.product-section-nav small {
  margin-top: 3px;
  color: var(--rf-muted);
  font-size: 11px;
  font-weight: 400;
}
.product-step-number,
.product-section-number {
  display: grid;
  place-items: center;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  color: var(--rf-primary-text);
  background: var(--rf-soft);
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.product-section-nav .is-current .product-step-number {
  color: #fff;
  background: var(--rf-primary);
  box-shadow: 0 4px 10px #167a5224;
}
.product-editor-main {
  display: grid;
  gap: 18px;
}
.product-info-card,
.product-detail-card {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--rf-line);
  border-radius: 14px;
  background: var(--rf-surface);
  box-shadow: var(--rf-shadow-sm);
  scroll-margin-top: 24px;
}
.product-section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 22px;
}
.product-section-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.product-section-title h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 650;
  line-height: 1.5;
}
.product-section-title p {
  margin: 3px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
}
.product-section-number {
  flex-basis: 34px;
  width: 34px;
  height: 34px;
}
.product-dirty-tag {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--rf-warning-bg);
  color: var(--rf-warning);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}
.product-overview {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 22px;
}
.product-cover {
  display: grid;
  place-items: center;
  flex: 0 0 128px;
  width: 128px;
  height: 128px;
  overflow: hidden;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  color: var(--rf-primary-text);
  background: var(--rf-soft);
}
.product-cover img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.product-overview-copy {
  min-width: 0;
}
.product-category {
  color: var(--rf-primary-text);
  font-size: 12px;
}
.product-overview-copy h3 {
  margin: 5px 0 8px;
  overflow-wrap: anywhere;
  font-size: 21px;
  font-weight: 650;
  line-height: 1.45;
}
.product-overview-copy p {
  margin: 0;
  color: var(--rf-muted);
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.product-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
  padding-top: 18px;
  border-top: 1px solid var(--rf-line);
}
.product-facts > div {
  padding-inline: 24px;
}
.product-facts > div:first-child {
  padding-left: 0;
}
.product-facts > div + div {
  border-left: 1px solid var(--rf-line);
}
.product-facts dt {
  color: var(--rf-muted);
  font-size: 12px;
}
.product-facts dd {
  margin: 4px 0 0;
  color: var(--rf-ink);
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.product-facts dd small {
  color: var(--rf-muted);
  font-size: 12px;
  font-weight: 400;
}
.product-facts .product-price {
  color: var(--rf-primary-text);
  font-size: 24px;
  font-weight: 700;
}
.product-facts del {
  color: var(--rf-muted);
  font-weight: 400;
}
.product-detail-channel {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  padding: 6px 9px;
  border-radius: 8px;
  color: var(--rf-primary-text);
  background: var(--rf-soft);
  font-size: 12px;
}
.product-detail-editor {
  margin-top: 0;
}
.product-detail-editor :deep(.vditor) {
  border: 1px solid var(--rf-line);
  border-radius: 10px;
  box-shadow: none;
}
.product-detail-editor :deep(.vditor-toolbar) {
  border-radius: 10px 10px 0 0;
}
.product-editor-tip {
  margin: 14px 0 0;
  color: var(--rf-muted);
  font-size: 12px;
  line-height: 1.8;
}
.product-content-footer {
  position: sticky;
  bottom: 12px;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px 14px 12px 18px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: #fffffff2;
  box-shadow: 0 10px 28px #183c2914;
  backdrop-filter: blur(14px);
}
.product-save-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--rf-muted);
  font-size: 12px;
}
.product-save-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--rf-success);
}
.product-save-status.is-dirty {
  color: var(--rf-warning);
}
.product-save-status.is-dirty i {
  background: var(--rf-warning);
}
.product-content-footer .footer-actions {
  margin: 0 0 0 auto;
}
@media (max-width: 1000px) {
  .product-editor-layout {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }
  .product-section-nav {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .product-section-nav button {
    min-height: 58px;
  }
}
@media (max-width: 720px) {
  .product-topbar {
    margin-bottom: 18px;
  }
  .product-heading-copy > p {
    font-size: 12px;
  }
  .product-info-card,
  .product-detail-card {
    padding: 18px 16px;
    border-radius: 12px;
  }
  .product-section-heading {
    gap: 10px;
    margin-bottom: 18px;
  }
  .product-section-title {
    gap: 9px;
  }
  .product-section-title h2 {
    font-size: 16px;
  }
  .product-section-title p {
    font-size: 11px;
  }
  .product-info-edit {
    padding-inline: 10px;
    font-size: 11px;
  }
  .product-info-edit .app-icon {
    display: none;
  }
  .product-overview {
    align-items: flex-start;
    gap: 14px;
    margin-bottom: 18px;
  }
  .product-cover {
    flex-basis: 92px;
    width: 92px;
    height: 92px;
  }
  .product-overview-copy h3 {
    margin-top: 3px;
    font-size: 17px;
  }
  .product-overview-copy p,
  .product-facts dt,
  .product-detail-channel,
  .product-editor-tip {
    font-size: 11px;
  }
  .product-facts > div {
    padding-inline: 12px;
  }
  .product-facts dd {
    font-size: 14px;
  }
  .product-facts .product-price {
    font-size: 20px;
  }
  .product-detail-channel {
    display: none;
  }
  .product-content-footer {
    position: static;
    padding: 12px;
  }
  .product-content-footer .footer-actions,
  .product-content-footer .primary {
    width: 100%;
  }
  .product-content-footer .footer-actions .secondary {
    flex: 1;
  }
}
</style>
