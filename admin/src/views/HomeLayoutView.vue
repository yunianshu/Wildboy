<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute } from "vue-router";
import { ApiError, currentUser, errorMessage, request } from "../api";
import { askConfirm } from "../confirm";
import AppIcon from "../components/AppIcon.vue";
import FeaturedRankList from "../components/FeaturedRankList.vue";
import { displayDate } from "../forms";
import defaultBrandPreview from "../assets/platform-brand-original-transparent.png";
import ImageUpload from "../components/ImageUpload.vue";
import HomeGalleryPreview from "../components/HomeGalleryPreview.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import {
  categories,
  type Activity,
  type HomeActionLink,
  type HomeGallerySlide,
  type HomeFooterCell,
  type HomeFooterLayoutPreset,
  type HomeLayoutConfig,
  type HomeModuleId,
  type HomeQrImage,
  type HomeShortcutItem,
  type Page,
  type Product,
} from "../types";

const DEFAULT_BRAND = "/assets/platform-brand-original-transparent.png";
function brandPreviewUrl(url: string) {
  return url === DEFAULT_BRAND ? defaultBrandPreview : url;
}
const presetIconImages: Record<string, string> = {
  WEEKLY: "/assets/category-weekly.jpg",
  DOMESTIC: "/assets/category-domestic.jpg",
  QRCODE: "/assets/category-holiday.jpg",
  INTRO: "/assets/category-leisure.jpg",
};
const moduleLabels: Record<HomeModuleId, { title: string; desc: string }> = {
  HERO: { title: "顶部主视觉", desc: "头图、品牌标语与主标题" },
  SHORTCUTS: {
    title: "快捷入口区",
    desc: "首页入口、跳转链接和二维码",
  },
  ACTIVITIES: {
    title: "首页精选活动",
    desc: "选择活动并调整显示顺序",
  },
  SHOP: { title: "装备横幅与商品", desc: "横幅图文与首页精选装备" },
  GALLERY: { title: "山野之间轮播", desc: "自动取文章或自定义轮播图" },
  FOOTER: {
    title: "底部关注码与底图",
    desc: "自定义底图、说明和二维码的四格位置",
  },
};
const pageOptions = [
  ["WEEKLY", categories.WEEKLY],
  ["DOMESTIC", categories.DOMESTIC],
  ["HOLIDAY", categories.HOLIDAY],
  ["LEISURE", categories.LEISURE],
  ["ACTIVITIES", "全部活动"],
  ["SHOP", "装备商城"],
  ["PROFILE", "我的主页"],
] as const;
const iconPresets = [
  ["WEEKLY", "山野徒步图"],
  ["DOMESTIC", "远行山河图"],
  ["QRCODE", "露营星空图"],
  ["INTRO", "海岸休闲图"],
] as const;

type ArticleOption = { id: string; title: string; status: string };

const route = useRoute();
const layout = ref<HomeLayoutConfig | null>(null);
const footerCellLabels: Record<HomeFooterCell, string> = {
  BRAND: "品牌底图",
  TEXT: "关注说明",
  QR1: "二维码 1",
  QR2: "二维码 2",
};
const defaultFooterCells: HomeFooterCell[] = ["BRAND", "QR1", "TEXT", "QR2"];
const brandWidthPresets = [
  { label: "偏小", value: 160 },
  { label: "标准", value: 216 },
  { label: "偏大", value: 280 },
] as const;

type FooterSlotDef = { label: string; col: string; row: string };
type FooterPresetDef = {
  id: HomeFooterLayoutPreset;
  group: 2 | 3 | 4;
  label: string;
  hasColSplit: boolean;
  hasRowSplit: boolean;
  slots: FooterSlotDef[];
};

const footerPresets: FooterPresetDef[] = [
  {
    id: "TWO_LR",
    group: 2,
    label: "左右",
    hasColSplit: true,
    hasRowSplit: false,
    slots: [
      { label: "左侧", col: "1", row: "1" },
      { label: "右侧", col: "2", row: "1" },
    ],
  },
  {
    id: "TWO_TB",
    group: 2,
    label: "上下",
    hasColSplit: false,
    hasRowSplit: true,
    slots: [
      { label: "上方", col: "1", row: "1" },
      { label: "下方", col: "1", row: "2" },
    ],
  },
  {
    id: "THREE_L1_R2",
    group: 3,
    label: "左1右2",
    hasColSplit: true,
    hasRowSplit: true,
    slots: [
      { label: "左侧通高", col: "1", row: "1 / span 2" },
      { label: "右上", col: "2", row: "1" },
      { label: "右下", col: "2", row: "2" },
    ],
  },
  {
    id: "THREE_L2_R1",
    group: 3,
    label: "左2右1",
    hasColSplit: true,
    hasRowSplit: true,
    slots: [
      { label: "左上", col: "1", row: "1" },
      { label: "左下", col: "1", row: "2" },
      { label: "右侧通高", col: "2", row: "1 / span 2" },
    ],
  },
  {
    id: "THREE_T1_B2",
    group: 3,
    label: "上1下2",
    hasColSplit: true,
    hasRowSplit: true,
    slots: [
      { label: "上方通宽", col: "1 / span 2", row: "1" },
      { label: "左下", col: "1", row: "2" },
      { label: "右下", col: "2", row: "2" },
    ],
  },
  {
    id: "THREE_T2_B1",
    group: 3,
    label: "上2下1",
    hasColSplit: true,
    hasRowSplit: true,
    slots: [
      { label: "左上", col: "1", row: "1" },
      { label: "右上", col: "2", row: "1" },
      { label: "下方通宽", col: "1 / span 2", row: "2" },
    ],
  },
  {
    id: "FOUR_GRID",
    group: 4,
    label: "四宫格",
    hasColSplit: true,
    hasRowSplit: true,
    slots: [
      { label: "左上", col: "1", row: "1" },
      { label: "右上", col: "2", row: "1" },
      { label: "左下", col: "1", row: "2" },
      { label: "右下", col: "2", row: "2" },
    ],
  },
];

const footerPresetMap = Object.fromEntries(
  footerPresets.map((p) => [p.id, p]),
) as Record<HomeFooterLayoutPreset, FooterPresetDef>;

const footerPresetGroups = [2, 3, 4].map((count) => ({
  count,
  title: `${count} 区域`,
  items: footerPresets.filter((p) => p.group === count),
}));

const activeFooterCell = ref<HomeFooterCell>("BRAND");
const dragFooterPos = ref<number | null>(null);
const dragOverFooterPos = ref<number | null>(null);
const puzzleStageEl = ref<HTMLElement | null>(null);
const draggingSplit = ref<"col" | "row" | null>(null);

function normalizeFooterCells(order?: HomeFooterCell[]) {
  return Array.isArray(order) && order.length === 4 && defaultFooterCells.every((id) => order.includes(id))
    ? [...order] : [...defaultFooterCells];
}

function normalizeFooterPreset(preset?: HomeFooterLayoutPreset): HomeFooterLayoutPreset {
  return preset && preset in footerPresetMap ? preset : "FOUR_GRID";
}

function normalizeFooterRatio(value?: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(25, Math.min(75, Math.round(n))) : 50;
}

const footerCellsOrdered = computed<HomeFooterCell[]>(() =>
  normalizeFooterCells(layout.value?.footer.cellOrder),
);

const footerPresetDef = computed<FooterPresetDef>(
  () => footerPresetMap[normalizeFooterPreset(layout.value?.footer.layoutPreset)],
);

const footerColRatio = computed(() =>
  normalizeFooterRatio(layout.value?.footer.colRatio),
);

const footerRowRatio = computed(() =>
  normalizeFooterRatio(layout.value?.footer.rowRatio),
);

const footerActiveSlots = computed(() =>
  footerPresetDef.value.slots.map((slot, posIdx) => ({
    ...slot,
    posIdx,
    cellId: footerCellsOrdered.value[posIdx]!,
  })),
);

const footerSpareSlots = computed(() =>
  footerCellsOrdered.value
    .slice(footerPresetDef.value.slots.length)
    .map((cellId, idx) => ({
      cellId,
      posIdx: footerPresetDef.value.slots.length + idx,
    })),
);

const isDefaultFooterLayout = computed(
  () =>
    footerPresetDef.value.id === "FOUR_GRID" &&
    footerColRatio.value === 50 &&
    footerRowRatio.value === 50 &&
    footerCellsOrdered.value.every((id, idx) => id === defaultFooterCells[idx]),
);

const footerPuzzleGridStyle = computed(() => {
  const preset = footerPresetDef.value;
  return {
    gridTemplateColumns: preset.hasColSplit
      ? `minmax(0, ${footerColRatio.value}fr) minmax(0, ${100 - footerColRatio.value}fr)`
      : "minmax(0, 1fr)",
    gridTemplateRows: preset.hasRowSplit
      ? `minmax(0, ${footerRowRatio.value}fr) minmax(0, ${100 - footerRowRatio.value}fr)`
      : "minmax(0, 1fr)",
  };
});

const footerColSplitterStyle = computed(() => {
  const preset = footerPresetDef.value.id;
  const base: Record<string, string> = {
    left: `calc(${footerColRatio.value}% - 9px)`,
  };
  if (preset === "THREE_T1_B2") {
    base.top = `${footerRowRatio.value}%`;
    base.bottom = "0";
  } else if (preset === "THREE_T2_B1") {
    base.top = "0";
    base.bottom = `${100 - footerRowRatio.value}%`;
  } else {
    base.top = "0";
    base.bottom = "0";
  }
  return base;
});

const footerRowSplitterStyle = computed(() => {
  const preset = footerPresetDef.value.id;
  const base: Record<string, string> = {
    top: `calc(${footerRowRatio.value}% - 9px)`,
  };
  if (preset === "THREE_L1_R2") {
    base.left = `${footerColRatio.value}%`;
    base.right = "0";
  } else if (preset === "THREE_L2_R1") {
    base.left = "0";
    base.right = `${100 - footerColRatio.value}%`;
  } else {
    base.left = "0";
    base.right = "0";
  }
  return base;
});

function setFooterPreset(preset: HomeFooterLayoutPreset) {
  if (!layout.value) return;
  layout.value.footer.layoutPreset = preset;
  const activeIds = footerCellsOrdered.value.slice(0, footerPresetMap[preset].slots.length);
  if (!activeIds.includes(activeFooterCell.value)) {
    activeFooterCell.value = activeIds[0]!;
  }
}

function swapFooterPositions(fromPos: number, toPos: number) {
  const footer = layout.value?.footer;
  if (!footer || fromPos === toPos || fromPos < 0 || toPos < 0 || fromPos > 3 || toPos > 3) return;
  const order = normalizeFooterCells(footer.cellOrder);
  [order[fromPos], order[toPos]] = [order[toPos]!, order[fromPos]!];
  footer.cellOrder = order;
}

function moveFooterCellTo(cell: HomeFooterCell, targetPos: number) {
  const currentPos = footerCellsOrdered.value.indexOf(cell);
  if (currentPos >= 0 && currentPos !== targetPos) {
    swapFooterPositions(currentPos, targetPos);
  }
}

function swapSpareIntoActive(sparePosIdx: number) {
  const activePos = footerCellsOrdered.value.indexOf(activeFooterCell.value);
  const targetPos = activePos >= 0 && activePos < footerPresetDef.value.slots.length ? activePos : 0;
  const spareCell = footerCellsOrdered.value[sparePosIdx];
  swapFooterPositions(sparePosIdx, targetPos);
  if (spareCell) activeFooterCell.value = spareCell;
}

function resetFooterOrder() {
  if (!layout.value) return;
  layout.value.footer.layoutPreset = "FOUR_GRID";
  layout.value.footer.colRatio = 50;
  layout.value.footer.rowRatio = 50;
  layout.value.footer.cellOrder = [...defaultFooterCells];
}

function resetFooterRatios() {
  if (!layout.value) return;
  layout.value.footer.colRatio = 50;
  layout.value.footer.rowRatio = 50;
}

function nudgeFooterRatio(axis: "col" | "row", delta: number) {
  if (!layout.value) return;
  if (axis === "col") {
    layout.value.footer.colRatio = normalizeFooterRatio(footerColRatio.value + delta);
  } else {
    layout.value.footer.rowRatio = normalizeFooterRatio(footerRowRatio.value + delta);
  }
}

