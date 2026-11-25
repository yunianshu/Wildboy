<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from "vue-router";
import { currentUser, errorMessage, request } from "../api";
import AppIcon from "../components/AppIcon.vue";
import MarkdownEditor from "../components/MarkdownEditor.vue";
import UiState from "../components/UiState.vue";
import type { Product } from "../types";

const route = useRoute();
const productId = computed(() => String(route.params.id));
const productPath = computed(
  () => `/admin/shop/products/${encodeURIComponent(productId.value)}`,
);
const backTarget = computed(() => ({ path: "/shop", query: route.query }));
const basicEditTarget = computed(() => ({
  path: "/shop",
  query: {
    ...route.query,
    tab: "products",
    productId: productId.value,
    edit: productId.value,
  },
}));
const money = (cents: number) => `¥${(cents / 100).toFixed(2)}`;
function scrollToSection(id: string) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reducedMotion ? "auto" : "smooth",
    block: "start",
  });
}
const product = ref<Product | null>(null);
const loading = ref(false);
const error = ref("");
const editor = ref<InstanceType<typeof MarkdownEditor>>();
const savedVersion = ref<number | null>(null);
let controller: AbortController | undefined;

async function loadProduct() {
  controller?.abort();
  product.value = null;
  savedVersion.value = null;
  error.value = "";
  if (!currentUser.value) return;
  const attempt = new AbortController();
  controller = attempt;
  loading.value = true;
  try {
    const result = await request<Product>(productPath.value, {
      signal: attempt.signal,
    });
    if (!attempt.signal.aborted) product.value = result;
  } catch (e) {
    if (!attempt.signal.aborted) error.value = errorMessage(e);
  } finally {
    if (!attempt.signal.aborted) loading.value = false;
  }
}

async function canLeave() {
  return !editor.value?.writeBusy && ((await editor.value?.canLeave()) ?? true);
}

async function loadLatest() {
  const current = editor.value;
  if (current && (await canLeave()) && current === editor.value) {
    savedVersion.value = null;
    await current.load();
  }
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!editor.value?.dirty && !editor.value?.busy) return;
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
  window.removeEventListener("beforeunload", beforeUnload);
});
</script>

<template>
  <main class="workspace product-content">
    <header class="page-heading product-topbar">
      <div class="product-heading-copy">
        <div class="product-title-line">
          <h1>商品详情编辑</h1>
          <span
            v-if="product"
            class="status-pill inline"
            :class="
              product.status === 'ON_SALE' ? 'tone-success' : 'tone-neutral'
            "
          >
            {{ product.status === "ON_SALE" ? "销售中" : "已下架" }}
          </span>
        </div>
        <p>完善商品信息与详情，让用户快速了解并放心选择。</p>
      </div>
      <RouterLink class="secondary button" :to="backTarget">
        <AppIcon name="back" :size="16" />返回商品
      </RouterLink>
    </header>

    <UiState v-if="loading" kind="loading" compact>正在读取商品…</UiState>
    <UiState v-else-if="error" kind="error" compact>
      {{ error }}
      <button type="button" class="secondary" @click="loadProduct">重试</button>
    </UiState>

    <div v-else-if="product" class="product-editor-layout">
      <nav class="product-section-nav" aria-label="商品编辑分区">
        <button type="button" @click="scrollToSection('product-basic')">
          <span class="product-step-number"
            ><AppIcon name="check" :size="14"
          /></span>
          <span><strong>商品信息</strong><small>图片、价格与库存</small></span>
        </button>
        <button
          type="button"
          class="is-current"
          aria-current="location"
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
        >
          <header class="product-section-heading">
            <div class="product-section-title">
              <span class="product-section-number">01</span>
              <div>
                <h2 id="product-info-title">商品信息</h2>
                <p>当前商品的基础资料与销售信息</p>
              </div>
            </div>
            <RouterLink
              class="secondary button product-info-edit"
              :to="basicEditTarget"
              aria-label="编辑商品基本信息"
            >
              编辑商品信息<AppIcon name="arrow" :size="15" />
            </RouterLink>
          </header>
          <div class="product-overview">
            <div class="product-cover">
              <img
                v-if="product.imageUrl"
                :src="product.imageUrl"
                :alt="`${product.name}商品主图`"
                referrerpolicy="no-referrer"
              />
              <AppIcon v-else name="bag" :size="32" />
            </div>
            <div class="product-overview-copy">
              <span class="product-category">{{
                product.categoryName || "未分类"
              }}</span>
              <h3>{{ product.name }}</h3>
              <p>{{ product.description }}</p>
            </div>
          </div>
          <dl class="product-facts">
            <div>
              <dt>销售价</dt>
              <dd class="product-price">{{ money(product.priceCents) }}</dd>
            </div>
            <div>
              <dt>原价</dt>
              <dd>
                <del v-if="product.originalPriceCents > product.priceCents">
                  {{ money(product.originalPriceCents) }}
                </del>
                <template v-else>{{
                  money(product.originalPriceCents)
                }}</template>
              </dd>
            </div>
            <div>
              <dt>库存</dt>
              <dd>{{ product.stock }} <small>件</small></dd>
            </div>
          </dl>
        </section>

        <section
          id="product-detail"
          class="product-detail-card"
          aria-labelledby="product-detail-title"
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
            建议先讲核心卖点，再补充规格与使用说明；商品主图和价格请在上方「编辑商品信息」中修改。
          </p>
        </section>

        <footer class="product-content-footer">
          <span
            class="product-save-status"
            :class="{ 'is-dirty': editor?.dirty }"
            role="status"
          >
            <i aria-hidden="true"></i>
            {{
              editor?.dirty
                ? "图文有未保存修改"
                : savedVersion !== null
                  ? `图文已保存 · 版本 ${savedVersion}`
                  : "商品资料与图文分别保存"
            }}
          </span>
          <div class="footer-actions">
            <button
              v-if="editor?.versionConflict"
              type="button"
              class="secondary"
              :disabled="editor.busy"
              @click="loadLatest"
            >
              读取最新版本
            </button>
            <button
              type="button"
              class="primary"
              :disabled="
                !editor?.ready ||
                !editor.loaded ||
                !editor.dirty ||
                editor.busy ||
                editor.versionConflict
              "
              @click="editor?.save()"
            >
              保存图文
            </button>
          </div>
        </footer>
      </div>
    </div>
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
.product-info-edit {
  flex-shrink: 0;
  font-size: 12px;
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
