<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { renderPreviewMarkdown } from "../previewMarkdown";
import type { ProductStatus } from "../types";
import "../styles/wechat-prose.css";
import AppIcon from "./AppIcon.vue";
import MiniprogramPhoneShell from "./MiniprogramPhoneShell.vue";

export interface ProductPreviewData {
  id?: string;
  name: string;
  description: string;
  imageUrl: string;
  categoryName?: string;
  priceCents: number;
  originalPriceCents?: number;
  stock: number;
  status: ProductStatus;
}

const props = defineProps<{
  product: ProductPreviewData;
  markdown?: string;
  contentLoading?: boolean;
  contentError?: string;
  subtitle?: string;
}>();

defineEmits<{ retryContent: [] }>();

const quantity = ref(1);

watch(
  () => props.product.stock,
  (stock) => {
    const max = Math.max(1, Math.min(99, stock || 0));
    if (quantity.value > max) quantity.value = max;
  },
);

function money(cents: number): string {
  const safe = Number.isFinite(cents) && cents >= 0 ? cents : 0;
  return `¥${(safe / 100).toFixed(2)}`;
}

const priceText = computed(() => money(props.product.priceCents));
const originalPriceText = computed(() => {
  const orig = props.product.originalPriceCents;
  if (orig == null || orig <= props.product.priceCents) return "";
  return money(orig);
});
const totalText = computed(() =>
  money((props.product.priceCents || 0) * quantity.value),
);

const renderedMarkdown = computed(() =>
  props.markdown?.trim() ? renderPreviewMarkdown(props.markdown) : "",
);

function changeQuantity(delta: -1 | 1) {
  const max = Math.min(99, Math.max(1, props.product.stock || 0));
  const next = Math.min(max, Math.max(1, quantity.value + delta));
  quantity.value = next;
}
</script>

<template>
  <MiniprogramPhoneShell title="商品详情" :subtitle="subtitle">
    <div class="mp-product-page">
      <img
        v-if="product.imageUrl"
        class="mp-product-image"
        :src="product.imageUrl"
        alt="商品主图预览"
        referrerpolicy="no-referrer"
      />
      <div v-else class="mp-product-image mp-product-image-empty">
        <AppIcon name="bag" :size="28" />
        <span>暂未上传商品图片</span>
      </div>

      <div class="mp-product-content">
        <div v-if="product.status === 'OFF_SHELF'" class="mp-off-shelf-notice">
          当前商品处于下架状态，小程序端暂不对用户展示。
        </div>

        <h3 class="mp-product-title">{{ product.name || "未填写商品名称" }}</h3>

        <div class="mp-price-line">
          <div class="mp-price-wrap">
            <span class="mp-price">{{ priceText }}</span>
            <span v-if="originalPriceText" class="mp-original-price">{{
              originalPriceText
            }}</span>
          </div>
          <span class="mp-stock">{{
            product.stock > 0 ? `库存 ${product.stock} 件` : "暂时售罄"
          }}</span>
        </div>

        <div class="mp-detail-heading">装备细节</div>
        <p v-if="contentLoading" class="mp-muted">正在加载图文详情…</p>
        <div
          v-else-if="renderedMarkdown"
          class="mp-markdown"
          v-html="renderedMarkdown"
        ></div>
        <p v-else class="mp-body-copy">
          {{ product.description || "暂未填写商品说明" }}
        </p>
        <p v-if="contentError" class="mp-content-error">
          {{ contentError }}
          <button
            type="button"
            class="mp-retry-link"
            @click="$emit('retryContent')"
          >
            重试
          </button>
        </p>

        <div class="mp-notice">价格与库存以下单确认为准。</div>

        <div class="mp-quantity-row">
          <div>
            <div class="mp-small-title">购买数量</div>
            <div class="mp-muted-sm">单种商品最多 99 件</div>
          </div>
          <div class="mp-stepper">
            <button
              type="button"
              aria-label="减少购买数量"
              :disabled="quantity <= 1"
              @click="changeQuantity(-1)"
            >
              −
            </button>
            <span>{{ quantity }}</span>
            <button
              type="button"
              aria-label="增加购买数量"
              :disabled="quantity >= product.stock || quantity >= 99"
              @click="changeQuantity(1)"
            >
              +
            </button>
          </div>
        </div>

        <div class="mp-share-block">
          <div class="mp-muted-sm">登录后查看会员价</div>
          <button type="button" class="mp-secondary-btn">分享商品</button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="mp-purchase-bar">
        <div class="mp-purchase-total">
          <span class="mp-total-label">合计</span>
          <span class="mp-total-amount">{{ totalText }}</span>
        </div>
        <button
          type="button"
          class="mp-primary-btn"
          :disabled="product.stock <= 0 || product.status === 'OFF_SHELF'"
        >
          {{
            product.status === "OFF_SHELF"
              ? "已下架"
              : product.stock > 0
                ? "立即购买"
                : "暂时售罄"
          }}
        </button>
      </div>
    </template>
  </MiniprogramPhoneShell>
</template>