function onSplitPointerMove(e: PointerEvent) {
  const axis = draggingSplit.value;
  const stage = puzzleStageEl.value;
  if (!axis || !stage || !layout.value) return;
  const rect = stage.getBoundingClientRect();
  if (axis === "col" && rect.width > 0) {
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    layout.value.footer.colRatio = normalizeFooterRatio(pct);
  } else if (axis === "row" && rect.height > 0) {
    const pct = ((e.clientY - rect.top) / rect.height) * 100;
    layout.value.footer.rowRatio = normalizeFooterRatio(pct);
  }
}

function stopSplitDrag() {
  draggingSplit.value = null;
  window.removeEventListener("pointermove", onSplitPointerMove);
  window.removeEventListener("pointerup", stopSplitDrag);
  window.removeEventListener("pointercancel", stopSplitDrag);
}

function startSplitDrag(axis: "col" | "row", e: PointerEvent) {
  e.preventDefault();
  draggingSplit.value = axis;
  window.addEventListener("pointermove", onSplitPointerMove);
  window.addEventListener("pointerup", stopSplitDrag);
  window.addEventListener("pointercancel", stopSplitDrag);
}

function startFooterCellDrag(pos: number) {
  dragFooterPos.value = pos;
}

function dropFooterCell(targetPos: number) {
  if (dragFooterPos.value !== null) {
    swapFooterPositions(dragFooterPos.value, targetPos);
  }
  dragFooterPos.value = null;
  dragOverFooterPos.value = null;
}

function endFooterCellDrag() {
  dragFooterPos.value = null;
  dragOverFooterPos.value = null;
}

function footerSlotQrIndex(cell: HomeFooterCell): number | null {
  if (cell === "QR1") return 0;
  if (cell === "QR2") return 1;
  return null;
}

function footerCellMeta(cell: HomeFooterCell) {
  const footer = layout.value?.footer;
  if (!footer) return { active: false, badge: "未配置", tone: "muted" as const };
  const qrs = footer.followQrcodes;
  if (cell === "BRAND") {
    return footer.brandEnabled
      ? { active: true, badge: "显示中", tone: "ok" as const }
      : { active: false, badge: "已关闭", tone: "muted" as const };
  }
  if (!footer.followEnabled) {
    return { active: false, badge: "已关闭", tone: "muted" as const };
  }
  if (cell === "TEXT") {
    if (!qrs.length) return { active: false, badge: "缺二维码", tone: "warn" as const };
    if (!footer.followTitle.trim() && !footer.followSubtitle.trim()) {
      return { active: false, badge: "未填文案", tone: "muted" as const };
    }
    return { active: true, badge: "显示中", tone: "ok" as const };
  }
  const idx = cell === "QR1" ? 0 : 1;
  return qrs[idx]
    ? { active: true, badge: "显示中", tone: "ok" as const }
    : { active: false, badge: "未上传", tone: "muted" as const };
}

const footerPreviewCells = computed(() => {
  const footer = layout.value?.footer;
  if (!footer) return [];
  const codes = footer.followEnabled ? footer.followQrcodes : [];
  const map: Partial<Record<HomeFooterCell, { id: string; kind: "BRAND" | "TEXT" | "QR"; qr?: HomeQrImage }>> = {};
  if (footer.brandEnabled) map.BRAND = { id: "BRAND", kind: "BRAND" };
  if (codes.length && (footer.followTitle.trim() || footer.followSubtitle.trim()))
    map.TEXT = { id: "TEXT", kind: "TEXT" };
  if (codes[0]) map.QR1 = { id: "QR1", kind: "QR", qr: codes[0] };
  if (codes[1]) map.QR2 = { id: "QR2", kind: "QR", qr: codes[1] };
  const preset = footerPresetDef.value;
  const activeIds = normalizeFooterCells(footer.cellOrder).slice(0, preset.slots.length);
  const primary = activeIds.flatMap((id) => (map[id] ? [map[id]!] : []));
  const applyPresetStyles = preset.id !== "FOUR_GRID" && primary.length === preset.slots.length;
  return primary
    .map((cell, idx) => ({
      ...cell,
      style: applyPresetStyles
        ? {
            gridColumn: preset.slots[idx]!.col,
            gridRow: preset.slots[idx]!.row,
          }
        : undefined,
    }))
    .concat(
      codes.slice(2).map((qr, index) => ({
        id: "QR" + (index + 3),
        kind: "QR" as const,
        qr,
        style: undefined,
      })),
    );
});

const footerPreviewGridStyle = computed(() => {
  if (footerPreviewCells.value.length <= 1) return undefined;
  const preset = footerPresetDef.value;
  const style: Record<string, string> = {
    gridTemplateColumns: preset.hasColSplit
      ? `minmax(0, ${footerColRatio.value}fr) minmax(0, ${100 - footerColRatio.value}fr)`
      : "minmax(0, 1fr)",
  };
  if (preset.hasRowSplit && footerRowRatio.value !== 50) {
    style.gridTemplateRows = `minmax(0, ${footerRowRatio.value}fr) minmax(0, ${100 - footerRowRatio.value}fr)`;
    style.minHeight = "156px";
  }
  return style;
});

const snapshot = ref("");
const activeModule = ref<HomeModuleId>("ACTIVITIES");
const moduleEditor = ref<HTMLElement>();
watch(activeModule, () => {
  if (moduleEditor.value) moduleEditor.value.scrollTop = 0;
}, { flush: "post" });
const activeShortcutIdx = ref(0);
const loading = ref(false);
const saving = ref(false);
const conflict = ref(false);
const error = ref("");
const success = ref("");

const ACTIVITY_PAGE_SIZE = 50;
const activityCatalog = reactive(new Map<string, Activity>());
const activitySuggestions = ref<string[]>([]);
const activityPreviewLoading = ref(false);
const activityDetailsFailed = ref(false);
const activitySuggestionsFailed = ref(false);
const allActivities = computed(() => [...activityCatalog.values()]);
const activityPage = ref<Page<Activity> | null>(null);
const activityLoading = ref(false);
const activityError = ref("");
let activityRequest: AbortController | undefined;
const allProducts = ref<Product[]>([]);
const productCatalogState = ref<"loading" | "ready" | "error">("loading");
const allArticles = ref<ArticleOption[]>([]);
const activityFilter = ref("");
const dragModuleIdx = ref<number | null>(null);
const dragShortcutIdx = ref<number | null>(null);
const dragQrIdx = ref<number | null>(null);
const dragFollowQrIdx = ref<number | null>(null);

const dirty = computed(
  () => !!layout.value && JSON.stringify(layout.value) !== snapshot.value,
);

function emptyAction(type: HomeActionLink["type"] = "NONE"): HomeActionLink {
  return {
    type,
    page: type === "PAGE" ? "ACTIVITIES" : "",
    activityId: "",
    articleId: type === "ARTICLE" ? "OFFICIAL" : "",
    wechatArticleUrl: "",
    popupTitle: "",
    popupText: "",
    popupImages: [],
  };
}

function normalizeLoaded(raw: HomeLayoutConfig): HomeLayoutConfig {
  const copy = JSON.parse(JSON.stringify(raw)) as HomeLayoutConfig;
  copy.hero.action = copy.hero.action || emptyAction("NONE");
  copy.hero.action.popupImages = copy.hero.action.popupImages || [];
  copy.shortcuts.columns = copy.shortcuts.columns || 4;
  copy.shortcuts.items = (copy.shortcuts.items || []).map((item, idx) => {
    const imgs =
      item.popupImages ??
      (item.popupImageUrl ? [{ url: item.popupImageUrl, label: "" }] : []);
    return {
      ...item,
      id: item.id || `slot-${idx + 1}`,
      imageUrl: item.imageUrl || "",
      activityId: item.activityId || "",
      articleId: item.articleId || "",
      wechatArticleUrl: item.wechatArticleUrl || "",
      popupImages: imgs,
    };
  });
  copy.activities.featuredActivityIds =
    copy.activities.featuredActivityIds || [];
  copy.shop.featuredProductIds = copy.shop.featuredProductIds || [];
  copy.gallery.slides = (copy.gallery.slides || []).map((s, idx) => ({
    ...s,
    id: s.id || `slide-${idx + 1}`,
    action: s.action || emptyAction("NONE"),
  }));
  copy.footer.followQrcodes = copy.footer.followQrcodes || [];
  copy.footer.followTitle = copy.footer.followTitle || "";
  copy.footer.followSubtitle = copy.footer.followSubtitle || "";
  copy.footer.cellOrder = normalizeFooterCells(copy.footer.cellOrder);
  copy.footer.layoutPreset = normalizeFooterPreset(copy.footer.layoutPreset);
  copy.footer.colRatio = normalizeFooterRatio(copy.footer.colRatio);
  copy.footer.rowRatio = normalizeFooterRatio(copy.footer.rowRatio);
  copy.footer.brandImageUrl = copy.footer.brandImageUrl || DEFAULT_BRAND;
  copy.footer.brandWidthPx = copy.footer.brandWidthPx || 216;
  return copy;
}

