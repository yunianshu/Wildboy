<script setup lang="ts">
import { computed, ref } from "vue";
import { activityStops } from "../boarding";
import { displayDate, fromShanghaiInput } from "../forms";
import { renderPreviewMarkdown } from "../previewMarkdown";
import {
  categories,
  type Category,
  type NavigationPoint,
  type Status,
} from "../types";
import "../styles/wechat-prose.css";
import AppIcon from "./AppIcon.vue";
import MiniprogramPhoneShell from "./MiniprogramPhoneShell.vue";

export interface ActivityPreviewData {
  id?: string;
  title: string;
  category: Category;
  coverUrl: string;
  galleryUrls: string[];
  summary: string;
  description: string;
  location: string;
  meetingPoint: string;
  boardingPoints?: string[];
  navigationPoints?: NavigationPoint[];
  startAt: string;
  endAt: string;
  registrationDeadline: string;
  capacity: number;
  priceCents: number;
  registeredCount?: number;
  pendingPaymentCount?: number;
  status?: Status;
}

const props = defineProps<{
  activity: ActivityPreviewData;
  markdown?: string;
  contentLoading?: boolean;
  contentError?: string;
  subtitle?: string;
}>();

defineEmits<{ retryContent: [] }>();

const boardingExpanded = ref(false);

function normalizeIso(value: string): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return fromShanghaiInput(value);
  }
  return value;
}

function formatDate(value: string): string {
  const iso = normalizeIso(value);
  return iso ? displayDate(iso, true) : "时间待定";
}

function formatShortDate(value: string): string {
  const iso = normalizeIso(value);
  return iso ? displayDate(iso, false) : "时间待定";
}

const startText = computed(() => formatShortDate(props.activity.startAt));
const endText = computed(() => formatDate(props.activity.endAt));
const deadlineText = computed(() =>
  formatDate(props.activity.registrationDeadline),
);

const categoryName = computed(
  () => categories[props.activity.category] || "活动",
);

const priceLabel = computed(() => {
  const cents = props.activity.priceCents;
  if (!Number.isFinite(cents) || cents <= 0) return "免费";
  return `¥${(cents / 100).toFixed(2)} / 人`;
});

const stopsInfo = computed(() => activityStops(props.activity));

const navPointsWithCoord = computed(() =>
  (stopsInfo.value.navigationPoints || []).filter(
    (p) =>
      typeof p.latitude === "number" &&
      typeof p.longitude === "number" &&
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude) &&
      Boolean(p.label?.trim()),
  ),
);

const destHasCoord = computed(() =>
  navPointsWithCoord.value.some((p) => p.kind === "DESTINATION"),
);

const meetHasCoord = computed(() =>
  navPointsWithCoord.value.some((p) => p.kind === "MEETING"),
);

const boardingStops = computed(() => {
  const navBoarding = (stopsInfo.value.navigationPoints || []).filter(
    (p) => p.kind === "BOARDING" && p.label?.trim(),
  );
  return stopsInfo.value.boardingPoints.map((label) => {
    const matched = navBoarding.find((n) => n.label.trim() === label.trim());
    const hasCoord =
      matched != null &&
      typeof matched.latitude === "number" &&
      typeof matched.longitude === "number" &&
      Number.isFinite(matched.latitude) &&
      Number.isFinite(matched.longitude);
    return {
      label,
      address: (matched?.address || label).trim(),
      hasCoord,
    };
  });
});

const renderedMarkdown = computed(() =>
  props.markdown?.trim() ? renderPreviewMarkdown(props.markdown) : "",
);

const registeredCount = computed(() => props.activity.registeredCount ?? 0);
const pendingPaymentCount = computed(
  () => props.activity.pendingPaymentCount ?? 0,
);
const capacity = computed(() =>
  Number.isFinite(props.activity.capacity) && props.activity.capacity > 0
    ? props.activity.capacity
    : 0,
);

const actionButton = computed(() => {
  const status = props.activity.status;
  if (status === "CANCELLED") return { label: "活动已取消", disabled: true };
  if (status === "DRAFT") return { label: "草稿 · 发布后可报名", disabled: true };
  const deadlineMs = Date.parse(normalizeIso(props.activity.registrationDeadline));
  if (Number.isFinite(deadlineMs) && deadlineMs < Date.now()) {
    return { label: "报名已截止", disabled: true };
  }
  if (capacity.value > 0 && registeredCount.value >= capacity.value) {
    return { label: "名额已满", disabled: true };
  }
  return {
    label: props.activity.priceCents > 0 ? "立即报名" : "免费报名",
    disabled: false,
  };
});
</script>

