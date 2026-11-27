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
import { uploadAdminImage } from "../image-upload";
import HomeGalleryPreview from "../components/HomeGalleryPreview.vue";
import PaginationBar from "../components/PaginationBar.vue";
import UiState from "../components/UiState.vue";
import {
  categories,
  type Activity,
  type HomeActionLink,
  type HomeGallerySlide,
  type HomeFooterBlock,
  type HomeFooterCell,
  type HomeFooterSlotType,
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
const defaultFooterCells: HomeFooterCell[] = ["BRAND", "QR1", "TEXT", "QR2"];
const footerSlotTypeOptions: Array<{ value: HomeFooterSlotType; label: string }> = [
  { value: "NONE", label: "无" },
  { value: "TEXT", label: "文字" },
  { value: "IMAGE", label: "图片" },
];
type FooterQuickTemplateGroup = "1-2格" | "3格" | "4格" | "5-6格";
type FooterQuickTemplate = {
  id: string;
  group: FooterQuickTemplateGroup;
  label: string;
  columns: 1 | 2 | 3;
  colRatios: number[];
  spans: Array<{ colSpan: number; rowSpan: number }>;
};
const footerQuickTemplates: FooterQuickTemplate[] = [
  // 1-2格
  { id: "ONE_FULL", group: "1-2格", label: "1格通栏", columns: 1, colRatios: [100], spans: [{ colSpan: 1, rowSpan: 1 }] },
  { id: "TWO_LR", group: "1-2格", label: "2格左右", columns: 2, colRatios: [50, 50], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "TWO_LR_WIDE_L", group: "1-2格", label: "左宽右窄", columns: 2, colRatios: [65, 35], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "TWO_LR_WIDE_R", group: "1-2格", label: "左窄右宽", columns: 2, colRatios: [35, 65], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "TWO_TB", group: "1-2格", label: "2格上下", columns: 1, colRatios: [100], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  // 3格
  { id: "THREE_L1_R2", group: "3格", label: "左1右2", columns: 2, colRatios: [45, 55], spans: [{ colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "THREE_L2_R1", group: "3格", label: "左2右1", columns: 2, colRatios: [55, 45], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "THREE_T1_B2", group: "3格", label: "上1下2", columns: 2, colRatios: [50, 50], spans: [{ colSpan: 2, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "THREE_T2_B1", group: "3格", label: "上2下1", columns: 2, colRatios: [50, 50], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 2, rowSpan: 1 }] },
  { id: "THREE_COLS", group: "3格", label: "3列并排", columns: 3, colRatios: [33, 34, 33], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "THREE_TB", group: "3格", label: "3格竖排", columns: 1, colRatios: [100], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  // 4格
  { id: "FOUR_GRID", group: "4格", label: "2×2四格", columns: 2, colRatios: [50, 50], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "FOUR_T1_B3", group: "4格", label: "上1下3", columns: 3, colRatios: [33, 34, 33], spans: [{ colSpan: 3, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "FOUR_T3_B1", group: "4格", label: "上3下1", columns: 3, colRatios: [33, 34, 33], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 3, rowSpan: 1 }] },
  { id: "FOUR_L1_M1_R2", group: "4格", label: "左1中1右2", columns: 3, colRatios: [34, 33, 33], spans: [{ colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "FOUR_L2_M1_R1", group: "4格", label: "左2中1右1", columns: 3, colRatios: [33, 33, 34], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "FOUR_T1_M2_B1", group: "4格", label: "上1中2下1", columns: 2, colRatios: [50, 50], spans: [{ colSpan: 2, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 2, rowSpan: 1 }] },
  // 5-6格
  { id: "FIVE_L1_R4", group: "5-6格", label: "左1右4", columns: 3, colRatios: [36, 32, 32], spans: [{ colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "FIVE_L4_R1", group: "5-6格", label: "左4右1", columns: 3, colRatios: [32, 32, 36], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 2 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "SIX_3X2", group: "5-6格", label: "3×2六格", columns: 3, colRatios: [33, 34, 33], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
  { id: "SIX_2X3", group: "5-6格", label: "2×3六格", columns: 2, colRatios: [50, 50], spans: [{ colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }, { colSpan: 1, rowSpan: 1 }] },
];
const footerQuickTemplateGroups: Array<{
  label: FooterQuickTemplateGroup;
  items: FooterQuickTemplate[];
}> = (["1-2格", "3格", "4格", "5-6格"] as FooterQuickTemplateGroup[]).map(
  (group) => ({
    label: group,
    items: footerQuickTemplates.filter((t) => t.group === group),
  }),
);

const activeFooterBlockId = ref<string>("");
const dragFooterIdx = ref<number | null>(null);
const dragOverFooterIdx = ref<number | null>(null);
const puzzleStageEl = ref<HTMLElement | null>(null);
const draggingSplitIdx = ref<number | null>(null);

function normalizeFooterCells(order?: HomeFooterCell[]) {
  return Array.isArray(order) && order.length === 4 && defaultFooterCells.every((id) => order.includes(id))
    ? [...order] : [...defaultFooterCells];
}

function defaultColRatiosFor(columns: number): number[] {
  if (columns === 1) return [100];
  if (columns === 3) return [33, 34, 33];
  return [50, 50];
}

function normalizeFooterColumns(value?: number): 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3 ? value : 2;
}

function normalizeFooterColRatios(raw: number[] | undefined, columns: 1 | 2 | 3): number[] {
  if (Array.isArray(raw) && raw.length === columns) {
    return raw.map((v) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(15, Math.min(85, Math.round(n))) : Math.round(100 / columns);
    });
  }
  return defaultColRatiosFor(columns);
}

function makeEmptyFooterBlock(index: number): HomeFooterBlock {
  return {
    id: `block-${Date.now().toString(36)}-${index}`,
    name: `区域 ${index}`,
    enabled: true,
    colSpan: 1,
    rowSpan: 1,
    topType: "IMAGE",
    topText: "",
    topImageUrl: "",
    topImageWidthPx: 110,
    topPreviewable: true,
    bottomType: "TEXT",
    bottomText: "",
    bottomImageUrl: "",
    bottomImageWidthPx: 110,
    bottomPreviewable: false,
  };
}

function normalizeFooterBlock(b: Partial<HomeFooterBlock>, index: number, columns: number): HomeFooterBlock {
  const cleanType = (t: unknown): HomeFooterSlotType =>
    t === "TEXT" || t === "IMAGE" ? t : "NONE";
  const cleanWidth = (w: unknown, fallback = 120) => {
    const n = Number(w);
    return Number.isFinite(n) ? Math.max(48, Math.min(360, Math.round(n))) : fallback;
  };
  return {
    id: typeof b.id === "string" && b.id.trim() ? b.id.trim() : `block-${index + 1}`,
    name: typeof b.name === "string" && b.name.trim() ? b.name.trim() : `区域 ${index + 1}`,
    enabled: b.enabled !== false,
    colSpan: Math.max(1, Math.min(columns, Math.round(Number(b.colSpan) || 1))),
    rowSpan: Math.max(1, Math.min(2, Math.round(Number(b.rowSpan) || 1))),
    topType: cleanType(b.topType),
    topText: typeof b.topText === "string" ? b.topText : "",
    topImageUrl: typeof b.topImageUrl === "string" ? b.topImageUrl : "",
    topImageWidthPx: cleanWidth(b.topImageWidthPx, 120),
    topPreviewable: Boolean(b.topPreviewable),
    bottomType: cleanType(b.bottomType),
    bottomText: typeof b.bottomText === "string" ? b.bottomText : "",
    bottomImageUrl: typeof b.bottomImageUrl === "string" ? b.bottomImageUrl : "",
    bottomImageWidthPx: cleanWidth(b.bottomImageWidthPx, 120),
    bottomPreviewable: Boolean(b.bottomPreviewable),
  };
}

function migrateLegacyFooterBlocks(footer: HomeLayoutConfig["footer"]): HomeFooterBlock[] {
  const order = normalizeFooterCells(footer.cellOrder);
  const qrs = footer.followQrcodes || [];
  const list: HomeFooterBlock[] = [];
  for (const id of order) {
    if (id === "BRAND") {
      list.push({
        id: "brand",
        name: "品牌底图",
        enabled: footer.brandEnabled !== false,
        colSpan: 1,
        rowSpan: 1,
        topType: "IMAGE",
        topText: "",
        topImageUrl: footer.brandImageUrl || DEFAULT_BRAND,
        topImageWidthPx: footer.brandWidthPx || 216,
        topPreviewable: false,
        bottomType: "NONE",
        bottomText: "",
        bottomImageUrl: "",
        bottomImageWidthPx: 120,
        bottomPreviewable: false,
      });
    } else if (id === "TEXT") {
      list.push({
        id: "text",
        name: "关注说明",
        enabled: Boolean(footer.followEnabled && qrs.length > 0),
        colSpan: 1,
        rowSpan: 1,
        topType: footer.followTitle?.trim() ? "TEXT" : "NONE",
        topText: footer.followTitle || "",
        topImageUrl: "",
        topImageWidthPx: 120,
        topPreviewable: false,
        bottomType: footer.followSubtitle?.trim() ? "TEXT" : "NONE",
        bottomText: footer.followSubtitle || "",
        bottomImageUrl: "",
        bottomImageWidthPx: 120,
        bottomPreviewable: false,
      });
    } else {
      const qrIdx = id === "QR1" ? 0 : 1;
      const qr = qrs[qrIdx];
      if (qr) {
        list.push({
          id: `qr-${qrIdx + 1}`,
          name: qr.label?.trim() || `二维码 ${qrIdx + 1}`,
          enabled: Boolean(footer.followEnabled),
          colSpan: 1,
          rowSpan: 1,
          topType: "IMAGE",
          topText: "",
          topImageUrl: qr.url,
          topImageWidthPx: 92,
          topPreviewable: true,
          bottomType: qr.label?.trim() ? "TEXT" : "NONE",
          bottomText: qr.label || "",
          bottomImageUrl: "",
          bottomImageWidthPx: 92,
          bottomPreviewable: false,
        });
      }
    }
  }
  qrs.slice(2).forEach((qr, idx) => {
    list.push({
      id: `qr-${idx + 3}`,
      name: qr.label?.trim() || `二维码 ${idx + 3}`,
      enabled: Boolean(footer.followEnabled),
      colSpan: 1,
      rowSpan: 1,
      topType: "IMAGE",
      topText: "",
      topImageUrl: qr.url,
      topImageWidthPx: 92,
      topPreviewable: true,
      bottomType: qr.label?.trim() ? "TEXT" : "NONE",
      bottomText: qr.label || "",
      bottomImageUrl: "",
      bottomImageWidthPx: 92,
      bottomPreviewable: false,
    });
  });
  return list;
}

const footerBlocks = computed<HomeFooterBlock[]>(() => layout.value?.footer.blocks || []);
const footerColumns = computed<1 | 2 | 3>(() =>
  normalizeFooterColumns(layout.value?.footer.columns),
);
const footerColRatios = computed<number[]>(() =>
  normalizeFooterColRatios(layout.value?.footer.colRatios, footerColumns.value),
);

const activeFooterBlockIndex = computed(() => {
  const list = footerBlocks.value;
  if (!list.length) return -1;
  const idx = list.findIndex((b) => b.id === activeFooterBlockId.value);
  return idx >= 0 ? idx : 0;
});

const activeFooterBlock = computed<HomeFooterBlock | null>(() => {
  const idx = activeFooterBlockIndex.value;
  return idx >= 0 ? footerBlocks.value[idx] ?? null : null;
});

function blockHasVisibleContent(b: HomeFooterBlock): boolean {
  const topOk =
    (b.topType === "TEXT" && Boolean(b.topText.trim())) ||
    (b.topType === "IMAGE" && Boolean(b.topImageUrl.trim()));
  const bottomOk =
    (b.bottomType === "TEXT" && Boolean(b.bottomText.trim())) ||
    (b.bottomType === "IMAGE" && Boolean(b.bottomImageUrl.trim()));
  return topOk || bottomOk;
}

function footerBlockMeta(b: HomeFooterBlock) {
  if (!b.enabled) return { active: false, badge: "已关闭", tone: "muted" as const };
  if (!blockHasVisibleContent(b)) return { active: false, badge: "待填写", tone: "warn" as const };
  return { active: true, badge: "显示中", tone: "ok" as const };
}

const footerPuzzleGridStyle = computed(() => ({
  gridTemplateColumns: footerColRatios.value.map((r) => `minmax(0, ${r}fr)`).join(" "),
  gridAutoFlow: "dense",
}));

const footerSplitPositions = computed(() => {
  const cols = footerColumns.value;
  if (cols <= 1) return [];
  const ratios = footerColRatios.value;
  const total = ratios.reduce((a, b) => a + b, 0) || 100;
  const gapPx = 14;
  const totalGap = gapPx * (cols - 1);
  const out: Array<{ idx: number; left: string; label: string }> = [];
  let acc = 0;
  for (let i = 0; i < cols - 1; i++) {
    acc += ratios[i]!;
    const frac = acc / total;
    out.push({
      idx: i,
      left: `calc((100% - ${totalGap}px) * ${frac} + ${i * gapPx}px)`,
      label: `${ratios[i]}% : ${ratios[i + 1]}%`,
    });
  }
  return out;
});

function setFooterColumns(cols: 1 | 2 | 3) {
  if (!layout.value) return;
  layout.value.footer.columns = cols;
  layout.value.footer.colRatios = defaultColRatiosFor(cols);
  for (const b of layout.value.footer.blocks || []) {
    if (b.colSpan > cols) b.colSpan = cols;
  }
}

const activeFooterTemplateId = computed(() => {
  const cols = footerColumns.value;
  const ratios = footerColRatios.value;
  const activeBlocks = footerBlocks.value.filter((b) => b.enabled !== false);
  const match = footerQuickTemplates.find((tpl) => {
    if (tpl.columns !== cols || tpl.spans.length !== activeBlocks.length) {
      return false;
    }
    const ratiosMatch =
      tpl.colRatios.length === ratios.length &&
      tpl.colRatios.every((r, i) => Math.abs(r - (ratios[i] ?? 0)) <= 4);
    if (!ratiosMatch) return false;
    return tpl.spans.every(
      (s, i) =>
        activeBlocks[i]?.colSpan === s.colSpan &&
        activeBlocks[i]?.rowSpan === s.rowSpan,
    );
  });
  return match?.id ?? "";
});

function footerTemplateThumbStyle(tpl: FooterQuickTemplate) {
  return {
    gridTemplateColumns: tpl.colRatios.map((r) => `minmax(0, ${r}fr)`).join(" "),
  };
}

function applyFooterTemplate(tplId: string) {
  const tpl = footerQuickTemplates.find((t) => t.id === tplId);
  if (!tpl || !layout.value) return;
  layout.value.footer.columns = tpl.columns;
  layout.value.footer.colRatios = [...tpl.colRatios];
  const blocks = layout.value.footer.blocks || (layout.value.footer.blocks = []);
  while (blocks.length < tpl.spans.length && blocks.length < 12) {
    blocks.push(makeEmptyFooterBlock(blocks.length + 1));
  }
  blocks.forEach((b, idx) => {
    const span = tpl.spans[idx];
    b.colSpan = span ? span.colSpan : 1;
    b.rowSpan = span ? span.rowSpan : 1;
    b.enabled = idx < tpl.spans.length;
  });
  if (blocks[0]) activeFooterBlockId.value = blocks[0].id;
}

function addFooterBlock() {
  if (!layout.value) return;
  const blocks = layout.value.footer.blocks || (layout.value.footer.blocks = []);
  if (blocks.length >= 12) return;
  const created = makeEmptyFooterBlock(blocks.length + 1);
  blocks.push(created);
  activeFooterBlockId.value = created.id;
}

function removeFooterBlock(idx: number) {
  const blocks = layout.value?.footer.blocks;
  if (!blocks || idx < 0 || idx >= blocks.length) return;
  blocks.splice(idx, 1);
  const next = blocks[Math.min(idx, blocks.length - 1)];
  activeFooterBlockId.value = next ? next.id : "";
}

function swapFooterBlockOrder(fromIdx: number, toIdx: number) {
  const blocks = layout.value?.footer.blocks;
  if (!blocks || fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= blocks.length || toIdx >= blocks.length) {
    return;
  }
  [blocks[fromIdx], blocks[toIdx]] = [blocks[toIdx]!, blocks[fromIdx]!];
}

function startFooterBlockDrag(idx: number) {
  dragFooterIdx.value = idx;
}

function dropFooterBlock(targetIdx: number) {
  if (dragFooterIdx.value !== null) {
    swapFooterBlockOrder(dragFooterIdx.value, targetIdx);
  }
  dragFooterIdx.value = null;
  dragOverFooterIdx.value = null;
}

function endFooterBlockDrag() {
  dragFooterIdx.value = null;
  dragOverFooterIdx.value = null;
}

function resetFooterRatios() {
  if (!layout.value) return;
  layout.value.footer.colRatios = defaultColRatiosFor(footerColumns.value);
}

function nudgeFooterColRatio(splitIdx: number, delta: number) {
  if (!layout.value) return;
  const ratios = [...footerColRatios.value];
  const left = ratios[splitIdx];
  const right = ratios[splitIdx + 1];
  if (left === undefined || right === undefined) return;
  const pairSum = left + right;
  const nextLeft = Math.max(15, Math.min(pairSum - 15, left + delta));
  ratios[splitIdx] = nextLeft;
  ratios[splitIdx + 1] = pairSum - nextLeft;
  layout.value.footer.colRatios = ratios;
}

function onSplitPointerMove(e: PointerEvent) {
  const idx = draggingSplitIdx.value;
  const stage = puzzleStageEl.value;
  if (idx === null || !stage || !layout.value) return;
  const rect = stage.getBoundingClientRect();
  if (rect.width <= 0) return;
  const ratios = [...footerColRatios.value];
  const total = ratios.reduce((a, b) => a + b, 0) || 100;
  const pct = Math.round(((e.clientX - rect.left) / rect.width) * total);
  const beforeSum = ratios.slice(0, idx).reduce((a, b) => a + b, 0);
  const pairSum = ratios[idx]! + ratios[idx + 1]!;
  const nextLeft = Math.max(15, Math.min(pairSum - 15, pct - beforeSum));
  ratios[idx] = nextLeft;
  ratios[idx + 1] = pairSum - nextLeft;
  layout.value.footer.colRatios = ratios;
}

function stopSplitDrag() {
  draggingSplitIdx.value = null;
  window.removeEventListener("pointermove", onSplitPointerMove);
  window.removeEventListener("pointerup", stopSplitDrag);
  window.removeEventListener("pointercancel", stopSplitDrag);
}

function startSplitDrag(splitIdx: number, e: PointerEvent) {
  e.preventDefault();
  draggingSplitIdx.value = splitIdx;
  window.addEventListener("pointermove", onSplitPointerMove);
  window.addEventListener("pointerup", stopSplitDrag);
  window.addEventListener("pointercancel", stopSplitDrag);
}

function syncLegacyBrandWidth(block: HomeFooterBlock) {
  if (layout.value && block.id === "brand" && block.topType === "IMAGE") {
    layout.value.footer.brandWidthPx = block.topImageWidthPx;
  }
}

const footerPreviewBlocks = computed(() =>
  footerBlocks.value.filter((b) => b.enabled && blockHasVisibleContent(b)),
);

const footerPreviewGridStyle = computed(() => {
  if (footerPreviewBlocks.value.length <= 1) return undefined;
  return {
    gridTemplateColumns: footerColRatios.value.map((r) => `minmax(0, ${r}fr)`).join(" "),
    gridAutoFlow: "dense",
  };
});

const snapshot = ref("");
const activeModule = ref<HomeModuleId>("ACTIVITIES");
const galleryPreview = ref<InstanceType<typeof HomeGalleryPreview>>();
const moduleEditor = ref<HTMLElement>();
watch(activeModule, () => {
  if (moduleEditor.value) moduleEditor.value.scrollTop = 0;
}, { flush: "post" });
const activeShortcutIdx = ref(0);
const loading = ref(false);
const saving = ref(false);
const importingBrand = ref(false);
const brandImportError = ref("");
async function importDefaultBrand(block: HomeFooterBlock) {
  if (importingBrand.value || saving.value || block.topImageUrl !== DEFAULT_BRAND) return;
  const actor = currentUser.value;
  const isCurrent = () =>
    actor === currentUser.value &&
    footerBlocks.value.includes(block) &&
    block.topImageUrl === DEFAULT_BRAND;
  importingBrand.value = true;
  brandImportError.value = "";
  try {
    const response = await fetch(defaultBrandPreview);
    if (!response.ok) throw new Error("默认品牌底图读取失败，请重试。");
    const blob = await response.blob();
    const asset = await uploadAdminImage(
      new File([blob], "野小子品牌底图.png", { type: "image/png" }),
      isCurrent,
      { name: "野小子品牌底图", category: "HOME" },
    );
    if (asset && isCurrent()) block.topImageUrl = asset.url;
  } catch (e) {
    if (isCurrent()) brandImportError.value = errorMessage(e);
  } finally {
    importingBrand.value = false;
  }
}
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
  copy.footer.brandImageUrl = copy.footer.brandImageUrl || DEFAULT_BRAND;
  copy.footer.brandWidthPx = copy.footer.brandWidthPx || 216;
  const cols = normalizeFooterColumns(copy.footer.columns);
  copy.footer.columns = cols;
  copy.footer.colRatios = normalizeFooterColRatios(copy.footer.colRatios, cols);
  copy.footer.blocks = Array.isArray(copy.footer.blocks)
    ? copy.footer.blocks.map((b, i) => normalizeFooterBlock(b, i, cols))
    : migrateLegacyFooterBlocks(copy.footer);
  if (copy.footer.blocks.length && !activeFooterBlockId.value) {
    activeFooterBlockId.value = copy.footer.blocks[0]!.id;
  }
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

const shortcutTypeLabels: Record<string, string> = {
  PAGE: "页面",
  WECHAT_ARTICLE: "公众号",
  POPUP: "弹窗",
  ACTIVITY: "活动",
  ARTICLE: "文章",
};

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

// Featured activities 6-slot workbench: fill, reorder, drag-swap & remove
const dragActivityIdx = ref<number | null>(null);
const overActivityIdx = ref<number | null>(null);

const activitySlotCount = computed(() => {
  const max = Number(layout.value?.activities.maxCount) || 6;
  const filled = layout.value?.activities.featuredActivityIds.length ?? 0;
  return Math.min(12, Math.max(1, max, filled));
});

const activitySlots = computed(() => {
  const ids = layout.value?.activities.featuredActivityIds ?? [];
  return Array.from({ length: activitySlotCount.value }, (_, index) => {
    const id = ids[index] ?? null;
    const activity = id ? activityCatalog.get(id) ?? null : null;
    return { index, id, activity };
  });
});

const nextActivitySlotIndex = computed(() => {
  const ids = layout.value?.activities.featuredActivityIds ?? [];
  return ids.length < activitySlotCount.value ? ids.length : -1;
});

function addFeaturedActivity(id: string) {
  if (!layout.value) return;
  const list = layout.value.activities.featuredActivityIds;
  if (list.length >= 12 || list.includes(id)) return;
  list.push(id);
}

function removeFeaturedActivity(index: number) {
  if (!layout.value) return;
  layout.value.activities.featuredActivityIds.splice(index, 1);
}

function moveFeaturedActivity(index: number, delta: -1 | 1) {
  if (!layout.value) return;
  const list = layout.value.activities.featuredActivityIds;
  const target = index + delta;
  if (target < 0 || target >= list.length) return;
  [list[index], list[target]] = [list[target]!, list[index]!];
}

function startActivityDrag(index: number, event: DragEvent) {
  if (saving.value) return;
  dragActivityIdx.value = index;
  overActivityIdx.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }
}

function overActivitySlot(index: number, event: DragEvent) {
  if (dragActivityIdx.value === null) return;
  event.preventDefault();
  overActivityIdx.value = index;
}

function dropActivitySlot(index: number) {
  const from = dragActivityIdx.value;
  dragActivityIdx.value = null;
  overActivityIdx.value = null;
  if (!layout.value || from === null || from === index) return;
  const list = layout.value.activities.featuredActivityIds;
  if (from < 0 || from >= list.length || index < 0 || index >= list.length) return;
  [list[from], list[index]] = [list[index]!, list[from]!];
}

function endActivityDrag() {
  dragActivityIdx.value = null;
  overActivityIdx.value = null;
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
            <div class="module-move">
              <button
                type="button"
                class="text-button"
                :disabled="idx === 0"
                @click.stop="moveArrayItem(layout.modules, idx, idx - 1)"
              >
                上移
              </button>
              <button
                type="button"
                class="text-button"
                :disabled="idx === layout.modules.length - 1"
                @click.stop="moveArrayItem(layout.modules, idx, idx + 1)"
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
          <section class="sub-box hero-media-card">
            <div class="hero-media-head">
              <div class="hero-media-title">
                <h3>主视觉头图</h3>
                <span class="hero-media-hint">建议横向高清图，支持拖拽或素材库替换</span>
              </div>
              <button
                v-if="layout.hero.imageUrl !== '/assets/hero-hiking.jpg'"
                type="button"
                class="text-button hero-reset-btn"
                @click="layout.hero.imageUrl = '/assets/hero-hiking.jpg'"
              >
                恢复默认山野主图
              </button>
            </div>
            <div class="hero-media-body">
              <div class="hero-media-preview">
                <img
                  :src="layout.hero.imageUrl"
                  alt="顶部主视觉预览"
                  class="hero-media-img"
                />
                <div class="hero-media-overlay">
                  <div
                    v-if="layout.hero.brandName || layout.hero.brandCaption"
                    class="hero-preview-brand"
                  >
                    <strong v-if="layout.hero.brandName">{{
                      layout.hero.brandName
                    }}</strong>
                    <span v-if="layout.hero.brandCaption">{{
                      layout.hero.brandCaption
                    }}</span>
                  </div>
                  <div class="hero-preview-copy">
                    <small v-if="layout.hero.kicker">{{
                      layout.hero.kicker
                    }}</small>
                    <strong v-if="layout.hero.title">{{
                      layout.hero.title
                    }}</strong>
                    <span v-if="layout.hero.subtitle">{{
                      layout.hero.subtitle
                    }}</span>
                  </div>
                </div>
              </div>
              <div class="hero-media-upload">
                <ImageUpload
                  category="HOME"
                  label="上传替换顶部主图"
                  @uploaded="layout.hero.imageUrl = $event"
                />
              </div>
            </div>
          </section>
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
          <div class="panel-head shortcut-panel-head">
            <div>
              <h2>快捷入口区</h2>
              <p class="field-hint shortcut-panel-sub">
                按小程序真实列数排布，点击卡片编辑，拖动可调整顺序（最多 8 个）
              </p>
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

          <div
            class="shortcut-chips"
            :style="{
              gridTemplateColumns: `repeat(${Math.min(4, Math.max(2, layout.shortcuts.columns || 4))}, minmax(0, 1fr))`,
            }"
          >
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
              <span class="shortcut-chip-index">{{ idx + 1 }}</span>
              <span class="shortcut-chip-type">{{
                shortcutTypeLabels[sc.type] || "入口"
              }}</span>
              <div class="shortcut-chip-shade">
                <span class="shortcut-chip-name">{{
                  sc.name || "未命名"
                }}</span>
              </div>
            </div>
            <button
              v-if="layout.shortcuts.items.length < 8"
              type="button"
              class="shortcut-add-slot"
              @click="addShortcut"
            >
              <AppIcon name="plus" :size="18" />
              <span>新增入口</span>
            </button>
          </div>

          <div v-if="activeShortcut" class="sub-box shortcut-editor-card">
            <div class="panel-head shortcut-editor-head">
              <div class="shortcut-editor-title">
                <span class="shortcut-editing-badge"
                  >#{{ activeShortcutIdx + 1 }}</span
                >
                <h3>{{ activeShortcut.name || "未命名入口" }}</h3>
              </div>
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

            <div class="shortcut-appearance">
              <div class="shortcut-preview-col">
                <div class="shortcut-live-preview">
                  <img
                    :src="
                      activeShortcut.imageUrl ||
                      presetIconImages[activeShortcut.icon] ||
                      presetIconImages.WEEKLY
                    "
                    alt="入口背景图"
                  />
                  <div class="shortcut-live-shade">
                    <strong>{{ activeShortcut.name || "入口名称" }}</strong>
                    <small>{{
                      shortcutTypeLabels[activeShortcut.type] || "页面"
                    }}</small>
                  </div>
                </div>
                <div class="shortcut-preview-foot">
                  <small class="muted">{{
                    activeShortcut.imageUrl ? "已用自定义封面" : "当前使用预设底图"
                  }}</small>
                  <button
                    v-if="activeShortcut.imageUrl"
                    type="button"
                    class="text-button"
                    @click="activeShortcut.imageUrl = ''"
                  >
                    恢复预设
                  </button>
                </div>
              </div>

              <div class="shortcut-fields-col">
                <div class="shortcut-basic-row">
                  <label>
                    入口名称（1–12字）
                    <input
                      v-model="activeShortcut.name"
                      maxlength="12"
                      placeholder="如：关于野小子"
                    />
                  </label>
                  <label>
                    默认底图风格
                    <select v-model="activeShortcut.icon">
                      <option
                        v-for="[k, label] in iconPresets"
                        :key="k"
                        :value="k"
                      >
                        {{ label }}
                      </option>
                    </select>
                  </label>
                </div>
                <ImageUpload
                  category="HOME"
                  label="上传自定义入口封面图"
                  @uploaded="activeShortcut.imageUrl = $event"
                />
              </div>
            </div>

            <div class="shortcut-action-box">
              <div
                class="shortcut-action-row"
                :class="{
                  'is-two-col':
                    activeShortcut.type === 'PAGE' ||
                    activeShortcut.type === 'ACTIVITY' ||
                    activeShortcut.type === 'ARTICLE',
                }"
              >
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
                    <option
                      v-for="[k, label] in pageOptions"
                      :key="k"
                      :value="k"
                    >
                      {{ label }}
                    </option>
                  </select>
                </label>

                <label v-else-if="activeShortcut.type === 'ACTIVITY'">
                  选择目标活动
                  <select v-model="activeShortcut.activityId">
                    <option value="">请选择已发布活动</option>
                    <option
                      v-for="a in allActivities"
                      :key="a.id"
                      :value="a.id"
                    >
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
              </div>

            <div
              v-if="activeShortcut.type === 'WECHAT_ARTICLE'"
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
                  category="HOME"
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
          <div class="sub-box activity-options-bar">
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
          </div>

          <div class="activity-slot-workbench">
            <section class="sub-box activity-slots-pane">
              <div class="shop-section-head">
                <h3>
                  首页排位（{{ layout.activities.featuredActivityIds.length }} /
                  {{ activitySlotCount }} 位）
                </h3>
                <span class="field-hint">点击右侧填入空位，拖动已填卡片可换位</span>
              </div>
              <div class="featured-activities activity-slots-grid">
                <template v-for="slot in activitySlots" :key="slot.index">
                  <article
                    v-if="slot.id"
                    class="featured-rank-card activity-filled-slot"
                    :class="{
                      'is-dragging': dragActivityIdx === slot.index,
                      'is-drop-target':
                        overActivityIdx === slot.index &&
                        dragActivityIdx !== slot.index,
                    }"
                    :draggable="!saving"
                    @dragstart="startActivityDrag(slot.index, $event)"
                    @dragover="overActivitySlot(slot.index, $event)"
                    @drop.prevent="dropActivitySlot(slot.index)"
                    @dragend="endActivityDrag"
                  >
                    <div class="slot-card-media">
                      <img
                        v-if="slot.activity?.coverUrl"
                        :src="slot.activity.coverUrl"
                        alt=""
                      />
                      <div v-else class="slot-card-placeholder">
                        <AppIcon name="mountain" :size="20" />
                      </div>
                      <span class="slot-rank-badge">第 {{ slot.index + 1 }} 位</span>
                    </div>
                    <div class="slot-card-body">
                      <strong>{{ slot.activity?.title || "正在读取活动…" }}</strong>
                      <small class="muted">{{
                        slot.activity?.location || "活动详情同步中"
                      }}</small>
                      <div class="slot-card-actions">
                        <button
                          type="button"
                          class="text-button"
                          :disabled="saving || slot.index === 0"
                          @click="moveFeaturedActivity(slot.index, -1)"
                        >
                          前移
                        </button>
                        <button
                          type="button"
                          class="text-button"
                          :disabled="
                            saving ||
                            slot.index >=
                              layout.activities.featuredActivityIds.length - 1
                          "
                          @click="moveFeaturedActivity(slot.index, 1)"
                        >
                          后移
                        </button>
                        <button
                          type="button"
                          class="text-button danger-text"
                          :disabled="saving"
                          @click="removeFeaturedActivity(slot.index)"
                        >
                          移出
                        </button>
                      </div>
                    </div>
                  </article>
                  <div
                    v-else
                    class="activity-empty-slot"
                    :class="{ 'is-next': nextActivitySlotIndex === slot.index }"
                  >
                    <span class="empty-slot-index">位置 {{ slot.index + 1 }}</span>
                    <small>{{
                      nextActivitySlotIndex === slot.index
                        ? "下一个填入此位"
                        : "空位 · 点击右侧填入"
                    }}</small>
                  </div>
                </template>
              </div>
            </section>

            <section class="sub-box activity-candidates-pane">
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
                <li
                  v-for="act in candidateActivities"
                  :key="act.id"
                  class="candidate-card"
                >
                  <button
                    type="button"
                    class="candidate-card-btn"
                    :disabled="
                      saving || layout.activities.featuredActivityIds.length >= 12
                    "
                    @click="addFeaturedActivity(act.id)"
                  >
                    <div class="candidate-thumb">
                      <img v-if="act.coverUrl" :src="act.coverUrl" alt="" />
                      <AppIcon v-else name="mountain" :size="18" />
                    </div>
                    <div class="candidate-info">
                      <strong class="candidate-title">{{ act.title }}</strong>
                      <small class="candidate-meta">
                        <span>{{ act.location }}</span>
                        <span v-if="act.startAt">{{
                          displayDate(act.startAt)
                        }}</span>
                        <span class="candidate-price">{{
                          act.priceCents > 0
                            ? `¥${(act.priceCents / 100).toFixed(2)}`
                            : "免费"
                        }}</span>
                      </small>
                    </div>
                    <span class="candidate-fill-pill">
                      {{
                        nextActivitySlotIndex >= 0
                          ? `填入第 ${nextActivitySlotIndex + 1} 位`
                          : "加入排位"
                      }}
                    </span>
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
            </section>
          </div>
        </div>

        <!-- 4. SHOP -->
        <div v-else-if="activeModule === 'SHOP'" class="editor-panel">
          <h2>装备横幅与精选商品</h2>

          <section class="sub-box shop-banner-card">
            <div class="shop-section-head">
              <label class="field checkbox-field">
                <input v-model="layout.shop.showBanner" type="checkbox" />
                <span>显示通栏装备横幅</span>
              </label>
              <button
                v-if="
                  layout.shop.showBanner &&
                  layout.shop.bannerImageUrl !== '/assets/equipment-banner.jpg'
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
            <template v-if="layout.shop.showBanner">
              <div class="shop-banner-media">
                <div class="shop-banner-preview">
                  <img
                    :src="layout.shop.bannerImageUrl"
                    alt=""
                    class="banner-thumb"
                  />
                  <div class="shop-banner-preview-copy">
                    <small v-if="layout.shop.bannerTag">{{
                      layout.shop.bannerTag
                    }}</small>
                    <strong v-if="layout.shop.bannerTitle">{{
                      layout.shop.bannerTitle
                    }}</strong>
                    <span v-if="layout.shop.bannerCta"
                      >{{ layout.shop.bannerCta }} ›</span
                    >
                  </div>
                </div>
                <div class="shop-banner-upload">
                  <ImageUpload
                    category="HOME"
                    label="上传替换装备横幅图"
                    @uploaded="layout.shop.bannerImageUrl = $event"
                  />
                </div>
              </div>
              <div class="shop-banner-fields">
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
            </template>
          </section>

          <section class="sub-box shop-products-toolbar">
            <div class="shop-toolbar-row">
              <label class="field checkbox-field">
                <input v-model="layout.shop.showProducts" type="checkbox" />
                <span>显示首页商品卡片网格</span>
              </label>
              <div v-if="layout.shop.showProducts" class="shop-toolbar-options">
                <label class="compact-select shop-count-field">
                  <span>展示件数</span>
                  <input
                    v-model.number="layout.shop.maxCount"
                    type="number"
                    min="1"
                    max="8"
                  />
                </label>
                <label class="field checkbox-field">
                  <input v-model="layout.shop.autoFill" type="checkbox" />
                  <span>自动补齐在售商品</span>
                </label>
              </div>
            </div>
          </section>

          <div
            v-if="
              layout.shop.showProducts &&
              layout.shop.featuredProductIds.length
            "
            class="sub-box"
          >
            <div class="shop-section-head">
              <h3>
                已排定商品（{{ layout.shop.featuredProductIds.length }} 件）
              </h3>
              <span
                v-if="layout.shop.featuredProductIds.length > 1"
                class="field-hint"
                >拖动卡片可调整展示顺序</span
              >
            </div>
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
            <div class="shop-section-head">
              <h3>选择优先展示的商品</h3>
              <span class="field-hint"
                >已选 {{ layout.shop.featuredProductIds.length }} / 8 件 ·
                点击卡片加入或移出</span
              >
            </div>
            <div class="product-pick-grid">
              <button
                v-for="prod in allProducts"
                :key="prod.id"
                type="button"
                class="product-pick-btn"
                :disabled="
                  saving ||
                  (layout.shop.featuredProductIds.length >= 8 &&
                    !layout.shop.featuredProductIds.includes(prod.id))
                "
                :aria-pressed="layout.shop.featuredProductIds.includes(prod.id)"
                :class="{
                  'is-picked': layout.shop.featuredProductIds.includes(prod.id),
                }"
                @click="toggleFeaturedProduct(prod.id)"
              >
                <div class="product-pick-media">
                  <img :src="prod.imageUrl" alt="" />
                  <span
                    v-if="layout.shop.featuredProductIds.includes(prod.id)"
                    class="product-pick-badge"
                  >
                    第
                    {{ layout.shop.featuredProductIds.indexOf(prod.id) + 1 }} 位
                  </span>
                </div>
                <div class="product-pick-body">
                  <span class="product-pick-name">{{ prod.name }}</span>
                  <div class="product-pick-meta">
                    <strong class="product-pick-price"
                      >¥{{ (prod.priceCents / 100).toFixed(2) }}</strong
                    >
                    <small class="product-pick-state">{{
                      layout.shop.featuredProductIds.includes(prod.id)
                        ? "已选中"
                        : "点击选择"
                    }}</small>
                  </div>
                </div>
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

          <div class="sub-box">
            <h3>当前轮播内容</h3>
            <p v-if="!galleryPreview" class="muted">板块显示后可查看当前轮播内容。</p>
            <p v-else-if="!galleryPreview.slides.length" class="muted">正在加载轮播内容…</p>
            <template v-else>
              <p class="muted">
                {{ galleryPreview.sourceLabel }} · 共 {{ galleryPreview.slides.length }} 项
              </p>
              <p v-if="layout.gallery.mode === 'AUTO_ARTICLES'" class="muted">
                自动模式会在没有可展示的文章时使用备用内容。要指定图片、文案或跳转，可切换到自定义。
              </p>
              <ol class="gallery-preview-items">
                <li v-for="(slide, index) in galleryPreview.slides" :key="slide.id">
                  <button
                    type="button"
                    class="secondary gallery-preview-item"
                    :aria-pressed="galleryPreview.index === index"
                    @click="galleryPreview.selectSlide(index)"
                  >
                    <img v-if="slide.imageUrl" :src="slide.imageUrl" alt="" />
                    <span>{{ index + 1 }}. {{ slide.title || "未填写标题" }}</span>
                  </button>
                </li>
              </ol>
            </template>
          </div>

          <div v-if="layout.gallery.mode === 'CUSTOM'" class="sub-box">
            <div class="panel-head">
              <h3>自定义轮播图（{{ layout.gallery.slides.length }} / 10）</h3>
              <ImageUpload
                category="HOME"
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

        <!-- 6. FOOTER (Generic flexible puzzle blocks: top text/image + bottom text/image) -->
        <div v-else-if="activeModule === 'FOOTER'" class="editor-panel">
          <div class="panel-head">
            <div>
              <h2>首页底部配置</h2>
              <p class="field-hint footer-panel-desc">
                每个区域均可自由组合「上部文字/图片 + 下部文字/图片」，支持 1–3 列自由排布、跨列/跨行、拖动换位与推动列宽。
              </p>
            </div>
            <div class="footer-head-toggles">
              <div class="footer-pos-switcher" role="group" aria-label="底部网格列数">
                <span class="footer-pos-switcher-label">列数</span>
                <button
                  v-for="c in ([1, 2, 3] as const)"
                  :key="c"
                  type="button"
                  class="footer-pos-btn"
                  :class="{ 'is-current': footerColumns === c }"
                  :data-footer-cols="c"
                  :aria-pressed="footerColumns === c"
                  @click="setFooterColumns(c)"
                >
                  {{ c }}列
                </button>
              </div>
              <button
                type="button"
                class="secondary"
                :disabled="footerBlocks.length >= 12"
                data-footer-add
                @click="addFooterBlock"
              >
                + 添加区域
              </button>
            </div>
          </div>

          <!-- Quick Layout Presets (1 to 6 common arrangements) -->
          <div class="footer-preset-bar" role="group" aria-label="快捷排列组合">
            <div class="footer-preset-bar-head">
              <span class="footer-preset-group-label">快捷排列</span>
              <span class="footer-preset-bar-hint">点击一键切换常见版式，切换后仍可继续拖拽或微调列宽</span>
            </div>
            <div class="footer-preset-groups">
              <div
                v-for="group in footerQuickTemplateGroups"
                :key="group.label"
                class="footer-preset-group"
              >
                <span class="footer-preset-group-tag">{{ group.label }}</span>
                <div class="footer-preset-items">
                  <button
                    v-for="tpl in group.items"
                    :key="tpl.id"
                    type="button"
                    class="footer-preset-card"
                    :class="{ 'is-active': activeFooterTemplateId === tpl.id }"
                    :aria-pressed="activeFooterTemplateId === tpl.id"
                    :data-footer-preset="tpl.id"
                    @click="applyFooterTemplate(tpl.id)"
                  >
                    <span
                      class="footer-preset-thumb"
                      :style="footerTemplateThumbStyle(tpl)"
                      aria-hidden="true"
                    >
                      <i
                        v-for="(span, sIdx) in tpl.spans"
                        :key="sIdx"
                        :style="{
                          gridColumn: `span ${span.colSpan}`,
                          gridRow: `span ${span.rowSpan}`,
                        }"
                      />
                    </span>
                    <span>{{ tpl.label }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Interactive Generic Puzzle Canvas -->
          <div
            v-if="footerBlocks.length"
            ref="puzzleStageEl"
            class="footer-puzzle-stage footer-puzzle-stage-auto"
            :class="{ 'is-resizing': draggingSplitIdx !== null }"
          >
            <div
              class="footer-puzzle-grid"
              role="list"
              aria-label="首页底部区域排布"
              :style="footerPuzzleGridStyle"
            >
              <div
                v-for="(block, bIdx) in footerBlocks"
                :key="block.id"
                class="footer-slot-card"
                :class="{
                  'is-selected': activeFooterBlock?.id === block.id,
                  'is-muted': !footerBlockMeta(block).active,
                  'is-dragging': dragFooterIdx === bIdx,
                  'is-drag-over': dragOverFooterIdx === bIdx && dragFooterIdx !== bIdx,
                }"
                :style="{
                  gridColumn: block.colSpan > 1 ? `span ${Math.min(block.colSpan, footerColumns)}` : undefined,
                  gridRow: block.rowSpan > 1 ? `span ${block.rowSpan}` : undefined,
                }"
                role="listitem"
                tabindex="0"
                draggable="true"
                :data-footer-pos="bIdx"
                :data-footer-block="block.id"
                :aria-pressed="activeFooterBlock?.id === block.id"
                @click="activeFooterBlockId = block.id"
                @keydown.enter.prevent="activeFooterBlockId = block.id"
                @keydown.space.prevent="activeFooterBlockId = block.id"
                @dragstart="startFooterBlockDrag(bIdx)"
                @dragenter.prevent="dragOverFooterIdx = bIdx"
                @dragover.prevent="dragOverFooterIdx = bIdx"
                @drop.prevent="dropFooterBlock(bIdx)"
                @dragend="endFooterBlockDrag"
              >
                <div class="footer-slot-head">
                  <div class="footer-slot-title">
                    <strong>{{ block.name }}</strong>
                    <span v-if="block.colSpan > 1" class="footer-pos-tag">占{{ Math.min(block.colSpan, footerColumns) }}列</span>
                    <span v-if="block.rowSpan > 1" class="footer-pos-tag">跨2行</span>
                  </div>
                  <div class="footer-slot-right">
                    <span
                      class="footer-status-pill"
                      :class="`is-${footerBlockMeta(block).tone}`"
                    >
                      {{ footerBlockMeta(block).badge }}
                    </span>
                    <span class="footer-drag-grip" title="拖动换位" aria-hidden="true">
                      <AppIcon name="grip" :size="14" />
                    </span>
                  </div>
                </div>

                <div class="footer-slot-body">
                  <template v-if="block.topType === 'IMAGE' && block.topImageUrl">
                    <img
                      class="footer-slot-brand-img"
                      :src="brandPreviewUrl(block.topImageUrl)"
                      alt=""
                    />
                  </template>
                  <strong
                    v-else-if="block.topType === 'TEXT' && block.topText.trim()"
                    class="footer-slot-text-title"
                  >
                    {{ block.topText }}
                  </strong>

                  <template v-if="block.bottomType === 'IMAGE' && block.bottomImageUrl">
                    <img
                      class="footer-slot-qr-img"
                      :src="brandPreviewUrl(block.bottomImageUrl)"
                      alt=""
                    />
                  </template>
                  <span
                    v-else-if="block.bottomType === 'TEXT' && block.bottomText.trim()"
                    class="footer-slot-text-sub"
                  >
                    {{ block.bottomText }}
                  </span>

                  <div v-if="!blockHasVisibleContent(block)" class="footer-slot-empty">
                    <AppIcon name="plus" :size="16" />
                    <span>点击配置文字或图片</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Column Ratio Push Splitters -->
            <button
              v-for="split in footerSplitPositions"
              :key="split.idx"
              type="button"
              class="footer-splitter footer-splitter-v"
              :class="{ 'is-active': draggingSplitIdx === split.idx }"
              :style="{ left: split.left, top: '0', bottom: '0' }"
              :data-footer-splitter="`col-${split.idx}`"
              aria-label="左右推动调整列宽比例"
              title="左右拖动调整列宽比例"
              @pointerdown="startSplitDrag(split.idx, $event)"
              @keydown.left.prevent="nudgeFooterColRatio(split.idx, -5)"
              @keydown.right.prevent="nudgeFooterColRatio(split.idx, 5)"
            >
              <span class="footer-splitter-handle" />
              <span v-if="draggingSplitIdx === split.idx" class="footer-splitter-tip">
                {{ split.label }}
              </span>
            </button>
          </div>
          <div v-else class="footer-off-banner">
            <span>当前没有底部区域，点击右上角「+ 添加区域」或选择快捷排列即可开始配置。</span>
          </div>

          <!-- Column Ratio Bar -->
          <div v-if="footerColumns > 1 && footerBlocks.length" class="footer-ratio-bar">
            <div class="footer-ratio-stats">
              <span class="footer-ratio-chip">
                列宽比例 <strong>{{ footerColRatios.map((r) => `${r}%`).join(" : ") }}</strong>
              </span>
              <span class="field-hint">拖动列间分割条可推动左右宽度比例</span>
            </div>
            <button
              v-if="footerColRatios.some((r, i) => r !== defaultColRatiosFor(footerColumns)[i])"
              type="button"
              class="text-button"
              @click="resetFooterRatios"
            >
              恢复均分
            </button>
          </div>

          <!-- Generic Block Inspector (Top: None/Text/Image + Bottom: None/Text/Image) -->
          <div v-if="activeFooterBlock" class="sub-box footer-inspector">
            <div class="footer-inspector-head">
              <div class="footer-inspector-title">
                <input
                  v-model="activeFooterBlock.name"
                  class="footer-block-name-input"
                  maxlength="40"
                  aria-label="区域名称"
                  placeholder="区域名称（如：品牌底图 / 公众号）"
                />
                <label class="footer-toggle-pill">
                  <input
                    v-model="activeFooterBlock.enabled"
                    type="checkbox"
                    data-footer-toggle="block"
                  />
                  <span>显示</span>
                </label>
              </div>
              <div class="footer-inspector-actions">
                <div v-if="footerColumns > 1" class="footer-pos-switcher" role="group" aria-label="横跨列数">
                  <span class="footer-pos-switcher-label">占宽</span>
                  <button
                    v-for="span in footerColumns"
                    :key="span"
                    type="button"
                    class="footer-pos-btn"
                    :class="{ 'is-current': Math.min(activeFooterBlock.colSpan, footerColumns) === span }"
                    @click="activeFooterBlock.colSpan = span"
                  >
                    {{ span }}列
                  </button>
                </div>
                <div class="footer-pos-switcher" role="group" aria-label="纵跨行数">
                  <span class="footer-pos-switcher-label">占高</span>
                  <button
                    v-for="rSpan in ([1, 2] as const)"
                    :key="rSpan"
                    type="button"
                    class="footer-pos-btn"
                    :class="{ 'is-current': activeFooterBlock.rowSpan === rSpan }"
                    @click="activeFooterBlock.rowSpan = rSpan"
                  >
                    {{ rSpan }}行
                  </button>
                </div>
                <button
                  type="button"
                  class="text-button"
                  :disabled="activeFooterBlockIndex <= 0"
                  @click="swapFooterBlockOrder(activeFooterBlockIndex, activeFooterBlockIndex - 1)"
                >
                  前移
                </button>
                <button
                  type="button"
                  class="text-button danger-text"
                  data-footer-delete
                  @click="removeFooterBlock(activeFooterBlockIndex)"
                >
                  删除
                </button>
              </div>
            </div>

            <div class="footer-parts-grid">
              <!-- Top Part -->
              <div class="footer-part-card">
                <div class="footer-part-head">
                  <strong>上部内容</strong>
                  <div class="footer-pos-switcher" role="group" aria-label="上部内容类型">
                    <button
                      v-for="opt in footerSlotTypeOptions"
                      :key="opt.value"
                      type="button"
                      class="footer-pos-btn"
                      :class="{ 'is-current': activeFooterBlock.topType === opt.value }"
                      :data-footer-top-type="opt.value"
                      @click="activeFooterBlock.topType = opt.value"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <label v-if="activeFooterBlock.topType === 'TEXT'">
                  上部文字
                  <input
                    v-model="activeFooterBlock.topText"
                    maxlength="120"
                    placeholder="输入标题或说明文字"
                  />
                </label>

                <template v-else-if="activeFooterBlock.topType === 'IMAGE'">
                  <div class="footer-part-image-row">
                    <div v-if="activeFooterBlock.topImageUrl" class="footer-part-preview">
                      <img
                        :src="brandPreviewUrl(activeFooterBlock.topImageUrl)"
                        :alt="activeFooterBlock.id === 'brand' ? '野小子底图预览' : '上部图片预览'"
                      />
                    </div>
                    <div class="image-setting-controls">
                      <ImageUpload
                        category="HOME"
                        compact
                        :disabled="importingBrand"
                        :key="`top-img-${activeFooterBlock.id}-${activeFooterBlock.topImageUrl}`"
                        :label="activeFooterBlock.topImageUrl ? '替换图片' : '上传图片'"
                        @uploaded="activeFooterBlock.topImageUrl = $event"
                      />
                      <button
                        v-if="activeFooterBlock.id === 'brand' && activeFooterBlock.topImageUrl === DEFAULT_BRAND"
                        type="button"
                        class="secondary"
                        :disabled="importingBrand || saving"
                        @click="importDefaultBrand(activeFooterBlock)"
                      >
                        {{ importingBrand ? "正在存入素材库…" : "将默认品牌底图存入素材库" }}
                      </button>
                      <small v-if="activeFooterBlock.id === 'brand' && brandImportError" class="field-error" role="alert">
                        {{ brandImportError }}
                      </small>
                      <label class="switch-inline">
                        <input v-model="activeFooterBlock.topPreviewable" type="checkbox" />
                        可长按识别 / 点击放大（二维码）
                      </label>
                    </div>
                  </div>
                  <div class="size-slider-row">
                    <label>
                      图片宽度：<strong>{{ activeFooterBlock.topImageWidthPx }} px</strong>
                    </label>
                    <div class="slider-inputs">
                      <input
                        v-model.number="activeFooterBlock.topImageWidthPx"
                        type="range"
                        min="48"
                        max="360"
                        step="4"
                        @input="syncLegacyBrandWidth(activeFooterBlock)"
                      />
                      <input
                        v-model.number="activeFooterBlock.topImageWidthPx"
                        type="number"
                        min="48"
                        max="360"
                        class="px-number"
                        @input="syncLegacyBrandWidth(activeFooterBlock)"
                      />
                    </div>
                  </div>
                </template>
                <p v-else class="field-hint">上部留空，仅显示下部内容。</p>
              </div>

              <!-- Bottom Part -->
              <div class="footer-part-card">
                <div class="footer-part-head">
                  <strong>下部内容</strong>
                  <div class="footer-pos-switcher" role="group" aria-label="下部内容类型">
                    <button
                      v-for="opt in footerSlotTypeOptions"
                      :key="opt.value"
                      type="button"
                      class="footer-pos-btn"
                      :class="{ 'is-current': activeFooterBlock.bottomType === opt.value }"
                      :data-footer-bottom-type="opt.value"
                      @click="activeFooterBlock.bottomType = opt.value"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>

                <label v-if="activeFooterBlock.bottomType === 'TEXT'">
                  下部文字
                  <input
                    v-model="activeFooterBlock.bottomText"
                    maxlength="120"
                    placeholder="输入副文案或标签（如：官方公众号）"
                  />
                </label>

                <template v-else-if="activeFooterBlock.bottomType === 'IMAGE'">
                  <div class="footer-part-image-row">
                    <div v-if="activeFooterBlock.bottomImageUrl" class="footer-part-preview">
                      <img
                        :src="brandPreviewUrl(activeFooterBlock.bottomImageUrl)"
                        alt="下部图片预览"
                      />
                    </div>
                    <div class="image-setting-controls">
                      <ImageUpload
                        category="HOME"
                        compact
                        :key="`bottom-img-${activeFooterBlock.id}-${activeFooterBlock.bottomImageUrl}`"
                        :label="activeFooterBlock.bottomImageUrl ? '替换图片' : '上传图片'"
                        @uploaded="activeFooterBlock.bottomImageUrl = $event"
                      />
                      <label class="switch-inline">
                        <input v-model="activeFooterBlock.bottomPreviewable" type="checkbox" />
                        可长按识别 / 点击放大（二维码）
                      </label>
                    </div>
                  </div>
                  <div class="size-slider-row">
                    <label>
                      图片宽度：<strong>{{ activeFooterBlock.bottomImageWidthPx }} px</strong>
                    </label>
                    <div class="slider-inputs">
                      <input
                        v-model.number="activeFooterBlock.bottomImageWidthPx"
                        type="range"
                        min="48"
                        max="360"
                        step="4"
                      />
                      <input
                        v-model.number="activeFooterBlock.bottomImageWidthPx"
                        type="number"
                        min="48"
                        max="360"
                        class="px-number"
                      />
                    </div>
                  </div>
                </template>
                <p v-else class="field-hint">下部留空，仅显示上部内容。</p>
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
                :ref="(instance) => (galleryPreview = instance as typeof galleryPreview)"
                class="pv-block"
                :config="layout.gallery"
                :active="activeModule === 'GALLERY'"
                @edit="activeModule = 'GALLERY'"
              />

              <div
                v-else-if="
                  mod.enabled && mod.id === 'FOOTER' && footerPreviewBlocks.length
                "
                class="pv-footer pv-interactive"
                :class="{ 'pv-footer-single': footerPreviewBlocks.length === 1 }"
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
                  v-for="block in footerPreviewBlocks"
                  :key="block.id"
                  class="pv-footer-cell"
                  :data-cell="block.id"
                  :style="{
                    gridColumn: block.colSpan > 1 ? `span ${Math.min(block.colSpan, footerColumns)}` : undefined,
                    gridRow: block.rowSpan > 1 ? `span ${block.rowSpan}` : undefined,
                  }"
                >
                  <div class="pv-qr-item">
                    <div
                      v-if="block.topType === 'IMAGE' && block.topImageUrl"
                      class="pv-brand-wrap"
                    >
                      <img
                        :src="brandPreviewUrl(block.topImageUrl)"
                        alt=""
                        :style="{ width: `${Math.round((block.topImageWidthPx / 375) * 240)}px` }"
                      />
                    </div>
                    <strong v-else-if="block.topType === 'TEXT' && block.topText.trim()">
                      {{ block.topText }}
                    </strong>

                    <div
                      v-if="block.bottomType === 'IMAGE' && block.bottomImageUrl"
                      class="pv-brand-wrap"
                    >
                      <img
                        :src="brandPreviewUrl(block.bottomImageUrl)"
                        alt=""
                        :style="{ width: `${Math.round((block.bottomImageWidthPx / 375) * 240)}px` }"
                      />
                    </div>
                    <small v-else-if="block.bottomType === 'TEXT' && block.bottomText.trim()">
                      {{ block.bottomText }}
                    </small>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </aside>
    </div>
  </main>
</template>

<style scoped>
.gallery-preview-items {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.gallery-preview-item {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  text-align: left;
}
.gallery-preview-item img {
  width: 48px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
}
.gallery-preview-item[aria-pressed="true"] {
  border-color: var(--rf-primary);
  background: var(--rf-soft);
}
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
.hero-media-card {
  gap: 12px;
}
.hero-media-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;
}
.hero-media-title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 10px;
}
.hero-media-hint {
  font-size: 12px;
  color: var(--rf-muted, #607268);
}
.hero-reset-btn {
  padding: 2px 0;
  font-size: 13px;
}
.hero-media-body {
  display: grid;
  grid-template-columns: minmax(220px, 1.08fr) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}
.hero-media-preview {
  position: relative;
  min-height: 168px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #173025;
}
.hero-media-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.hero-media-overlay {
  position: absolute;
  inset: 0;
  padding: 12px 14px;
  background: linear-gradient(
    180deg,
    rgba(13, 30, 21, 0.48) 0%,
    rgba(13, 30, 21, 0.08) 46%,
    rgba(13, 30, 21, 0.72) 100%
  );
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  pointer-events: none;
}
.hero-preview-brand {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
}
.hero-preview-brand strong {
  font-size: 13px;
  line-height: 1.25;
  font-weight: 700;
}
.hero-preview-brand span {
  font-size: 11px;
  line-height: 1.25;
  opacity: 0.88;
}
.hero-preview-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
}
.hero-preview-copy small {
  font-size: 10px;
  letter-spacing: 0.06em;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero-preview-copy strong {
  font-size: 15px;
  line-height: 1.28;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero-preview-copy span {
  font-size: 11px;
  line-height: 1.3;
  opacity: 0.92;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hero-media-upload {
  min-width: 0;
  display: flex;
}
.hero-media-upload :deep(.image-upload) {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.hero-media-upload :deep(.drop-zone) {
  flex: 1;
  min-height: 118px;
  padding: 12px 14px;
  background: var(--rf-surface, #fff);
}
.hero-media-upload :deep(.upload-secondary-row) {
  margin-top: 8px;
}
.hero-media-upload :deep(.library-button) {
  width: 100%;
  justify-content: center;
}
@media (max-width: 780px) {
  .hero-media-body {
    grid-template-columns: minmax(0, 1fr);
  }
  .hero-media-preview {
    min-height: 0;
    aspect-ratio: 16 / 9;
  }
}
.shortcut-panel-sub {
  margin: 4px 0 0;
}
.shortcut-chips {
  display: grid;
  gap: 10px;
}
.shortcut-chip {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  border: 2px solid transparent;
  background: #173025;
  overflow: hidden;
  cursor: grab;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}
.shortcut-chip:hover {
  border-color: rgba(22, 122, 82, 0.55);
  box-shadow: 0 4px 12px rgba(16, 37, 29, 0.12);
}
.shortcut-chip.is-selected {
  border-color: var(--rf-primary, #167a52);
  box-shadow: 0 0 0 2px rgba(22, 122, 82, 0.2);
}
.shortcut-chip img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shortcut-chip-index {
  position: absolute;
  top: 6px;
  left: 6px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(16, 37, 29, 0.76);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.shortcut-chip.is-selected .shortcut-chip-index {
  background: var(--rf-primary, #167a52);
}
.shortcut-chip-type {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.88);
  color: var(--rf-ink, #18271f);
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.5;
}
.shortcut-chip-shade {
  position: absolute;
  inset: auto 0 0 0;
  padding: 18px 8px 7px;
  background: linear-gradient(transparent, rgba(14, 30, 22, 0.82));
  color: #fff;
}
.shortcut-chip-name {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shortcut-add-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  aspect-ratio: 16 / 10;
  width: 100%;
  height: auto;
  min-height: 0;
  padding: 8px;
  border-radius: 10px;
  border: 1.5px dashed var(--rf-field-line, #cdd9d0);
  background: var(--rf-surface-subtle, #f9fbf9);
  color: var(--rf-muted, #687b70);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.shortcut-add-slot:hover {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-primary-text, #126743);
}
.shortcut-editor-card {
  background: #fff;
  gap: 16px;
}
.shortcut-editor-head {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--rf-line, #e0e8e2);
}
.shortcut-editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.shortcut-editing-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-primary-text, #126743);
  font-size: 12px;
  font-weight: 700;
}
.shortcut-appearance {
  display: grid;
  grid-template-columns: 204px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.shortcut-preview-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.shortcut-live-preview {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #173025;
}
.shortcut-live-preview img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.shortcut-live-shade {
  position: absolute;
  inset: auto 0 0 0;
  padding: 20px 10px 9px;
  background: linear-gradient(transparent, rgba(14, 30, 22, 0.82));
  color: #fff;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}
.shortcut-live-shade strong {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shortcut-live-shade small {
  flex-shrink: 0;
  font-size: 11px;
  opacity: 0.85;
}
.shortcut-preview-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
}
.shortcut-fields-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}
.shortcut-basic-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.shortcut-basic-row label {
  margin: 0;
  min-width: 0;
}
.shortcut-action-box {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #e0e8e2);
  background: var(--rf-surface-subtle, #f9fbf9);
}
.shortcut-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}
.shortcut-action-row.is-two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.shortcut-action-row label {
  margin: 0;
  min-width: 0;
}
@media (max-width: 780px) {
  .shortcut-appearance,
  .shortcut-basic-row,
  .shortcut-action-row.is-two-col {
    grid-template-columns: minmax(0, 1fr);
  }
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
  max-width: 200px;
}
.activity-options-bar {
  padding: 10px 14px;
  background: #fff;
}
.activity-slot-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
@media (max-width: 900px) {
  .activity-slot-workbench {
    grid-template-columns: minmax(0, 1fr);
  }
}
.activity-slots-pane,
.activity-candidates-pane {
  min-width: 0;
}
.activity-slots-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.activity-filled-slot {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  overflow: hidden;
  cursor: grab;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    opacity 0.16s ease;
}
.activity-filled-slot:hover {
  border-color: var(--rf-primary, #167a52);
  box-shadow: 0 4px 12px rgba(16, 37, 29, 0.08);
}
.activity-filled-slot.is-dragging {
  opacity: 0.55;
}
.activity-filled-slot.is-drop-target {
  border-color: var(--rf-primary, #167a52);
  box-shadow: 0 0 0 2px rgba(22, 122, 82, 0.22);
}
.slot-card-media {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9.5;
  background: var(--rf-soft, #e9f4ed);
  overflow: hidden;
}
.slot-card-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.slot-card-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--rf-muted, #687b70);
}
.slot-rank-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(16, 37, 29, 0.78);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
}
.slot-card-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 9px 7px;
  min-width: 0;
}
.slot-card-body strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 12.5px;
  line-height: 1.35;
  min-height: 2.7em;
  color: var(--rf-ink, #18271f);
}
.slot-card-body small {
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  margin-top: 4px;
  padding-top: 5px;
  border-top: 1px solid var(--rf-line, #e0e8e2);
}
.slot-card-actions .text-button {
  font-size: 11.5px;
  padding: 0 2px;
  min-height: 22px;
}
.activity-empty-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 158px;
  padding: 12px 10px;
  border-radius: 10px;
  border: 1.5px dashed var(--rf-field-line, #cdd9d0);
  background: rgba(255, 255, 255, 0.7);
  text-align: center;
  color: var(--rf-muted, #687b70);
}
.activity-empty-slot.is-next {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-primary-text, #126743);
}
.empty-slot-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 9px;
  border-radius: 999px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
  font-size: 12px;
  font-weight: 600;
}
.activity-empty-slot.is-next .empty-slot-index {
  background: var(--rf-primary, #167a52);
  border-color: var(--rf-primary, #167a52);
  color: #fff;
}
.activity-empty-slot small {
  font-size: 11.5px;
  line-height: 1.4;
}
.candidate-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 460px;
  overflow-y: auto;
}
.candidate-card {
  margin: 0;
  padding: 0;
}
.candidate-card-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: #fff;
  border: 1px solid var(--rf-line, #dce3dd);
  color: var(--rf-ink, #18271f);
  font-weight: 400;
  text-align: left;
  white-space: normal;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background-color 0.16s ease;
}
.candidate-card-btn:hover:not(:disabled) {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-surface-subtle, #f9fbf9);
  box-shadow: 0 3px 10px rgba(16, 37, 29, 0.06);
}
.candidate-thumb {
  flex: 0 0 74px;
  width: 74px;
  height: 54px;
  border-radius: 7px;
  overflow: hidden;
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-muted, #687b70);
  display: flex;
  align-items: center;
  justify-content: center;
}
.candidate-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.candidate-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.candidate-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--rf-ink, #18271f);
}
.candidate-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 11.5px;
  color: var(--rf-muted, #687b70);
}
.candidate-price {
  color: var(--rf-primary-text, #126743);
  font-weight: 600;
}
.candidate-fill-pill {
  flex-shrink: 0;
  padding: 5px 10px;
  border-radius: 999px;
  background: var(--rf-soft, #e9f4ed);
  color: var(--rf-primary-text, #126743);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.candidate-card-btn:hover:not(:disabled) .candidate-fill-pill {
  background: var(--rf-primary, #167a52);
  color: #fff;
}
.shop-section-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}
.shop-section-head .checkbox-field {
  margin: 0;
  font-weight: 600;
  color: var(--rf-ink);
}
.shop-banner-media {
  display: grid;
  grid-template-columns: minmax(210px, 260px) minmax(0, 1fr);
  gap: 16px;
  align-items: center;
}
.shop-banner-preview {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #173025;
  aspect-ratio: 16 / 8.5;
}
.shop-banner-preview .banner-thumb {
  width: 100%;
  height: 100%;
  border: 0;
  border-radius: 0;
  display: block;
}
.shop-banner-preview-copy {
  position: absolute;
  inset: 0;
  padding: 12px 14px;
  background: linear-gradient(90deg, rgba(16, 37, 25, 0.78), rgba(16, 37, 25, 0.12));
  color: #fff;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
}
.shop-banner-preview-copy small {
  font-size: 11px;
  opacity: 0.9;
}
.shop-banner-preview-copy strong {
  font-size: 15px;
  line-height: 1.3;
}
.shop-banner-preview-copy span {
  font-size: 11px;
  margin-top: 2px;
  opacity: 0.92;
}
.shop-banner-upload {
  min-width: 0;
}
.shop-banner-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr) minmax(110px, 0.75fr);
  gap: 12px;
}
.shop-banner-fields label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  margin: 0;
}
.shop-products-toolbar {
  padding: 12px 14px;
  background: #fff;
}
.shop-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px 18px;
}
.shop-toolbar-row .checkbox-field {
  margin: 0;
}
.shop-toolbar-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 16px;
}
.shop-count-field {
  font-size: 13px;
  color: var(--rf-muted);
}
.shop-count-field input {
  width: 68px;
  height: 34px;
  min-height: 34px;
  padding: 4px 8px;
  text-align: center;
}
@media (max-width: 780px) {
  .shop-banner-media,
  .shop-banner-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
.product-pick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(156px, 1fr));
  gap: 12px;
}
.product-pick-btn {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  width: 100%;
  min-width: 0;
  height: auto;
  min-height: 0;
  padding: 0;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  color: var(--rf-ink, #18271f);
  font-weight: 400;
  text-align: left;
  white-space: normal;
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background-color 0.16s ease;
}
.product-pick-btn:hover:not(:disabled) {
  border-color: var(--rf-primary, #167a52);
  box-shadow: 0 4px 12px rgba(16, 37, 29, 0.08);
}
.product-pick-btn.is-picked {
  border-color: var(--rf-primary, #167a52);
  background: var(--rf-soft, #e9f4ed);
  box-shadow: 0 0 0 1px rgba(22, 122, 82, 0.18);
}
.product-pick-media {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--rf-surface-subtle, #f9fbf9);
  overflow: hidden;
}
.product-pick-media img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
}
.product-pick-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--rf-primary, #167a52);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  box-shadow: 0 2px 6px rgba(16, 37, 29, 0.22);
}
.product-pick-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  min-width: 0;
}
.product-pick-name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--rf-ink, #18271f);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  min-height: 2.8em;
  overflow-wrap: anywhere;
}
.product-pick-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}
.product-pick-price {
  color: var(--rf-primary-text, #126743);
  font-size: 13px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.product-pick-state {
  color: var(--rf-muted, #687b70);
  font-size: 11px;
  white-space: nowrap;
}
.product-pick-btn.is-picked .product-pick-state {
  color: var(--rf-primary-text, #126743);
  font-weight: 600;
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
  gap: 3px;
  min-width: 0;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.pv-product-card strong {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  width: 100%;
  line-height: 1.35;
  min-height: 2.7em;
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
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: var(--rf-surface-subtle, #f9fbf9);
}
.footer-preset-bar-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 12px;
}
.footer-preset-bar-hint {
  font-size: 11px;
  color: var(--rf-muted, #687b70);
}
.footer-preset-groups {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.footer-preset-group {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.footer-preset-group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--rf-ink, #18271f);
}
.footer-preset-group-tag {
  flex: 0 0 42px;
  padding-top: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--rf-muted, #687b70);
  white-space: nowrap;
}
.footer-preset-items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
  flex: 1;
}
.footer-preset-card {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 4px 9px;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  color: var(--rf-ink, #18271f);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}
.footer-preset-card:hover {
  border-color: var(--rf-primary, #167a52);
}
.footer-preset-card:focus-visible {
  outline: 2px solid var(--rf-primary, #167a52);
  outline-offset: 1px;
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
  grid-auto-flow: dense;
  grid-auto-rows: 1fr;
  gap: 2px;
  flex-shrink: 0;
}
.footer-preset-thumb i {
  display: block;
  min-height: 0;
  border-radius: 2px;
  background: #c7d6cc;
}
.footer-preset-card.is-active .footer-preset-thumb i {
  background: var(--rf-primary, #167a52);
}
.footer-puzzle-stage {
  position: relative;
  user-select: none;
}
.footer-puzzle-stage-auto .footer-puzzle-grid {
  height: auto;
  grid-auto-rows: minmax(112px, auto);
}
.footer-block-name-input {
  width: 180px;
  max-width: 100%;
  font-weight: 600;
}
.footer-inspector-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.footer-parts-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
@media (max-width: 820px) {
  .footer-parts-grid {
    grid-template-columns: 1fr;
  }
}
.footer-part-card {
  padding: 12px;
  border-radius: 10px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.footer-part-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.footer-part-image-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.footer-part-preview {
  width: 72px;
  height: 72px;
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--rf-line, #dce3dd);
  background: #f6f8f3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.footer-part-preview img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
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
  min-width: 0;
  min-height: 0;
  border: 0;
  border-radius: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: none;
}
.footer-splitter:hover,
.footer-splitter:focus-visible,
.footer-splitter:active {
  background: transparent;
  box-shadow: none;
}
.footer-splitter-v {
  width: 14px;
  cursor: col-resize;
}
.footer-splitter-h {
  height: 14px;
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
.pv-brand-wrap {
  display: flex;
  justify-content: center;
  flex: 1;
  min-width: 0;
}
.pv-brand-wrap img {
  display: block;
  max-width: 100%;
  height: auto;
}
</style>