async function load() {
  if (loading.value || saving.value || !currentUser.value) return;
  loading.value = true;
  error.value = "";
  success.value = "";
  conflict.value = false;
  try {
    const data = await request<HomeLayoutConfig>("/admin/home/layout");
    const normalized = normalizeLoaded(data);
    layout.value = normalized;
    snapshot.value = JSON.stringify(normalized);
    if (
      typeof route.query.section === "string" &&
      route.query.section in moduleLabels
    ) {
      activeModule.value = route.query.section as HomeModuleId;
    }
    void loadCatalogs(normalized.activities.featuredActivityIds);
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

async function loadActivityPage(page = 0) {
  activityRequest?.abort();
  const controller = new AbortController();
  activityRequest = controller;
  activityLoading.value = true;
  activityError.value = "";
  const params = new URLSearchParams({
    page: String(page),
    size: String(ACTIVITY_PAGE_SIZE),
    status: "PUBLISHED",
  });
  const keyword = activityFilter.value.trim();
  if (keyword) params.set("keyword", keyword);
  try {
    const result = await request<Page<Activity>>(
      `/admin/activities?${params}`,
      {
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) return;
    activityPage.value = result;
    for (const activity of result.items)
      activityCatalog.set(activity.id, activity);
  } catch (e) {
    if (!controller.signal.aborted) activityError.value = errorMessage(e);
  } finally {
    if (!controller.signal.aborted) activityLoading.value = false;
  }
}

watch(activityFilter, (_value, _previous, onCleanup) => {
  activityRequest?.abort();
  activityPage.value = null;
  activityLoading.value = true;
  activityError.value = "";
  const timer = setTimeout(() => void loadActivityPage(), 250);
  onCleanup(() => clearTimeout(timer));
});

async function loadCatalogs(featuredIds: string[]) {
  productCatalogState.value = "loading";
  await Promise.allSettled([
    loadActivityPreview(featuredIds),
    request<Product[]>("/admin/shop/products")
      .then((products) => {
        allProducts.value = products.filter((p) => p.status === "ON_SALE");
        productCatalogState.value = "ready";
      })
      .catch(() => {
        allProducts.value = [];
        productCatalogState.value = "error";
      }),
    request<Page<ArticleOption>>("/admin/articles?page=0&size=50").then(
      (page) => {
        allArticles.value = page.items.filter((a) => a.status === "PUBLISHED");
      },
    ),
  ]);
}

async function loadFeaturedActivities(ids: string[]) {
  await Promise.all(
    ids
      .filter((id) => !activityCatalog.has(id))
      .map(async (id) => {
        const activity = await request<Activity>(
          `/admin/activities/${encodeURIComponent(id)}`,
        );
        if (activity.status === "PUBLISHED") activityCatalog.set(id, activity);
      }),
  );
}

async function loadActivityPreview(featuredIds: string[]) {
  activityPreviewLoading.value = true;
  activityDetailsFailed.value = false;
  activitySuggestionsFailed.value = false;
  activityCatalog.clear();
  activitySuggestions.value = [];
  const [details, suggestions] = await Promise.allSettled([
    loadActivityPage().then(() => loadFeaturedActivities(featuredIds)),
    request<Activity[]>("/admin/home/activity-suggestions").then((items) => {
      for (const activity of items) activityCatalog.set(activity.id, activity);
      activitySuggestions.value = items.map((activity) => activity.id);
    }),
  ]);
  activityDetailsFailed.value = details.status === "rejected";
  activitySuggestionsFailed.value = suggestions.status === "rejected";
  activityPreviewLoading.value = false;
}

const activityOptions = computed(() => allActivities.value.map((activity) => ({
  id: activity.id,
  title: activity.title,
  imageUrl: activity.coverUrl,
  detail: activity.location,
})));
const productOptions = computed(() => allProducts.value.map((product) => ({
  id: product.id,
  title: product.name,
  imageUrl: product.imageUrl,
})));
const previewActivities = computed(() => {
  const config = layout.value?.activities;
  if (!config) return [];
  const ids = new Set(config.featuredActivityIds);
  if (config.autoFill) {
    for (const id of activitySuggestions.value) ids.add(id);
  }
  return [...ids].flatMap((id) => {
    const activity = activityCatalog.get(id);
    return activity ? [activity] : [];
  }).slice(0, config.maxCount);
});

const activityPreviewIncomplete = computed(() => {
  const config = layout.value?.activities;
  return activityDetailsFailed.value || (activitySuggestionsFailed.value &&
    config?.autoFill && previewActivities.value.length < config.maxCount);
});

const candidateActivities = computed(() => {
  if (!layout.value || !activityPage.value) return [];
  const chosen = new Set(layout.value.activities.featuredActivityIds);
  return activityPage.value.items.filter((a) => !chosen.has(a.id));
});

const activeShortcut = computed<HomeShortcutItem | null>(() => {
  const items = layout.value?.shortcuts.items;
  if (!items || !items.length) return null;
  return items[activeShortcutIdx.value] || items[0] || null;
});

function moveArrayItem<T>(arr: T[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= arr.length ||
    to >= arr.length
  )
    return;
  const [item] = arr.splice(from, 1);
  if (item !== undefined) arr.splice(to, 0, item);
}

// Module drag & reorder
function dropModule(toIdx: number) {
  if (!layout.value || dragModuleIdx.value === null) return;
  moveArrayItem(layout.value.modules, dragModuleIdx.value, toIdx);
  dragModuleIdx.value = null;
}

// Featured activities drag & reorder
function addFeaturedActivity(id: string) {
  if (!layout.value) return;
  const list = layout.value.activities.featuredActivityIds;
  if (list.length >= 12 || list.includes(id)) return;
  list.push(id);
}

// Shortcuts add/remove/drag
function addShortcut() {
  if (!layout.value || layout.value.shortcuts.items.length >= 8) return;
  layout.value.shortcuts.items.push({
    id: `slot-${Date.now().toString(36)}`,
    name: "新入口",
    icon: "WEEKLY",
    imageUrl: "",
    type: "PAGE",
    page: "ACTIVITIES",
    activityId: "",
    articleId: "OFFICIAL",
    wechatArticleUrl: "",
    popupTitle: "",
    popupText: "",
    popupImageUrl: "",
    popupImages: [],
  });
  activeShortcutIdx.value = layout.value.shortcuts.items.length - 1;
}
function removeShortcut(idx: number) {
  if (!layout.value || layout.value.shortcuts.items.length <= 1) return;
  layout.value.shortcuts.items.splice(idx, 1);
  if (activeShortcutIdx.value >= layout.value.shortcuts.items.length) {
    activeShortcutIdx.value = Math.max(
      0,
      layout.value.shortcuts.items.length - 1,
    );
  }
}
function dropShortcut(toIdx: number) {
  if (!layout.value || dragShortcutIdx.value === null) return;
  moveArrayItem(layout.value.shortcuts.items, dragShortcutIdx.value, toIdx);
  activeShortcutIdx.value = toIdx;
  dragShortcutIdx.value = null;
}
function addPopupQr(list: HomeQrImage[], url: string) {
  if (list.length >= 8) return;
  list.push({ url, label: "" });
}
function dropPopupQr(list: HomeQrImage[], toIdx: number) {
  if (dragQrIdx.value === null) return;
  moveArrayItem(list, dragQrIdx.value, toIdx);
  dragQrIdx.value = null;
}

// Shop featured products
const previewProducts = computed(() => {
  const shop = layout.value?.shop;
  if (!shop || !shop.showProducts) return [];
  const products = new Map(allProducts.value.map((product) => [product.id, product]));
  const ids = new Set(shop.featuredProductIds);
  if (shop.autoFill) {
    for (const id of products.keys()) ids.add(id);
  }
  return Array.from(ids)
    .map((id) => products.get(id))
    .filter((product): product is Product => !!product)
    .slice(0, shop.maxCount);
});

function toggleFeaturedProduct(id: string) {
  if (!layout.value) return;
  const list = layout.value.shop.featuredProductIds;
  const idx = list.indexOf(id);
  if (idx >= 0) list.splice(idx, 1);
  else if (list.length < 8) list.push(id);
}

// Custom gallery slides
function addGallerySlide(url: string) {
  if (!layout.value || layout.value.gallery.slides.length >= 10) return;
  const slide: HomeGallerySlide = {
    id: `slide-${Date.now().toString(36)}`,
    imageUrl: url,
    title: "山野时刻",
    subtitle: "一起走进自然",
    action: emptyAction("NONE"),
  };
  layout.value.gallery.slides.push(slide);
}

// Footer QRs
function addFollowQr(url: string) {
  if (!layout.value || layout.value.footer.followQrcodes.length >= 6) return;
  layout.value.footer.followQrcodes.push({ url, label: "扫码关注" });
}
function uploadFooterSlotQr(cell: "QR1" | "QR2", url: string) {
  if (!layout.value) return;
  const list = layout.value.footer.followQrcodes;
  const idx = cell === "QR1" ? 0 : 1;
  if (list[idx]) {
    list[idx]!.url = url;
    return;
  }
  if (list.length < 6) {
    list.push({ url, label: idx === 0 ? "官方公众号" : "扫码关注" });
    if (list.length === 1) activeFooterCell.value = "QR1";
  }
}
function removeFooterQr(idx: number) {
  if (!layout.value) return;
  layout.value.footer.followQrcodes.splice(idx, 1);
}
function dropFollowQr(toIdx: number) {
  if (!layout.value || dragFollowQrIdx.value === null) return;
  moveArrayItem(
    layout.value.footer.followQrcodes,
    dragFollowQrIdx.value,
    toIdx,
  );
  dragFollowQrIdx.value = null;
}

async function save() {
  if (!layout.value || saving.value || conflict.value) return;
  error.value = "";
  success.value = "";
  saving.value = true;
  try {
    const saved = await request<HomeLayoutConfig>("/admin/home/layout", {
      method: "PUT",
      body: JSON.stringify(layout.value),
    });
    const normalized = normalizeLoaded(saved);
    layout.value = normalized;
    snapshot.value = JSON.stringify(normalized);
    success.value = "首页配置已保存，小程序下拉或重新进入首页即刻生效。";
  } catch (e) {
    conflict.value = e instanceof ApiError && e.status === 409;
    error.value = conflict.value
      ? "首页配置已被其他管理员修改，请重新加载后再保存。"
      : errorMessage(e);
  } finally {
    saving.value = false;
  }
}

async function reloadAfterConflict() {
  if (
    !dirty.value ||
    (await askConfirm("重新加载将放弃当前未保存的首页修改，确定继续吗？"))
  ) {
    await load();
  }
}

function protectBeforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value || saving.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onBeforeRouteLeave(
  async (to) =>
    to.path === "/login" ||
    (!saving.value &&
      (!dirty.value || (await askConfirm("首页配置尚未保存，确定离开吗？")))),
);
watch(currentUser, (u) => {
  if (u) void load();
});
onMounted(() => {
  void load();
  window.addEventListener("beforeunload", protectBeforeUnload);
});
onUnmounted(() => {
  activityRequest?.abort();
  stopSplitDrag();
  window.removeEventListener("beforeunload", protectBeforeUnload);
});
</script>

<template>
  <main class="workspace layout-workspace">
    <header class="page-heading">
      <div>
        <h1>小程序首页配置</h1>
        <p class="muted">
          在这里统一管理小程序首页的快捷入口、精选活动和其他展示板块。
        </p>
      </div>
      <div class="heading-actions">
        <span v-if="dirty && !saving" class="dirty-badge" role="status"
          >有未保存改动</span
        >
        <button
          v-if="conflict"
          type="button"
          class="secondary"
          @click="reloadAfterConflict"
        >
          加载最新版本
        </button>
        <button
          type="button"
          class="primary"
          :disabled="saving || loading || conflict || !layout"
          @click="save"
        >
          {{ saving ? "正在保存…" : "保存首页配置" }}
        </button>
      </div>
    </header>

    <p v-if="success" role="status" class="success-box">{{ success }}</p>
    <p v-if="error" role="alert" class="error-box">{{ error }}</p>

    <UiState v-if="loading" kind="loading" compact>正在加载首页配置…</UiState>

    <div v-else-if="layout" class="builder-grid">
      <!-- Left: Draggable module rail -->
      <aside class="module-rail" aria-label="首页板块排序与显隐">
        <div class="rail-header">
          <h2>板块顺序与显隐</h2>
          <small>选择板块编辑，也可拖动调整顺序</small>
        </div>
        <ul class="module-list">
          <li
            v-for="(mod, idx) in layout.modules"
            :key="mod.id"
            class="module-card"
            :class="{
              'is-active': activeModule === mod.id,
              'is-disabled': !mod.enabled,
            }"
            draggable="true"
            @dragstart="dragModuleIdx = idx"
            @dragover.prevent
            @drop="dropModule(idx)"
            @click="activeModule = mod.id"
          >
            <div class="module-card-top">
              <button
                type="button"
                class="text-button module-select"
                :aria-pressed="activeModule === mod.id"
                @click.stop="activeModule = mod.id"
              >
                <span aria-hidden="true">{{ idx + 1 }}.</span>
                {{ moduleLabels[mod.id]?.title }}
              </button>
              <label class="switch-inline" @click.stop>
                <input v-model="mod.enabled" type="checkbox" />
                <span>{{ mod.enabled ? "显示" : "隐藏" }}</span>
              </label>
            </div>
            <small>{{ moduleLabels[mod.id]?.desc }}</small>
            <div class="module-move" @click.stop>
              <button
                type="button"
                class="text-button"
                :disabled="idx === 0"
                @click="moveArrayItem(layout.modules, idx, idx - 1)"
              >
                上移
              </button>
              <button
                type="button"
                class="text-button"
                :disabled="idx === layout.modules.length - 1"
                @click="moveArrayItem(layout.modules, idx, idx + 1)"
              >
                下移
              </button>
            </div>
          </li>
        </ul>
      </aside>

      <!-- Center: Active module editor -->
      <section ref="moduleEditor" class="module-editor">
        <!-- 1. HERO -->
        <div v-if="activeModule === 'HERO'" class="editor-panel">
          <h2>顶部主视觉（头图与主标题）</h2>
          <div class="image-setting-row">
            <img
              :src="layout.hero.imageUrl"
              alt="顶部主视觉预览"
              class="banner-thumb"
            />
            <div class="image-setting-controls">
              <ImageUpload
                label="上传替换顶部主图"
                @uploaded="layout.hero.imageUrl = $event"
              />
              <button
                v-if="layout.hero.imageUrl !== '/assets/hero-hiking.jpg'"
                type="button"
                class="text-button"
                @click="layout.hero.imageUrl = '/assets/hero-hiking.jpg'"
              >
                恢复默认山野主图
              </button>
            </div>
          </div>
          <div class="field-row">
            <label>
              左上角品牌名
              <input
                v-model="layout.hero.brandName"
                maxlength="24"
                placeholder="野小子"
              />
            </label>
            <label>
              左上角品牌副标
              <input
                v-model="layout.hero.brandCaption"
                maxlength="40"
                placeholder="野一点，自由一点"
              />
            </label>
          </div>
          <label>
            英文眉题 (Kicker)
            <input
              v-model="layout.hero.kicker"
              maxlength="60"
              placeholder="WILDBOY / OUTDOOR CLUB"
            />
          </label>
          <div class="field-row">
            <label>
              主标题
              <input
                v-model="layout.hero.title"
                maxlength="60"
                placeholder="去山野，找回自己。"
              />
            </label>
            <label>
              副标题
              <input
                v-model="layout.hero.subtitle"
                maxlength="80"
                placeholder="把日常留在身后 · 一起走出去"
              />
            </label>
          </div>
          <div class="sub-box">
            <h3>点击头图跳转动作（可选）</h3>
            <label>
              跳转方式
              <select v-model="layout.hero.action.type">
                <option value="NONE">不跳转（纯展示）</option>
                <option value="PAGE">打开小程序页面</option>
                <option value="ACTIVITY">打开指定活动</option>
                <option value="ARTICLE">打开小程序文章</option>
                <option value="WECHAT_ARTICLE">打开微信公众号文章</option>
              </select>
            </label>
            <label v-if="layout.hero.action.type === 'PAGE'">
              目标页面
              <select v-model="layout.hero.action.page">
                <option v-for="[k, label] in pageOptions" :key="k" :value="k">
                  {{ label }}
                </option>
              </select>
            </label>
            <label v-else-if="layout.hero.action.type === 'ACTIVITY'">
              选择活动
              <select v-model="layout.hero.action.activityId">
                <option value="">请选择活动</option>
                <option v-for="a in allActivities" :key="a.id" :value="a.id">
                  {{ a.title }}
                </option>
              </select>
            </label>
            <label v-else-if="layout.hero.action.type === 'ARTICLE'">
              选择文章
              <select v-model="layout.hero.action.articleId">
                <option value="OFFICIAL">官方介绍</option>
                <option
                  v-for="art in allArticles"
                  :key="art.id"
                  :value="art.id"
                >
                  {{ art.title }}
                </option>
              </select>
            </label>
            <label v-else-if="layout.hero.action.type === 'WECHAT_ARTICLE'">
              微信公众号文章链接
              <input
                v-model="layout.hero.action.wechatArticleUrl"
                placeholder="https://mp.weixin.qq.com/s/..."
              />
            </label>
          </div>
        </div>

        <!-- 2. SHORTCUTS -->
        <div v-else-if="activeModule === 'SHORTCUTS'" class="editor-panel">
          <div class="panel-head">
            <div>
              <h2>快捷入口区（支持自由增删、拖动排序、多二维码、跳公众号）</h2>
            </div>
            <div class="inline-controls">
              <label class="compact-select">
                每行列数
                <select v-model.number="layout.shortcuts.columns">
                  <option :value="2">每行 2 个</option>
                  <option :value="3">每行 3 个</option>
                  <option :value="4">每行 4 个</option>
                </select>
              </label>
              <button
                type="button"
                class="secondary"
                :disabled="layout.shortcuts.items.length >= 8"
                @click="addShortcut"
              >
                <AppIcon name="plus" :size="15" /> 新增入口
              </button>
            </div>
          </div>

          <div class="shortcut-chips">
            <div
              v-for="(sc, idx) in layout.shortcuts.items"
              :key="sc.id"
              class="shortcut-chip"
              :class="{ 'is-selected': activeShortcutIdx === idx }"
              draggable="true"
              @dragstart="dragShortcutIdx = idx"
              @dragover.prevent
              @drop="dropShortcut(idx)"
              @click="activeShortcutIdx = idx"
            >
              <img
                :src="
                  sc.imageUrl ||
                  presetIconImages[sc.icon] ||
                  presetIconImages.WEEKLY
                "
                alt=""
              />
              <span>{{ idx + 1 }}. {{ sc.name || "未命名" }}</span>
            </div>
          </div>

          <div v-if="activeShortcut" class="sub-box">
            <div class="panel-head">
              <h3>
                正在编辑第 {{ activeShortcutIdx + 1 }} 个入口：{{
                  activeShortcut.name
                }}
              </h3>
              <div class="inline-controls">
                <button
                  type="button"
                  class="text-button"
                  :disabled="activeShortcutIdx === 0"
                  @click="
                    moveArrayItem(
                      layout.shortcuts.items,
                      activeShortcutIdx,
                      activeShortcutIdx - 1,
                    );
                    activeShortcutIdx--;
                  "
                >
                  左移
                </button>
                <button
                  type="button"
                  class="text-button"
                  :disabled="
                    activeShortcutIdx === layout.shortcuts.items.length - 1
                  "
                  @click="
                    moveArrayItem(
                      layout.shortcuts.items,
                      activeShortcutIdx,
                      activeShortcutIdx + 1,
                    );
                    activeShortcutIdx++;
                  "
                >
                  右移
                </button>
                <button
                  v-if="layout.shortcuts.items.length > 1"
                  type="button"
                  class="text-button danger-text"
                  @click="removeShortcut(activeShortcutIdx)"
                >
                  删除此入口
                </button>
              </div>
            </div>

            <div class="field-row">
              <label>
                入口名称（1–12字）
                <input
                  v-model="activeShortcut.name"
                  maxlength="12"
                  placeholder="如：关于野小子"
                />
              </label>
              <label>
                默认底图风格（未上传自定义图时使用）
                <select v-model="activeShortcut.icon">
                  <option v-for="[k, label] in iconPresets" :key="k" :value="k">
                    {{ label }}
                  </option>
                </select>
              </label>
            </div>

            <div class="image-setting-row">
              <img
                :src="
                  activeShortcut.imageUrl ||
                  presetIconImages[activeShortcut.icon] ||
                  presetIconImages.WEEKLY
                "
                alt="入口背景图"
                class="small-thumb"
              />
              <div class="image-setting-controls">
                <ImageUpload
                  label="上传自定义入口封面图"
                  @uploaded="activeShortcut.imageUrl = $event"
                />
                <button
                  v-if="activeShortcut.imageUrl"
                  type="button"
                  class="text-button"
                  @click="activeShortcut.imageUrl = ''"
                >
                  恢复使用预设底图
                </button>
              </div>
            </div>

            <label>
              点击后执行动作
              <select
                v-model="activeShortcut.type"
                @change="activeShortcut.articleId = ''"
              >
                <option value="PAGE">打开小程序内页面</option>
                <option value="WECHAT_ARTICLE">
                  微信公众号文章（介绍入口先在小程序内阅读）
                </option>
                <option value="POPUP">
                  弹出二维码 / 图文说明（支持上传多个二维码）
                </option>
                <option value="ACTIVITY">打开指定活动详情</option>
                <option value="ARTICLE">打开小程序内置文章</option>
              </select>
            </label>

            <label v-if="activeShortcut.type === 'PAGE'">
              选择小程序页面
              <select v-model="activeShortcut.page">
                <option v-for="[k, label] in pageOptions" :key="k" :value="k">
                  {{ label }}
                </option>
              </select>
            </label>

            <div
              v-else-if="activeShortcut.type === 'WECHAT_ARTICLE'"
              class="wechat-tip-box"
            >
              <label>
                微信公众号文章链接（必须为已发布公开文章）
                <input
                  v-model="activeShortcut.wechatArticleUrl"
                  placeholder="https://mp.weixin.qq.com/s/..."
                />
              </label>
              <small class="field-hint">
                复制公众号后台或微信内「复制链接」得到的
                https://mp.weixin.qq.com/s/...
                选择「海岸休闲图」的入口会先显示小程序介绍，
                公众号原文链接放在介绍页底部。其他入口直接打开公众号文章。
              </small>
              <template v-if="activeShortcut.icon === 'INTRO'">
                <label>
                  小程序介绍正文
                  <select
                    v-model="activeShortcut.articleId"
                    aria-label="小程序介绍正文"
                  >
                    <option value="">内置介绍</option>
                    <option
                      v-if="
                        activeShortcut.articleId &&
                        !allArticles.some(
                          (a) => a.id === activeShortcut?.articleId,
                        )
                      "
                      :value="activeShortcut.articleId"
                    >
                      当前文章不在已发布列表中
                    </option>
                    <option
                      v-for="art in allArticles"
                      :key="art.id"
                      :value="art.id"
                    >
                      {{ art.title }}
                    </option>
                  </select>
                </label>
                <small class="field-hint">
                  到文章管理新建或编辑文章，点「粘贴公众号」导入正文和图片。发布后在这里选中，再保存首页配置。
                  以后更新同一篇文章，先撤回为草稿，修改后重新发布，不用再改首页配置。
                </small>
                <RouterLink
                  class="text-button"
                  :to="
                    allArticles.some((a) => a.id === activeShortcut?.articleId)
                      ? '/articles/' + activeShortcut.articleId + '/edit'
                      : '/articles'
                  "
                >
                  {{
                    allArticles.some((a) => a.id === activeShortcut?.articleId)
                      ? "编辑这篇介绍"
                      : "去文章管理"
                  }}
                </RouterLink>
              </template>
            </div>

            <label v-else-if="activeShortcut.type === 'ACTIVITY'">
              选择目标活动
              <select v-model="activeShortcut.activityId">
                <option value="">请选择已发布活动</option>
                <option v-for="a in allActivities" :key="a.id" :value="a.id">
                  {{ a.title }}
                </option>
              </select>
            </label>

            <label v-else-if="activeShortcut.type === 'ARTICLE'">
              选择小程序内置文章
              <select v-model="activeShortcut.articleId">
                <option value="OFFICIAL">官方介绍</option>
                <option
                  v-for="art in allArticles"
                  :key="art.id"
                  :value="art.id"
                >
                  {{ art.title }}
                </option>
              </select>
            </label>

            <div
              v-else-if="activeShortcut.type === 'POPUP'"
              class="popup-qr-editor"
            >
              <label>
                弹窗标题
                <input
                  v-model="activeShortcut.popupTitle"
                  maxlength="80"
                  placeholder="如：添加领队 / 扫码进活动群"
                />
              </label>
              <label>
                弹窗文字说明（选填）
                <textarea
                  v-model="activeShortcut.popupText"
                  rows="3"
                  maxlength="2000"
                  placeholder="如：长按二维码即可识别添加客服或关注公众号"
                />
              </label>
              <div class="qr-section-head">
                <strong
                  >二维码 / 图片列表（{{ activeShortcut.popupImages.length }} /
                  8，可拖动排序）</strong
                >
                <ImageUpload
                  v-if="activeShortcut.popupImages.length < 8"
                  :key="`sc-qr-${activeShortcut.popupImages.length}`"
                  label="上传二维码图片"
                  @uploaded="addPopupQr(activeShortcut.popupImages, $event)"
                />
              </div>
              <div
                v-if="activeShortcut.popupImages.length"
                class="qr-cards-grid"
              >
                <div
                  v-for="(qr, qIdx) in activeShortcut.popupImages"
                  :key="qIdx"
                  class="qr-card"
                  draggable="true"
                  @dragstart="dragQrIdx = qIdx"
                  @dragover.prevent
                  @drop="dropPopupQr(activeShortcut.popupImages, qIdx)"
                >
                  <img :src="qr.url" alt="二维码预览" />
                  <input
                    v-model="qr.label"
                    maxlength="40"
                    placeholder="二维码名称（如：客服微信）"
                  />
                  <div class="qr-card-actions">
                    <button
                      type="button"
                      class="text-button"
                      :disabled="qIdx === 0"
                      @click="
                        moveArrayItem(
                          activeShortcut.popupImages,
                          qIdx,
                          qIdx - 1,
                        )
                      "
                    >
                      前移
                    </button>
                    <button
                      type="button"
                      class="text-button"
                      :disabled="qIdx === activeShortcut.popupImages.length - 1"
                      @click="
                        moveArrayItem(
                          activeShortcut.popupImages,
                          qIdx,
                          qIdx + 1,
                        )
                      "
                    >
                      后移
                    </button>
                    <button
                      type="button"
                      class="text-button danger-text"
                      @click="activeShortcut.popupImages.splice(qIdx, 1)"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. ACTIVITIES (Drag-sort 6 activities!) -->
        <div v-else-if="activeModule === 'ACTIVITIES'" class="editor-panel">
          <h2>首页精选活动</h2>
          <div class="field-row">
            <label>
              英文眉题
              <input v-model="layout.activities.eyebrow" maxlength="80" />
            </label>
            <label>
              板块主标题
              <input v-model="layout.activities.title" maxlength="40" />
            </label>
            <label>
              最多展示数量
              <input
                v-model.number="layout.activities.maxCount"
                type="number"
                min="1"
                max="12"
              />
            </label>
          </div>
          <div class="inline-controls">
            <label class="field checkbox-field">
              <input v-model="layout.activities.autoFill" type="checkbox" />
              手动精选活动不足
              {{ layout.activities.maxCount }}
              个时，自动按出发时间补齐其他已发布活动
            </label>
            <label class="field checkbox-field">
              <input v-model="layout.activities.showAllLink" type="checkbox" />
              显示右上角「全部」入口
            </label>
          </div>

          <div class="sub-box">
            <h3>已排定活动（{{ layout.activities.featuredActivityIds.length }} 场）</h3>
            <p v-if="!layout.activities.featuredActivityIds.length" class="muted">
              可从下方列表将活动加入首页排位。
            </p>
            <template v-else>
              <p v-if="layout.activities.featuredActivityIds.length > 1" class="field-hint">
                将一张卡片拖到另一张上即可交换排位。
              </p>
              <FeaturedRankList
                v-model="layout.activities.featuredActivityIds"
                class="featured-activities"
                item-label="活动"
                :options="activityOptions"
                :disabled="saving"
              />
            </template>
          </div>

          <div class="sub-box">
            <div class="panel-head">
              <h3>可选已发布活动</h3>
              <input
                v-model="activityFilter"
                type="search"
                class="compact-search"
                placeholder="搜索活动名称或地点…"
                maxlength="100"
              />
            </div>
            <p v-if="activityLoading" role="status" class="muted">
              正在加载活动…
            </p>
            <p v-else-if="activityError" role="alert" class="error-box">
              {{ activityError }}
              <button
                type="button"
                class="text-button"
                @click="loadActivityPage()"
              >
                重试
              </button>
            </p>
            <ul v-else-if="candidateActivities.length" class="candidate-list">
              <li v-for="act in candidateActivities" :key="act.id">
                <div>
                  <strong>{{ act.title }}</strong>
                  <small class="muted"> · {{ act.location }}</small>
                </div>
                <button
                  type="button"
                  class="secondary"
                  :disabled="saving || layout.activities.featuredActivityIds.length >= 12"
                  @click="addFeaturedActivity(act.id)"
                >
                  加入首页排位
                </button>
              </li>
            </ul>
            <p v-else class="muted">本页没有可添加的已发布活动。</p>
            <PaginationBar
              v-if="activityPage && !activityError"
              :page="activityPage.page"
              :page-size="activityPage.size"
              :total="activityPage.total"
              :has-more="activityPage.hasMore"
              :busy="activityLoading"
              label="可选活动分页"
              @change="loadActivityPage"
            />
          </div>
        </div>

        <!-- 4. SHOP -->
        <div v-else-if="activeModule === 'SHOP'" class="editor-panel">
          <h2>装备横幅与精选商品</h2>
          <label class="field checkbox-field">
            <input v-model="layout.shop.showBanner" type="checkbox" />
            显示通栏装备横幅
          </label>
          <div v-if="layout.shop.showBanner" class="sub-box">
            <div class="image-setting-row">
              <img
                :src="layout.shop.bannerImageUrl"
                alt=""
                class="banner-thumb"
              />
              <div class="image-setting-controls">
                <ImageUpload
                  label="上传替换装备横幅图"
                  @uploaded="layout.shop.bannerImageUrl = $event"
                />
                <button
                  v-if="
                    layout.shop.bannerImageUrl !==
                    '/assets/equipment-banner.jpg'
                  "
                  type="button"
                  class="text-button"
                  @click="
                    layout.shop.bannerImageUrl = '/assets/equipment-banner.jpg'
                  "
                >
                  恢复默认横幅图
                </button>
              </div>
            </div>
            <div class="field-row">
              <label>
                横幅小标签
                <input v-model="layout.shop.bannerTag" maxlength="60" />
              </label>
              <label>
                横幅主标题
                <input v-model="layout.shop.bannerTitle" maxlength="60" />
              </label>
              <label>
                按钮文字
                <input v-model="layout.shop.bannerCta" maxlength="24" />
              </label>
            </div>
          </div>

          <div class="inline-controls">
            <label class="field checkbox-field">
              <input v-model="layout.shop.showProducts" type="checkbox" />
              显示首页商品卡片网格
            </label>
            <label class="compact-select">
              展示件数
              <input
                v-model.number="layout.shop.maxCount"
                type="number"
                min="1"
                max="8"
              />
            </label>
            <label class="field checkbox-field">
              <input v-model="layout.shop.autoFill" type="checkbox" />
              自动补齐在售商品
            </label>
          </div>

          <div v-if="layout.shop.showProducts && layout.shop.featuredProductIds.length" class="sub-box">
            <h3>已排定商品（{{ layout.shop.featuredProductIds.length }} 件）</h3>
            <p v-if="layout.shop.featuredProductIds.length > 1" class="field-hint">
              将一张卡片拖到另一张上即可交换排位。
            </p>
            <FeaturedRankList
              v-model="layout.shop.featuredProductIds"
              class="featured-products"
              item-label="商品"
              :options="productOptions"
              :disabled="saving"
            />
          </div>

          <div
            v-if="layout.shop.showProducts && allProducts.length"
            class="sub-box"
          >
            <h3>选择优先展示的商品</h3>
            <div class="product-pick-grid">
              <button
                v-for="prod in allProducts"
                :key="prod.id"
                type="button"
                class="product-pick-btn"
                :disabled="saving || (layout.shop.featuredProductIds.length >= 8 && !layout.shop.featuredProductIds.includes(prod.id))"
                :aria-pressed="layout.shop.featuredProductIds.includes(prod.id)"
                :class="{
                  'is-picked': layout.shop.featuredProductIds.includes(prod.id),
                }"
                @click="toggleFeaturedProduct(prod.id)"
              >
                <img :src="prod.imageUrl" alt="" />
                <span>{{ prod.name }}</span>
                <small v-if="layout.shop.featuredProductIds.includes(prod.id)">
                  第
                  {{ layout.shop.featuredProductIds.indexOf(prod.id) + 1 }} 位
                </small>
              </button>
            </div>
          </div>
        </div>

        <!-- 5. GALLERY -->
        <div v-else-if="activeModule === 'GALLERY'" class="editor-panel">
          <h2>山野之间轮播区</h2>
          <div class="field-row">
            <label>
              英文眉题
              <input v-model="layout.gallery.eyebrow" maxlength="80" />
            </label>
            <label>
              板块标题
              <input v-model="layout.gallery.title" maxlength="40" />
            </label>
            <label>
              数据来源
              <select v-model="layout.gallery.mode">
                <option value="AUTO_ARTICLES">
                  自动展示已发布文章（默认）
                </option>
                <option value="CUSTOM">自定义上传轮播图与跳转</option>
              </select>
            </label>
          </div>

          <div v-if="layout.gallery.mode === 'CUSTOM'" class="sub-box">
            <div class="panel-head">
              <h3>自定义轮播图（{{ layout.gallery.slides.length }} / 10）</h3>
              <ImageUpload
                v-if="layout.gallery.slides.length < 10"
                :key="`slide-up-${layout.gallery.slides.length}`"
                label="上传新增轮播图"
                @uploaded="addGallerySlide"
              />
            </div>
            <div
              v-for="(slide, sIdx) in layout.gallery.slides"
              :key="slide.id"
              class="slide-row"
            >
              <img :src="slide.imageUrl" alt="" class="small-thumb" />
              <div class="slide-fields">
                <div class="field-row">
                  <input
                    v-model="slide.title"
                    maxlength="80"
                    placeholder="轮播主标题"
                  />
                  <input
                    v-model="slide.subtitle"
                    maxlength="160"
                    placeholder="副标题"
                  />
                </div>
                <div class="field-row">
                  <select v-model="slide.action.type">
                    <option value="NONE">点击不跳转</option>
                    <option value="WECHAT_ARTICLE">跳微信公众号文章</option>
                    <option value="ACTIVITY">跳指定活动</option>
                    <option value="ARTICLE">跳小程序文章</option>
                  </select>
                  <input
                    v-if="slide.action.type === 'WECHAT_ARTICLE'"
                    v-model="slide.action.wechatArticleUrl"
                    placeholder="https://mp.weixin.qq.com/s/..."
                  />
                  <select
                    v-else-if="slide.action.type === 'ACTIVITY'"
                    v-model="slide.action.activityId"
                  >
                    <option value="">选择活动</option>
                    <option
                      v-for="a in allActivities"
                      :key="a.id"
                      :value="a.id"
                    >
                      {{ a.title }}
                    </option>
                  </select>
                  <select
                    v-else-if="slide.action.type === 'ARTICLE'"
                    v-model="slide.action.articleId"
                  >
                    <option value="OFFICIAL">官方介绍</option>
                    <option
                      v-for="art in allArticles"
                      :key="art.id"
                      :value="art.id"
                    >
                      {{ art.title }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="slide-actions">
                <button
                  type="button"
                  class="text-button"
                  :disabled="sIdx === 0"
                  @click="moveArrayItem(layout.gallery.slides, sIdx, sIdx - 1)"
                >
                  上移
                </button>
                <button
                  type="button"
                  class="text-button danger-text"
                  @click="layout.gallery.slides.splice(sIdx, 1)"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 6. FOOTER (Puzzle board with 2/3/4 presets + draggable splitters + focused slot inspector) -->
        <div v-else-if="activeModule === 'FOOTER'" class="editor-panel">
          <div class="panel-head">
            <div>
              <h2>首页底部配置</h2>
              <p class="field-hint footer-panel-desc">
                选择 2/3/4 区域拼图组合，拖动拼图块换位，推动中间分割条调整左右/上下比例，点击任意区域编辑内容。
              </p>
            </div>
            <div class="footer-head-toggles">
              <label class="footer-toggle-pill">
                <input
                  v-model="layout.footer.brandEnabled"
                  type="checkbox"
                  data-footer-toggle="brand"
                />
                <span>显示品牌底图</span>
              </label>
              <label class="footer-toggle-pill">
                <input
                  v-model="layout.footer.followEnabled"
                  type="checkbox"
                  data-footer-toggle="follow"
                />
                <span>显示关注二维码</span>
              </label>
              <button
                v-if="!isDefaultFooterLayout"
                type="button"
                class="text-button"
                @click="resetFooterOrder"
              >
                恢复默认排布
              </button>
            </div>
          </div>

          <!-- Puzzle Preset Selector (2 / 3 / 4 areas) -->
          <div class="footer-preset-bar" role="group" aria-label="拼图区域排列组合">
            <div
              v-for="group in footerPresetGroups"
              :key="group.count"
              class="footer-preset-group"
            >
              <span class="footer-preset-group-label">{{ group.title }}</span>
              <div class="footer-preset-items">
                <button
                  v-for="preset in group.items"
                  :key="preset.id"
                  type="button"
                  class="footer-preset-card"
                  :class="{ 'is-active': footerPresetDef.id === preset.id }"
                  :data-footer-preset="preset.id"
                  :aria-pressed="footerPresetDef.id === preset.id"
                  @click="setFooterPreset(preset.id)"
                >
                  <span
                    class="footer-preset-thumb"
                    :class="`is-${preset.id.toLowerCase()}`"
                    aria-hidden="true"
                  >
                    <i
                      v-for="(slot, idx) in preset.slots"
                      :key="idx"
                      :style="{ gridColumn: slot.col, gridRow: slot.row }"
                    />
                  </span>
                  <span>{{ preset.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Interactive Puzzle Stage with Draggable Splitters -->
          <div
            ref="puzzleStageEl"
            class="footer-puzzle-stage"
            :class="{ 'is-resizing': !!draggingSplit }"
          >
            <div
              class="footer-puzzle-grid"
              role="list"
              aria-label="首页底部拼图排布"
              :style="footerPuzzleGridStyle"
            >
              <div
                v-for="slot in footerActiveSlots"
                :key="slot.cellId"
                class="footer-slot-card"
                :class="{
                  'is-selected': activeFooterCell === slot.cellId,
                  'is-muted': !footerCellMeta(slot.cellId).active,
                  'is-dragging': dragFooterPos === slot.posIdx,
                  'is-drag-over': dragOverFooterPos === slot.posIdx && dragFooterPos !== slot.posIdx,
                }"
                :style="{ gridColumn: slot.col, gridRow: slot.row }"
                role="listitem"
                tabindex="0"
                draggable="true"
                :data-footer-pos="slot.posIdx"
                :data-footer-cell="slot.cellId"
                :aria-pressed="activeFooterCell === slot.cellId"
                @click="activeFooterCell = slot.cellId"
                @keydown.enter.prevent="activeFooterCell = slot.cellId"
                @keydown.space.prevent="activeFooterCell = slot.cellId"
                @dragstart="startFooterCellDrag(slot.posIdx)"
                @dragenter.prevent="dragOverFooterPos = slot.posIdx"
                @dragover.prevent="dragOverFooterPos = slot.posIdx"
                @drop.prevent="dropFooterCell(slot.posIdx)"
                @dragend="endFooterCellDrag"
              >
                <div class="footer-slot-head">
                  <div class="footer-slot-title">
                    <span class="footer-pos-tag">{{ slot.label }}</span>
                    <strong>{{ footerCellLabels[slot.cellId] }}</strong>
                  </div>
                  <div class="footer-slot-right">
                    <span
                      class="footer-status-pill"
                      :class="`is-${footerCellMeta(slot.cellId).tone}`"
                    >
                      {{ footerCellMeta(slot.cellId).badge }}
                    </span>
                    <span class="footer-drag-grip" title="拖动换位" aria-hidden="true">
                      <AppIcon name="grip" :size="14" />
                    </span>
                  </div>
                </div>

                <div class="footer-slot-body">
                  <template v-if="slot.cellId === 'BRAND'">
                    <img
                      class="footer-slot-brand-img"
                      :src="brandPreviewUrl(layout.footer.brandImageUrl)"
                      alt=""
                    />
                    <span class="footer-slot-meta">宽 {{ layout.footer.brandWidthPx }} px</span>
                  </template>

                  <template v-else-if="slot.cellId === 'TEXT'">
                    <strong class="footer-slot-text-title">
                      {{ layout.footer.followTitle.trim() || "未填写关注标题" }}
                    </strong>
                    <span class="footer-slot-text-sub">
                      {{ layout.footer.followSubtitle.trim() || "点击编辑引导副文案" }}
                    </span>
                  </template>

                  <template v-else>
                    <template v-if="layout.footer.followQrcodes[footerSlotQrIndex(slot.cellId)!]">
                      <img
                        class="footer-slot-qr-img"
                        :src="layout.footer.followQrcodes[footerSlotQrIndex(slot.cellId)!]!.url"
                        alt=""
                      />
                      <span class="footer-slot-meta">
                        {{ layout.footer.followQrcodes[footerSlotQrIndex(slot.cellId)!]!.label || "未命名二维码" }}
                      </span>
                    </template>
                    <div v-else class="footer-slot-empty">
                      <AppIcon name="upload" :size="18" />
                      <span>点击上传二维码</span>
                    </div>
                  </template>
                </div>
              </div>
            </div>

            <!-- Left/Right Push Splitter -->
            <button
              v-if="footerPresetDef.hasColSplit"
              type="button"
              class="footer-splitter footer-splitter-v"
              :class="{ 'is-active': draggingSplit === 'col' }"
              :style="footerColSplitterStyle"
              data-footer-splitter="col"
              aria-label="左右推动调整列宽比例"
              title="左右拖动调整宽度比例"
              @pointerdown="startSplitDrag('col', $event)"
              @keydown.left.prevent="nudgeFooterRatio('col', -5)"
              @keydown.right.prevent="nudgeFooterRatio('col', 5)"
            >
              <span class="footer-splitter-handle" />
              <span v-if="draggingSplit === 'col'" class="footer-splitter-tip">
                {{ footerColRatio }}% : {{ 100 - footerColRatio }}%
              </span>
            </button>

            <!-- Top/Bottom Push Splitter -->
            <button
              v-if="footerPresetDef.hasRowSplit"
              type="button"
              class="footer-splitter footer-splitter-h"
              :class="{ 'is-active': draggingSplit === 'row' }"
              :style="footerRowSplitterStyle"
              data-footer-splitter="row"
              aria-label="上下推动调整行高比例"
              title="上下拖动调整高度比例"
              @pointerdown="startSplitDrag('row', $event)"
              @keydown.up.prevent="nudgeFooterRatio('row', -5)"
              @keydown.down.prevent="nudgeFooterRatio('row', 5)"
            >
              <span class="footer-splitter-handle" />
              <span v-if="draggingSplit === 'row'" class="footer-splitter-tip">
                {{ footerRowRatio }}% : {{ 100 - footerRowRatio }}%
              </span>
            </button>
          </div>

          <!-- Ratio Status & Quick Reset Bar -->
          <div class="footer-ratio-bar">
            <div class="footer-ratio-stats">
              <span v-if="footerPresetDef.hasColSplit" class="footer-ratio-chip">
                左右比例 <strong>{{ footerColRatio }}% : {{ 100 - footerColRatio }}%</strong>
              </span>
              <span v-if="footerPresetDef.hasRowSplit" class="footer-ratio-chip">
                上下比例 <strong>{{ footerRowRatio }}% : {{ 100 - footerRowRatio }}%</strong>
              </span>
              <span class="field-hint">可拖动中间绿条推动左右/上下比例</span>
            </div>
            <button
              v-if="footerColRatio !== 50 || footerRowRatio !== 50"
              type="button"
              class="text-button"
              @click="resetFooterRatios"
            >
              均分 50/50
            </button>
          </div>

          <!-- Spare Modules Dock (for 2-area / 3-area puzzles) -->
          <div v-if="footerSpareSlots.length" class="footer-spare-dock">
            <span class="footer-spare-label">未放入拼图的模块（拖入上方格子或点击换入）：</span>
            <div class="footer-spare-list">
              <div
                v-for="spare in footerSpareSlots"
                :key="spare.cellId"
                class="footer-spare-chip"
                draggable="true"
                :data-footer-spare="spare.cellId"
                @dragstart="startFooterCellDrag(spare.posIdx)"
                @dragend="endFooterCellDrag"
              >
                <AppIcon name="grip" :size="13" />
                <strong>{{ footerCellLabels[spare.cellId] }}</strong>
                <button
                  type="button"
                  class="text-button"
                  @click="swapSpareIntoActive(spare.posIdx)"
                >
                  换入当前格
                </button>
              </div>
            </div>
          </div>

          <!-- Focused Slot Inspector -->
          <div class="sub-box footer-inspector">
            <div class="footer-inspector-head">
              <div class="footer-inspector-title">
                <h3>{{ footerCellLabels[activeFooterCell] }}设置</h3>
                <span
                  class="footer-status-pill"
                  :class="`is-${footerCellMeta(activeFooterCell).tone}`"
                >
                  {{ footerCellMeta(activeFooterCell).badge }}
                </span>
              </div>
              <div class="footer-pos-switcher" role="group" aria-label="调整当前格子位置">
                <span class="footer-pos-switcher-label">位置</span>
                <button
                  v-for="slot in footerActiveSlots"
                  :key="slot.posIdx"
                  type="button"
                  class="footer-pos-btn"
                  :class="{ 'is-current': slot.cellId === activeFooterCell }"
                  :aria-pressed="slot.cellId === activeFooterCell"
                  @click="moveFooterCellTo(activeFooterCell, slot.posIdx)"
                >
                  {{ slot.label }}
                </button>
              </div>
            </div>

            <!-- Inspector: BRAND -->
            <template v-if="activeFooterCell === 'BRAND'">
              <div v-if="!layout.footer.brandEnabled" class="footer-off-banner">
                <span>品牌底图当前已关闭，不会在小程序首页底部显示。</span>
                <button
                  type="button"
                  class="secondary"
                  @click="layout.footer.brandEnabled = true"
                >
                  开启品牌底图
                </button>
              </div>
              <template v-else>
                <div class="image-setting-row">
                  <div class="brand-preview-box">
                    <img
                      :src="brandPreviewUrl(layout.footer.brandImageUrl)"
                      alt="野小子底图预览"
                      :style="{
                        width: `${Math.round(layout.footer.brandWidthPx * 0.65)}px`,
                      }"
                    />
                  </div>
                  <div class="image-setting-controls">
                    <ImageUpload
                      compact
                      label="替换品牌底图"
                      @uploaded="layout.footer.brandImageUrl = $event"
                    />
                    <button
                      v-if="layout.footer.brandImageUrl !== DEFAULT_BRAND"
                      type="button"
                      class="text-button"
                      @click="layout.footer.brandImageUrl = DEFAULT_BRAND"
                    >
                      恢复默认透明野小子底图
                    </button>
                  </div>
                </div>

                <div class="size-slider-row">
                  <div class="footer-size-head">
                    <label for="footer-brand-width">
                      底图显示宽度：<strong>{{ layout.footer.brandWidthPx }} px</strong>
                      <span class="field-hint">（小程序内宽度 80–360px）</span>
                    </label>
                    <div class="footer-preset-chips">
                      <button
                        v-for="preset in brandWidthPresets"
                        :key="preset.value"
                        type="button"
                        class="footer-preset-btn"
                        :class="{ 'is-active': layout.footer.brandWidthPx === preset.value }"
                        @click="layout.footer.brandWidthPx = preset.value"
                      >
                        {{ preset.label }} {{ preset.value }}px
                      </button>
                    </div>
                  </div>
                  <div class="slider-inputs">
                    <input
                      id="footer-brand-width"
                      v-model.number="layout.footer.brandWidthPx"
                      type="range"
                      min="80"
                      max="360"
                      step="4"
                    />
                    <input
                      v-model.number="layout.footer.brandWidthPx"
                      type="number"
                      min="80"
                      max="360"
                      class="px-number"
                      aria-label="底图显示宽度像素值"
                    />
                  </div>
                </div>
              </template>
            </template>

            <!-- Inspector: TEXT -->
            <template v-else-if="activeFooterCell === 'TEXT'">
              <div v-if="!layout.footer.followEnabled" class="footer-off-banner">
                <span>关注二维码区当前已关闭，关注说明不会显示。</span>
                <button
                  type="button"
                  class="secondary"
                  @click="layout.footer.followEnabled = true"
                >
                  开启关注二维码区
                </button>
              </div>
              <template v-else>
                <p v-if="!layout.footer.followQrcodes.length" class="footer-inline-tip">
                  提示：需至少上传 1 张关注二维码后，关注说明才会在小程序首页底部展示。
                </p>
                <div class="field-row">
                  <label>
                    关注区标题
                    <input
                      v-model="layout.footer.followTitle"
                      maxlength="60"
                      placeholder="关注野小子公众号"
                    />
                  </label>
                  <label>
                    引导副文案
                    <input
                      v-model="layout.footer.followSubtitle"
                      maxlength="120"
                      placeholder="长按识别二维码 · 获取最新山野路线与活动动态"
                    />
                  </label>
                </div>
              </template>
            </template>

            <!-- Inspector: QR1 / QR2 -->
            <template v-else>
              <div v-if="!layout.footer.followEnabled" class="footer-off-banner">
                <span>关注二维码区当前已关闭，二维码不会在小程序首页底部显示。</span>
                <button
                  type="button"
                  class="secondary"
                  @click="layout.footer.followEnabled = true"
                >
                  开启关注二维码区
                </button>
              </div>
              <template v-else>
                <div
                  v-if="layout.footer.followQrcodes[footerSlotQrIndex(activeFooterCell)!]"
                  class="footer-qr-editor"
                >
                  <img
                    class="footer-qr-editor-img"
                    :src="layout.footer.followQrcodes[footerSlotQrIndex(activeFooterCell)!]!.url"
                    alt="底部关注二维码"
                  />
                  <div class="footer-qr-editor-fields">
                    <label>
                      二维码说明标签
                      <input
                        v-model="layout.footer.followQrcodes[footerSlotQrIndex(activeFooterCell)!]!.label"
                        maxlength="40"
                        placeholder="如：微信公众号 / 客服微信 / 视频号"
                      />
                    </label>
                    <div class="footer-qr-editor-actions">
                      <ImageUpload
                        compact
                        :key="`replace-${activeFooterCell}-${layout.footer.followQrcodes[footerSlotQrIndex(activeFooterCell)!]!.url}`"
                        label="替换图片"
                        @uploaded="uploadFooterSlotQr(activeFooterCell as 'QR1' | 'QR2', $event)"
                      />
                      <button
                        v-if="layout.footer.followQrcodes.length >= 2"
                        type="button"
                        class="text-button"
                        @click="moveArrayItem(layout.footer.followQrcodes, 0, 1)"
                      >
                        与{{ activeFooterCell === 'QR1' ? '二维码 2' : '二维码 1' }}互换图片
                      </button>
                      <button
                        type="button"
                        class="text-button danger-text"
                        @click="removeFooterQr(footerSlotQrIndex(activeFooterCell)!)"
                      >
                        删除此二维码
                      </button>
                    </div>
                  </div>
                </div>
                <div v-else class="footer-qr-empty-editor">
                  <p class="field-hint">
                    {{
                      activeFooterCell === "QR2" && !layout.footer.followQrcodes.length
                        ? "当前还没有上传二维码，上传后将先填入「二维码 1」。"
                        : `当前「${footerCellLabels[activeFooterCell]}」未上传图片，小程序中会自动跳过不占位。`
                    }}
                  </p>
                  <ImageUpload
                    :key="`upload-${activeFooterCell}-${layout.footer.followQrcodes.length}`"
                    :label="`上传${footerCellLabels[activeFooterCell]}`"
                    @uploaded="uploadFooterSlotQr(activeFooterCell as 'QR1' | 'QR2', $event)"
                  />
                </div>
              </template>
            </template>
          </div>

          <!-- Extra QRs (#3 - #6) shown once QR1 & QR2 are populated -->
          <div
            v-if="layout.footer.followEnabled && layout.footer.followQrcodes.length >= 2"
            class="sub-box footer-extra-qrs"
          >
            <div class="qr-section-head">
              <div>
                <strong>更多二维码（{{ Math.max(0, layout.footer.followQrcodes.length - 2) }} / 4）</strong>
                <p class="field-hint">第 3 张起的二维码将按顺序排在四格下方，可拖动调整顺序。</p>
              </div>
              <ImageUpload
                v-if="layout.footer.followQrcodes.length < 6"
                compact
                :key="`footer-extra-qr-${layout.footer.followQrcodes.length}`"
                label="添加更多二维码"
                @uploaded="addFollowQr"
              />
            </div>

            <div
              v-if="layout.footer.followQrcodes.length > 2"
              class="qr-cards-grid"
            >
              <div
                v-for="(qr, extraIdx) in layout.footer.followQrcodes.slice(2)"
                :key="extraIdx + 2"
                class="qr-card"
                draggable="true"
                @dragstart="dragFollowQrIdx = extraIdx + 2"
                @dragover.prevent
                @drop="dropFollowQr(extraIdx + 2)"
              >
                <img :src="qr.url" alt="底部关注二维码" />
                <input
                  v-model="qr.label"
                  maxlength="40"
                  placeholder="如：客服微信 / 活动交流群"
                />
                <div class="qr-card-actions">
                  <button
                    type="button"
                    class="text-button"
                    @click="
                      moveArrayItem(
                        layout.footer.followQrcodes,
                        extraIdx + 2,
                        extraIdx + 1,
                      )
                    "
                  >
                    前移
                  </button>
                  <button
                    type="button"
                    class="text-button danger-text"
                    @click="removeFooterQr(extraIdx + 2)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Right: Compact Live Miniprogram Wireframe Preview -->
      <aside class="phone-preview" aria-label="小程序首页结构预览">
        <div class="phone-frame">
          <div class="phone-notch">小程序探索页实时预览</div>
          <div class="phone-body">
            <template v-for="mod in layout.modules" :key="mod.id">
              <div
                v-if="mod.enabled && mod.id === 'HERO'"
                class="pv-hero pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'HERO'"
                aria-label="编辑首屏模块"
                @click="activeModule = 'HERO'"
                @keydown.enter.prevent="activeModule = 'HERO'"
                @keydown.space.prevent="activeModule = 'HERO'"
              >
                <img :src="layout.hero.imageUrl" alt="" />
                <div class="pv-hero-shade">
                  <small>{{ layout.hero.brandName }}</small>
                  <strong>{{ layout.hero.title }}</strong>
                  <span>{{ layout.hero.subtitle }}</span>
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'SHORTCUTS'"
                class="pv-shortcuts pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'SHORTCUTS'"
                aria-label="编辑快捷入口模块"
                :style="{
                  gridTemplateColumns: `repeat(${layout.shortcuts.columns}, minmax(0, 1fr))`,
                }"
                @click="activeModule = 'SHORTCUTS'"
                @keydown.enter.prevent="activeModule = 'SHORTCUTS'"
                @keydown.space.prevent="activeModule = 'SHORTCUTS'"
              >
                <div
                  v-for="sc in layout.shortcuts.items"
                  :key="sc.id"
                  class="pv-shortcut-cell"
                >
                  <img
                    :src="
                      sc.imageUrl ||
                      presetIconImages[sc.icon] ||
                      presetIconImages.WEEKLY
                    "
                    alt=""
                  />
                  <span>{{ sc.name }}</span>
                </div>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'ACTIVITIES'"
                class="pv-block pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'ACTIVITIES'"
                aria-label="编辑活动模块"
                @click="activeModule = 'ACTIVITIES'"
                @keydown.enter.prevent="activeModule = 'ACTIVITIES'"
                @keydown.space.prevent="activeModule = 'ACTIVITIES'"
              >
                <div class="pv-activities-head">
                  <div>
                    <small v-if="layout.activities.eyebrow">{{ layout.activities.eyebrow }}</small>
                    <div class="pv-block-title">{{ layout.activities.title }}</div>
                  </div>
                  <span v-if="layout.activities.showAllLink">全部</span>
                </div>
                <div v-if="previewActivities.length" class="pv-activity-grid">
                  <article v-for="act in previewActivities" :key="act.id" class="pv-activity-card">
                    <img v-if="act.coverUrl" :src="act.coverUrl" alt="" />
                    <small>{{ [categories[act.category], act.startAt && displayDate(act.startAt)].filter(Boolean).join(" · ") }}</small>
                    <strong>{{ act.title }}</strong>
                    <span v-if="act.location">{{ act.location }}</span>
                    <b v-if="Number.isInteger(act.priceCents)">
                      {{ act.priceCents === 0 ? "免费参与" : `¥${(act.priceCents / 100).toFixed(2)} / 人` }}
                    </b>
                  </article>
                </div>
                <p v-if="activityPreviewIncomplete" class="pv-mini-placeholder" role="status">部分活动预览加载失败</p>
                <p v-else-if="!previewActivities.length" class="pv-mini-placeholder">
                  {{ activityPreviewLoading ? "正在加载活动…" : "暂无活动" }}
                </p>
              </div>

              <div
                v-else-if="mod.enabled && mod.id === 'SHOP' && (layout.shop.showBanner || layout.shop.showProducts)"
                class="pv-block pv-interactive"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'SHOP'"
                aria-label="编辑装备商城模块"
                @click="activeModule = 'SHOP'"
                @keydown.enter.prevent="activeModule = 'SHOP'"
                @keydown.space.prevent="activeModule = 'SHOP'"
              >
                <div v-if="layout.shop.showBanner" class="pv-shop-banner">
                  <img :src="layout.shop.bannerImageUrl || '/assets/equipment-banner.jpg'" alt="" />
                  <div class="pv-shop-copy">
                    <small v-if="layout.shop.bannerTag">{{ layout.shop.bannerTag }}</small>
                    <strong v-if="layout.shop.bannerTitle">{{ layout.shop.bannerTitle }}</strong>
                    <span v-if="layout.shop.bannerCta">{{ layout.shop.bannerCta }} ›</span>
                  </div>
                </div>
                <div v-if="previewProducts.length" class="pv-products">
                  <div v-for="product in previewProducts" :key="product.id" class="pv-product-card">
                    <img v-if="product.imageUrl" :src="product.imageUrl" alt="" />
                    <strong>{{ product.name }}</strong>
                    <del v-if="product.priceCents > 0 && product.originalPriceCents > product.priceCents">
                      原价 ¥{{ (product.originalPriceCents / 100).toFixed(2) }}
                    </del>
                    <span v-if="Number.isFinite(product.priceCents)">¥{{ (product.priceCents / 100).toFixed(2) }}</span>
                  </div>
                </div>
                <small v-else-if="layout.shop.showProducts" class="muted">{{
                  productCatalogState === "loading" ? "正在加载装备…" :
                    productCatalogState === "error" ? "商品列表加载失败" : "装备正在准备中"
                }}</small>
              </div>

              <HomeGalleryPreview
                v-else-if="mod.enabled && mod.id === 'GALLERY'"
                class="pv-block"
                :config="layout.gallery"
                :active="activeModule === 'GALLERY'"
                @edit="activeModule = 'GALLERY'"
              />

              <div
                v-else-if="
                  mod.enabled && mod.id === 'FOOTER' && footerPreviewCells.length
                "
                class="pv-footer pv-interactive"
                :class="{ 'pv-footer-single': footerPreviewCells.length === 1 }"
                :style="footerPreviewGridStyle"
                role="button"
                tabindex="0"
                :aria-pressed="activeModule === 'FOOTER'"
                aria-label="编辑页脚模块"
                @click="activeModule = 'FOOTER'"
                @keydown.enter.prevent="activeModule = 'FOOTER'"
                @keydown.space.prevent="activeModule = 'FOOTER'"
              >
                <div
                  v-for="cell in footerPreviewCells"
                  :key="cell.id"
                  class="pv-footer-cell"
                  :data-cell="cell.id"
                  :style="cell.style"
                >
                  <div v-if="cell.kind === 'BRAND'" class="pv-brand-wrap">
                    <img
                      :src="brandPreviewUrl(layout.footer.brandImageUrl)"
                      alt=""
                      :style="{ width: `${Math.round((layout.footer.brandWidthPx / 375) * 240)}px` }"
                    />
                  </div>
                  <div v-else-if="cell.kind === 'TEXT'" class="pv-follow-box">
                    <strong v-if="layout.footer.followTitle.trim()">{{ layout.footer.followTitle }}</strong>
                    <small v-if="layout.footer.followSubtitle.trim()">{{ layout.footer.followSubtitle }}</small>
                  </div>
                  <div v-else-if="cell.qr" class="pv-qr-item">
                    <img :src="cell.qr.url" alt="" />
                    <span v-if="cell.qr.label?.trim()">{{ cell.qr.label }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </aside>
    </div>

    <div
      v-if="layout && !loading"
      class="layout-save-bar"
      role="region"
      aria-label="首页配置保存操作"
    >
      <span class="layout-save-status">
        {{
          conflict
            ? "首页配置已在别处更新，请先加载最新版本"
            : dirty
              ? "有未保存的首页配置改动"
              : "当前配置已保存"
        }}
      </span>
      <div class="heading-actions">
        <button
          v-if="conflict"
          type="button"
          class="secondary"
          @click="reloadAfterConflict"
        >
          加载最新版本
        </button>
        <button
          type="button"
          class="primary"
          :disabled="saving || loading || conflict || !layout"
          @click="save"
        >
          {{ saving ? "正在保存…" : "保存首页配置" }}
        </button>
      </div>
    </div>
  </main>
</template>

<style scoped>
.heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dirty-badge {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--rf-warning-bg);
  color: var(--rf-warning);
  font-size: 12px;
  font-weight: 600;
}
.layout-save-bar {
  position: sticky;
  bottom: 12px;
  z-index: var(--z-sticky-bar);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
  padding: 12px 16px;
  border: 1px solid var(--rf-line);
  border-radius: 12px;
  background: var(--rf-surface-glass);
  box-shadow: var(--rf-shadow-floating);
  backdrop-filter: blur(14px);
}
.layout-save-status {
  color: var(--rf-muted);
  font-size: 13px;
}
.builder-grid {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 272px;
  gap: 16px;
  align-items: start;
}
.builder-grid > * {
  min-width: 0;
}
@media (min-width: 1200px) and (min-height: 480px) {
  .layout-workspace {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    padding-bottom: 12px;
  }
  .builder-grid {
    flex: 1;
    min-height: 0;
    grid-template-rows: minmax(0, 1fr);
  }
  .module-rail,
  .module-editor,
  .phone-preview {
    max-height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }
  .module-editor {
    align-self: stretch;
  }
  .layout-save-bar {
    position: static;
    flex-shrink: 0;
    margin-top: 12px;
  }
}
@media (max-width: 1199px) {
  .builder-grid {
    grid-template-columns: 220px minmax(0, 1fr);
  }
  .phone-preview {
    grid-column: 1 / -1;
  }
}
@media (max-width: 780px) {
  .builder-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
.module-rail,
.editor-panel,
.phone-frame {
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 12px;
  background: var(--rf-surface, #fff);
}
.module-rail {
  padding: 12px;
}
.rail-header h2 {
  margin: 0;
  font-size: 14px;
}
.rail-header small {
  color: var(--rf-muted);
  font-size: 12px;
}
.module-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.module-card {
  padding: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.module-card.is-active {
  border-color: var(--rf-primary, #247a52);
  background: var(--rf-soft, #eaf4e7);
}
.module-card.is-disabled {
  opacity: 0.62;
}
.module-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 13px;
}
.module-select {
  padding: 0;
  text-align: start;
  font-size: inherit;
  font-weight: 600;
}
.switch-inline {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  font-size: 12px;
  margin: 0;
  white-space: nowrap;
}
.module-move {
  display: flex;
  gap: 8px;
}
.editor-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.editor-panel h2 {
  margin: 0;
  font-size: 16px;
}
.panel-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.panel-head h2,
.panel-head h3 {
  margin: 0;
}
.inline-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.compact-select {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  white-space: nowrap;
}
.compact-select select,
.compact-select input {
  width: auto;
}
.sub-box {
  padding: 14px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: var(--rf-surface-subtle, #f9fbf9);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sub-box h3 {
  margin: 0;
  font-size: 14px;
}
.image-setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.banner-thumb {
  width: 180px;
  height: 92px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
}
.small-thumb {
  width: 96px;
  height: 68px;
  object-fit: cover;
  border-radius: 8px;
}
.image-setting-controls {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.shortcut-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.shortcut-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  cursor: grab;
  font-size: 13px;
}
.shortcut-chip.is-selected {
  border-color: var(--rf-primary, #247a52);
  background: var(--rf-soft, #eaf4e7);
  font-weight: 600;
}
.shortcut-chip img {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  object-fit: cover;
}
.qr-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.qr-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 10px;
}
.qr-card {
  padding: 10px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: grab;
}
.qr-card img {
  width: 100%;
  height: 124px;
  object-fit: contain;
  background: #f6f8f3;
  border-radius: 6px;
}
.qr-card-actions {
  display: flex;
  justify-content: space-between;
}
.compact-search {
  max-width: 220px;
}
.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.candidate-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
}
.product-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
  gap: 8px;
}
.product-pick-btn {
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.product-pick-btn.is-picked {
  border-color: var(--rf-primary, #247a52);
  background: var(--rf-soft, #eaf4e7);
}
.product-pick-btn img {
  width: 100%;
  height: 80px;
  object-fit: cover;
  border-radius: 6px;
}
.slide-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
}
.slide-fields {
  flex: 1 1 280px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.brand-preview-box {
  min-width: 160px;
  min-height: 80px;
  padding: 12px;
  border-radius: 8px;
  background: #f6f8f3;
  border: 1px dashed var(--rf-line, #dce3dd);
  display: flex;
  align-items: center;
  justify-content: center;
}
.brand-preview-box img {
  max-width: 240px;
  height: auto;
}
.size-slider-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.slider-inputs {
  display: flex;
  align-items: center;
  gap: 12px;
}
.slider-inputs input[type="range"] {
  flex: 1;
}
.slider-inputs .px-number {
  width: 84px;
}
.danger-text {
  color: var(--rf-danger);
}
/* Right Phone Wireframe */
.phone-frame {
  padding: 10px;
  background: #f6f8f3;
}
.phone-notch {
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--rf-muted);
  padding-bottom: 8px;
}
.phone-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pv-interactive:focus-visible {
  outline: 2px solid var(--rf-primary);
  outline-offset: 2px;
}
.pv-hero {
  position: relative;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
}
.pv-hero img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-hero-shade {
  position: absolute;
  inset: 0;
  padding: 8px;
  background: linear-gradient(transparent, rgba(20, 35, 28, 0.78));
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  font-size: 11px;
}
.pv-shortcuts {
  display: grid;
  gap: 6px;
  cursor: pointer;
}
.pv-shortcut-cell {
  position: relative;
  height: 46px;
  border-radius: 6px;
  overflow: hidden;
}
.pv-shortcut-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-shortcut-cell span {
  position: absolute;
  inset: auto 2px 3px;
  text-align: center;
  font-size: 10px;
  color: #fff;
  background: rgba(0, 0, 0, 0.38);
  border-radius: 4px;
}
.pv-block {
  padding: 8px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
  cursor: pointer;
}
.pv-block-title {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 6px;
}
.pv-activities-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 8px;
}
.pv-activities-head .pv-block-title { margin: 0; }
.pv-activities-head small, .pv-activities-head > span {
  color: var(--rf-primary);
  font-size: 10px;
}
.pv-activity-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px 6px;
}
.pv-activity-card {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  min-width: 0;
  gap: 3px;
  overflow-wrap: anywhere;
  font-size: 11px;
  line-height: 1.4;
}
.pv-activity-card img {
  width: 100%;
  aspect-ratio: 3 / 2;
  object-fit: cover;
  border-radius: 6px;
}
.pv-activity-card small, .pv-activity-card span {
  color: var(--rf-muted);
  font-size: 10px;
}
.pv-activity-card b { color: var(--rf-primary); }
.pv-mini-placeholder {
  font-size: 11px;
  color: var(--rf-muted);
  text-align: center;
  padding: 6px;
}
.pv-shop-banner {
  position: relative;
  overflow: hidden;
  border-radius: 6px;
  background: #314b36;
  color: #fff;
}
.pv-shop-banner img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-shop-copy {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 82px;
  gap: 3px;
  padding: 8px;
  background: linear-gradient(90deg, #102519ba, transparent);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.pv-products {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.pv-shop-banner + .pv-products {
  margin-top: 8px;
}
.pv-product-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.pv-product-card img {
  width: 100%;
  aspect-ratio: 1.2;
  object-fit: cover;
  border-radius: 6px;
}
.pv-product-card del {
  color: var(--rf-muted);
  font-size: 10px;
}
.pv-product-card span {
  color: var(--rf-primary, #247a52);
  font-weight: 650;
}
.footer-panel-desc {
  margin: 4px 0 0;
}
.footer-head-toggles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.footer-toggle-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: var(--rf-surface-subtle, #f9fbf9);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  margin: 0;
}
.footer-toggle-pill input {
  width: auto;
  margin: 0;
}
.footer-preset-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: var(--rf-surface-subtle, #f9fbf9);
}
.footer-preset-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.footer-preset-group-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--rf-muted, #687b70);
}
.footer-preset-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.footer-preset-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  color: var(--rf-ink, #18271f);
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.footer-preset-card:hover {
  border-color: var(--rf-primary, #167a52);
}
.footer-preset-card.is-active {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-primary-text, #126743);
  font-weight: 600;
}
.footer-preset-thumb {
  width: 24px;
  height: 18px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
}
.footer-preset-thumb.is-two_lr {
  grid-template-rows: 1fr;
}
.footer-preset-thumb.is-two_tb {
  grid-template-columns: 1fr;
}
.footer-preset-thumb i {
  display: block;
  border-radius: 2px;
  background: #c7d6cc;
}
.footer-preset-card.is-active .footer-preset-thumb i {
  background: var(--rf-primary, #167a52);
}
.footer-puzzle-stage {
  position: relative;
  height: 288px;
  user-select: none;
}
.footer-puzzle-stage.is-resizing {
  user-select: none;
}
.footer-puzzle-grid {
  width: 100%;
  height: 100%;
  display: grid;
  gap: 14px;
}
.footer-splitter {
  position: absolute;
  z-index: 4;
  border: 0;
  padding: 0;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.footer-splitter-v {
  width: 18px;
  cursor: col-resize;
}
.footer-splitter-h {
  height: 18px;
  cursor: row-resize;
}
.footer-splitter-handle {
  display: block;
  border-radius: 999px;
  background: #c5d4ca;
  transition: background-color 0.15s ease, transform 0.15s ease;
}
.footer-splitter-v .footer-splitter-handle {
  width: 4px;
  height: 44px;
}
.footer-splitter-h .footer-splitter-handle {
  width: 44px;
  height: 4px;
}
.footer-splitter:hover .footer-splitter-handle,
.footer-splitter:focus-visible .footer-splitter-handle,
.footer-splitter.is-active .footer-splitter-handle {
  background: var(--rf-primary, #167a52);
  transform: scale(1.15);
}
.footer-splitter-tip {
  position: absolute;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--rf-ink, #18271f);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
}
.footer-ratio-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--rf-muted, #687b70);
}
.footer-ratio-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.footer-ratio-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rf-surface-subtle, #f9fbf9);
  border: 1px solid var(--rf-line, #dce3dd);
  color: var(--rf-ink, #18271f);
}
.footer-spare-dock {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px dashed var(--rf-line, #dce3dd);
  background: var(--rf-surface-subtle, #f9fbf9);
  font-size: 12px;
}
.footer-spare-label {
  color: var(--rf-muted, #687b70);
}
.footer-spare-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.footer-spare-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  cursor: grab;
}
.footer-slot-card {
  min-width: 0;
  min-height: 0;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1.5px solid var(--rf-line, #dce3dd);
  background: var(--rf-surface, #fff);
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: grab;
  overflow: hidden;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease,
    opacity 0.16s ease;
}
.footer-slot-card:hover {
  border-color: var(--rf-primary, #167a52);
}
.footer-slot-card:focus-visible {
  outline: 2px solid var(--rf-primary, #167a52);
  outline-offset: 2px;
}
.footer-slot-card.is-selected {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--rf-primary, #167a52) 18%, transparent);
}
.footer-slot-card.is-muted {
  background: var(--rf-surface-subtle, #f9fbf9);
  opacity: 0.78;
}
.footer-slot-card.is-muted.is-selected {
  opacity: 1;
}
.footer-slot-card.is-dragging {
  opacity: 0.45;
  cursor: grabbing;
}
.footer-slot-card.is-drag-over {
  border-style: dashed;
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
}
.footer-slot-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.footer-slot-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 13px;
}
.footer-pos-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--rf-neutral-bg, #eff3f0);
  color: var(--rf-muted, #687b70);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.footer-slot-card.is-selected .footer-pos-tag {
  background: #fff;
  color: var(--rf-primary-text, #126743);
}
.footer-slot-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.footer-status-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
}
.footer-status-pill.is-ok {
  background: var(--rf-success-bg, #eaf5ed);
  color: var(--rf-success, #24724b);
}
.footer-status-pill.is-warn {
  background: var(--rf-warning-bg, #fbf3e2);
  color: var(--rf-warning, #94661f);
}
.footer-status-pill.is-muted {
  background: var(--rf-neutral-bg, #eff3f0);
  color: var(--rf-neutral, #64766b);
}
.footer-drag-grip {
  display: inline-flex;
  align-items: center;
  color: var(--rf-muted, #687b70);
}
.footer-slot-body {
  flex: 1;
  min-height: 54px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px dashed var(--rf-line, #dce3dd);
  padding: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  text-align: center;
  overflow: hidden;
}
.footer-slot-brand-img {
  max-width: 120px;
  max-height: 44px;
  object-fit: contain;
}
.footer-slot-qr-img {
  width: 48px;
  height: 48px;
  object-fit: contain;
  border-radius: 6px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
}
.footer-slot-meta {
  font-size: 12px;
  color: var(--rf-muted, #687b70);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.footer-slot-text-title {
  font-size: 13px;
  color: var(--rf-ink, #18271f);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.footer-slot-text-sub {
  font-size: 11px;
  color: var(--rf-muted, #687b70);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.footer-slot-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--rf-muted, #687b70);
}
.footer-inspector {
  gap: 12px;
}
.footer-inspector-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rf-line, #dce3dd);
}
.footer-inspector-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.footer-pos-switcher {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.footer-pos-switcher-label {
  font-size: 12px;
  color: var(--rf-muted, #687b70);
  margin-right: 2px;
}
.footer-pos-btn {
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  color: var(--rf-ink, #18271f);
  font-size: 12px;
  cursor: pointer;
}
.footer-pos-btn:hover {
  border-color: var(--rf-primary, #167a52);
}
.footer-pos-btn.is-current {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-primary, #167a52);
  color: var(--rf-on-primary, #fff);
  font-weight: 600;
}
.footer-off-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fff;
  border: 1px dashed var(--rf-line, #dce3dd);
  font-size: 13px;
  color: var(--rf-muted, #687b70);
}
.footer-inline-tip {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--rf-warning-bg, #fbf3e2);
  color: var(--rf-warning, #94661f);
  font-size: 12px;
}
.footer-size-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.footer-preset-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.footer-preset-btn {
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  font-size: 12px;
  color: var(--rf-muted, #687b70);
  cursor: pointer;
}
.footer-preset-btn.is-active {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-primary-text, #126743);
  font-weight: 600;
}
.footer-qr-editor {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}
.footer-qr-editor-img {
  width: 96px;
  height: 96px;
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
  flex-shrink: 0;
}
.footer-qr-editor-fields {
  flex: 1 1 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-qr-editor-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.footer-qr-empty-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.footer-extra-qrs p {
  margin: 2px 0 0;
}
.pv-footer {
  padding: 8px 4px 10px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  gap: 8px 5px;
  cursor: pointer;
}
.pv-footer-single {
  grid-template-columns: minmax(0, 1fr);
}
.pv-footer-cell {
  min-width: 0;
  text-align: center;
  overflow-wrap: anywhere;
}
.pv-follow-box {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10px;
}
.pv-qr-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  font-size: 10px;
}
.pv-qr-item img {
  width: 52px;
  max-width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #fff;
}
.pv-brand-wrap {
  display: flex;
  justify-content: center;
  flex: 1;
  min-width: 0;
}
.pv-brand-wrap img {
  max-width: 100%;
  height: auto;
}
</style>