<template>
  <MiniprogramPhoneShell title="活动详情" :subtitle="subtitle">
    <div class="mp-activity-page">
      <div class="mp-cover-wrap">
        <img
          v-if="activity.coverUrl"
          class="mp-cover"
          :src="activity.coverUrl"
          alt="活动封面预览"
          referrerpolicy="no-referrer"
        />
        <div v-else class="mp-cover mp-cover-empty">
          <AppIcon name="mountain" :size="28" />
          <span>暂未上传活动封面</span>
        </div>
        <span class="mp-share-btn" aria-hidden="true">
          <AppIcon name="arrow" :size="15" />
        </span>
      </div>

      <div class="mp-head">
        <h3 class="mp-title">{{ activity.title || "未填写活动标题" }}</h3>
        <div class="mp-meta">{{ categoryName }} · {{ startText }} 出发</div>
      </div>

      <p class="mp-intro">{{ activity.summary || "暂未填写活动摘要" }}</p>

      <div v-if="activity.status === 'CANCELLED'" class="mp-notice">
        该活动已被主理人取消，请勿按原计划前往。
      </div>

      <section class="mp-section">
        <div class="mp-section-bar mp-section-bar-row">
          <span>活动安排</span>
          <span v-if="navPointsWithCoord.length" class="mp-nav-pill">
            <AppIcon name="location" :size="13" />
            <span>{{
              navPointsWithCoord.length > 1 ? "选择地点导航" : "打开地图导航"
            }}</span>
          </span>
        </div>
        <div class="mp-section-body">
          <div class="mp-fact-row">
            <span class="mp-fact-label">出发时间</span>
            <span>{{ startText }}</span>
          </div>
          <div class="mp-fact-row">
            <span class="mp-fact-label">结束时间</span>
            <span>{{ endText }}</span>
          </div>
          <div class="mp-fact-row">
            <span class="mp-fact-label">活动地点</span>
            <div class="mp-nav-value">
              <span class="mp-address">{{ activity.location || "待填写" }}</span>
              <span class="mp-nav-tag">{{ destHasCoord ? "导航" : "复制" }}</span>
            </div>
          </div>
          <div v-if="stopsInfo.meetingPoint" class="mp-fact-row">
            <span class="mp-fact-label">集合地点</span>
            <div class="mp-nav-value">
              <span class="mp-address">{{ stopsInfo.meetingPoint }}</span>
              <span class="mp-nav-tag">{{ meetHasCoord ? "导航" : "复制" }}</span>
            </div>
          </div>
          <div v-if="boardingStops.length" class="mp-fact-row mp-boarding-block">
            <button
              type="button"
              class="mp-boarding-toggle"
              :aria-expanded="boardingExpanded"
              @click="boardingExpanded = !boardingExpanded"
            >
              <span>{{
                boardingExpanded
                  ? "收起上车点"
                  : `查看上车点（${boardingStops.length}）`
              }}</span>
              <AppIcon
                :name="boardingExpanded ? 'up' : 'down'"
                :size="14"
              />
            </button>
            <div v-if="boardingExpanded" class="mp-boarding-list">
              <div
                v-for="stop in boardingStops"
                :key="stop.label"
                class="mp-boarding-chip"
              >
                <span class="mp-boarding-name">{{ stop.address }}</span>
                <span class="mp-nav-tag">{{
                  stop.hasCoord ? "导航" : "复制"
                }}</span>
              </div>
            </div>
          </div>
          <div class="mp-fact-row">
            <span class="mp-fact-label">报名截止</span>
            <span>{{ deadlineText }}</span>
          </div>
          <div class="mp-fact-row">
            <span class="mp-fact-label">同行名额</span>
            <span>
              共 {{ capacity }} 位，已占 {{ registeredCount }} 位
              <template v-if="pendingPaymentCount">
                （含 {{ pendingPaymentCount }} 位待付款）
              </template>
            </span>
          </div>
          <div class="mp-fact-row">
            <span class="mp-fact-label">标准费用</span>
            <div>
              <span class="mp-fact-price">{{ priceLabel }}</span>
              <span v-if="activity.priceCents > 0" class="mp-fee-note">
                会员优惠以报名报价为准
              </span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="activity.galleryUrls.length" class="mp-section">
        <div class="mp-section-bar">活动相册</div>
        <div class="mp-gallery-strip">
          <img
            v-for="(url, idx) in activity.galleryUrls"
            :key="`${url}-${idx}`"
            :src="url"
            :alt="`活动照片 ${idx + 1}`"
            referrerpolicy="no-referrer"
          />
        </div>
      </section>

      <section class="mp-section">
        <div class="mp-section-bar">线路与流程</div>
        <div class="mp-section-body">
          <p v-if="contentLoading" class="mp-muted">正在加载图文详情…</p>
          <div
            v-else-if="renderedMarkdown"
            class="mp-markdown"
            v-html="renderedMarkdown"
          ></div>
          <p v-else class="mp-body-copy">
            {{ activity.description || "暂未填写活动详情说明" }}
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
        </div>
      </section>

      <section class="mp-section">
        <div class="mp-section-bar">注意事项</div>
        <div class="mp-section-body">
          <p class="mp-signup-copy">
            天气、路况可能变化，请量力报名、备齐装备、出发前核对安排，并听从领队、不留痕迹。取消规则以报名截止和活动开始时间为准。
          </p>
        </div>
      </section>
    </div>

    <template #footer>
      <button
        type="button"
        class="mp-primary-btn"
        :disabled="actionButton.disabled"
      >
        {{ actionButton.label }}
      </button>
    </template>
  </MiniprogramPhoneShell>