<style scoped>
.mp-product-page {
  background: var(--rf-surface);
  min-height: 100%;
  padding-bottom: 20px;
}

.mp-product-image {
  display: block;
  width: 100%;
  height: 220px;
  object-fit: cover;
  background: var(--rf-soft);
}

.mp-product-image-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--rf-muted);
  font-size: 13px;
}

.mp-product-content {
  padding: 16px 16px 0;
}

.mp-off-shelf-notice {
  margin-bottom: 12px;
  padding: 9px 12px;
  border-radius: 8px;
  background: var(--rf-warning-bg);
  color: var(--rf-warning);
  font-size: 12px;
  line-height: 1.5;
}

.mp-product-title {
  margin: 0 0 12px;
  color: var(--rf-ink);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.mp-price-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mp-price-wrap {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.mp-price {
  color: var(--rf-primary-text);
  font-size: 22px;
  font-weight: 700;
}

.mp-original-price {
  color: var(--rf-muted);
  font-size: 13px;
  text-decoration: line-through;
}

.mp-stock {
  color: var(--rf-muted);
  font-size: 12px;
}

.mp-detail-heading {
  margin: 22px 0 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--rf-ink);
}

.mp-body-copy {
  margin: 0;
  font-size: 14px;
  line-height: 1.75;
  color: var(--rf-ink);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.mp-muted {
  margin: 0;
  font-size: 13px;
  color: var(--rf-muted);
}

.mp-muted-sm {
  font-size: 12px;
  color: var(--rf-muted);
}

.mp-content-error {
  margin: 8px 0 0;
  color: var(--rf-danger);
  font-size: 12px;
}

.mp-retry-link {
  margin-left: 6px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--rf-primary-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: underline;
}

.mp-notice {
  margin: 16px 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--rf-soft);
  color: var(--rf-primary-text);
  font-size: 12px;
  line-height: 1.5;
}

.mp-quantity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.mp-small-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--rf-ink);
}

.mp-stepper {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  height: 36px;
  border: 1px solid var(--rf-line);
  border-radius: 8px;
  overflow: hidden;
}

.mp-stepper button {
  width: 36px;
  height: 36px;
  border: 0;
  background: var(--rf-soft);
  color: var(--rf-primary-text);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.mp-stepper button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.mp-stepper span {
  min-width: 34px;
  text-align: center;
  font-size: 14px;
  color: var(--rf-ink);
  font-variant-numeric: tabular-nums;
}

.mp-share-block {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.mp-secondary-btn {
  width: 100%;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--rf-line);
  background: var(--rf-surface);
  color: var(--rf-ink);
  font-size: 14px;
  font-weight: 600;
  cursor: default;
}

.mp-purchase-bar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.mp-purchase-total {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.mp-total-label {
  color: var(--rf-muted);
  font-size: 11px;
}

.mp-total-amount {
  color: var(--rf-primary-text);
  font-size: 17px;
  font-weight: 700;
}

.mp-primary-btn {
  flex: 1;
  height: 40px;
  border: 0;
  border-radius: 10px;
  background: var(--rf-primary);
  color: var(--rf-on-primary);
  font-size: 15px;
  font-weight: 600;
  cursor: default;
}

.mp-primary-btn:disabled {
  background: #c8d5ce;
  color: #5b6d63;
}

.mp-markdown {
  font-size: 14px;
  line-height: 1.75;
  color: var(--rf-ink);
}

.mp-markdown :deep(h1),
.mp-markdown :deep(h2),
.mp-markdown :deep(h3),
.mp-markdown :deep(h4) {
  margin: 12px 0 6px;
  color: var(--rf-ink);
  font-weight: 700;
  line-height: 1.4;
}

.mp-markdown :deep(h1) {
  font-size: 18px;
}
.mp-markdown :deep(h2) {
  font-size: 16px;
}
.mp-markdown :deep(h3) {
  font-size: 15px;
}

.mp-markdown :deep(p) {
  margin: 0 0 10px;
  overflow-wrap: anywhere;
}

.mp-markdown :deep(img) {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 8px 0;
}

.mp-markdown :deep(figure.mp-md-figure) {
  margin: 8px 0;
}

.mp-markdown :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 10px;
  border-left: 3px solid var(--rf-primary);
  background: var(--rf-soft);
  border-radius: 0 6px 6px 0;
}

.mp-markdown :deep(ul),
.mp-markdown :deep(ol) {
  margin: 6px 0 10px;
  padding-left: 18px;
}

.mp-markdown :deep(hr) {
  border: 0;
  border-top: 1px solid var(--rf-line);
  margin: 12px 0;
}

.mp-markdown :deep(.mp-md-table-wrap) {
  overflow-x: auto;
  margin: 8px 0;
}

.mp-markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.mp-markdown :deep(th),
.mp-markdown :deep(td) {
  border: 1px solid var(--rf-line);
  padding: 5px 7px;
  text-align: left;
}

.mp-markdown :deep(th) {
  background: var(--rf-surface-subtle);
  font-weight: 600;
}

.mp-markdown :deep(pre) {
  overflow-x: auto;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--rf-surface-subtle);
  font-size: 12px;
}
</style>