</template>

<style scoped>
.mp-activity-page {
  padding-bottom: 18px;
  background: var(--rf-bg);
}

.mp-cover-wrap {
  position: relative;
}

.mp-cover {
  display: block;
  width: 100%;
  height: 196px;
  object-fit: cover;
  background: var(--rf-soft);
}

.mp-cover-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--rf-muted);
  font-size: 13px;
}

.mp-share-btn {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--rf-line);
  background: var(--rf-surface);
  color: var(--rf-ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(32, 55, 44, 0.12);
}

.mp-head {
  padding: 16px 14px 0;
  background: var(--rf-surface);
}

.mp-title {
  margin: 0;
  color: var(--rf-ink);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
}

.mp-meta {
  margin-top: 6px;
  color: var(--rf-muted);
  font-size: 12px;
  line-height: 1.5;
}

.mp-intro {
  margin: 0;
  padding: 10px 14px 16px;
  background: var(--rf-surface);
  color: var(--rf-ink);
  font-size: 14px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.mp-notice {
  margin: 10px 12px 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--rf-warning-bg);
  color: var(--rf-warning);
  font-size: 13px;
  line-height: 1.5;
}

.mp-section {
  margin: 10px 12px 0;
  border-radius: 12px;
  background: var(--rf-surface);
  overflow: hidden;
}

.mp-section-bar {
  padding: 14px 14px 6px;
  font-size: 16px;
  font-weight: 600;
  color: var(--rf-ink);
}

.mp-section-bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.mp-nav-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--rf-primary-text);
  font-size: 12px;
  font-weight: 600;
}

.mp-section-body {
  padding: 4px 14px 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--rf-ink);
}

.mp-fact-row {
  display: grid;
  grid-template-columns: 4.5em minmax(0, 1fr);
  gap: 8px;
  align-items: baseline;
  padding: 7px 0;
  overflow-wrap: anywhere;
}

.mp-fact-row + .mp-fact-row {
  border-top: 1px solid var(--rf-line);
}

.mp-fact-label {
  color: var(--rf-muted);
}

.mp-nav-value {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.mp-address {
  min-width: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.mp-nav-tag {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--rf-soft);
  color: var(--rf-primary-text);
  font-size: 11px;
  font-weight: 600;
}

.mp-boarding-block {
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
}

.mp-boarding-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--rf-primary-text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.mp-boarding-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.mp-boarding-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: var(--rf-bg);
}

.mp-boarding-name {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.mp-fact-price {
  color: var(--rf-primary-text);
  font-weight: 600;
}

.mp-fee-note {
  display: block;
  color: var(--rf-muted);
  font-size: 11px;
}

.mp-gallery-strip {
  display: flex;
  gap: 8px;
  padding: 4px 14px 14px;
  overflow-x: auto;
}

.mp-gallery-strip img {
  flex: 0 0 120px;
  width: 120px;
  height: 82px;
  object-fit: cover;
  border-radius: 8px;
  background: var(--rf-soft);
}

.mp-body-copy,
.mp-signup-copy {
  margin: 0;
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.mp-muted {
  margin: 0;
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

.mp-primary-btn {
  width: 100%;
  height: 42px;
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
  color: var(--rf-ink);
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
