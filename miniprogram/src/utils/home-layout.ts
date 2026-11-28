import { Activity, Home } from "./models";
import {
  defaultShortcutViews,
  safeGalleryVideo,
  safeShortcutImage,
  safeWechatArticleUrl,
  shortcutIcons,
} from "./home-shortcuts";

export type HomeModuleId =
  | "HERO"
  | "SHORTCUTS"
  | "ACTIVITIES"
  | "SHOP"
  | "GALLERY"
  | "FOOTER";

export interface HomeQrImage {
  url: string;
  label: string;
}

export interface HomeActionLink {
  type: "NONE" | "PAGE" | "ACTIVITY" | "ARTICLE" | "WECHAT_ARTICLE" | "POPUP";
  page: string;
  activityId: string;
  articleId: string;
  wechatArticleUrl: string;
  popupTitle: string;
  popupText: string;
  popupImages: HomeQrImage[];
}

export interface HomeShortcutView {
  slot: number;
  id: string;
  name: string;
  icon: string;
  image: string;
  type: "PAGE" | "ACTIVITY" | "ARTICLE" | "WECHAT_ARTICLE" | "POPUP";
  page: string;
  activityId: string;
  articleId: string;
  wechatArticleUrl: string;
  popupTitle: string;
  popupText: string;
  popupImageUrl: string;
  popupImages: HomeQrImage[];
}

export interface HomeHeroView {
  imageUrl: string;
  brandName: string;
  brandCaption: string;
  kicker: string;
  title: string;
  subtitle: string;
  action: HomeActionLink;
}

export interface HomeActivitiesHeader {
  eyebrow: string;
  title: string;
  showAllLink: boolean;
  maxCount: number;
  autoFill: boolean;
}

export interface HomeShopView {
  showBanner: boolean;
  bannerImageUrl: string;
  bannerTag: string;
  bannerTitle: string;
  bannerCta: string;
  showProducts: boolean;
  maxCount: number;
}

export type HomeGalleryMediaType = "IMAGE" | "VIDEO" | "ARTICLE";

export interface HomeGallerySlideView {
  id: string;
  mediaType: HomeGalleryMediaType;
  imageUrl: string;
  videoUrl: string;
  title: string;
  subtitle: string;
  action: HomeActionLink;
}

export interface HomeGalleryView {
  eyebrow: string;
  title: string;
  mode: "AUTO_ARTICLES" | "CUSTOM";
  slides: HomeGallerySlideView[];
}

type FooterCellId = "BRAND" | "TEXT" | "QR1" | "QR2";
export type FooterSlotType = "NONE" | "TEXT" | "IMAGE";
export interface FooterBlockPartView {
  type: FooterSlotType;
  text: string;
  url: string;
  widthPx: number;
  previewable: boolean;
}
export interface HomeFooterBlockInput {
  id?: string;
  name?: string;
  enabled?: boolean;
  colSpan?: number;
  rowSpan?: number;
  topType?: FooterSlotType;
  topText?: string;
  topImageUrl?: string;
  topImageWidthPx?: number;
  topPreviewable?: boolean;
  bottomType?: FooterSlotType;
  bottomText?: string;
  bottomImageUrl?: string;
  bottomImageWidthPx?: number;
  bottomPreviewable?: boolean;
}
export type FooterLayoutPreset =
  | "FOUR_GRID"
  | "THREE_L1_R2"
  | "THREE_L2_R1"
  | "THREE_T1_B2"
  | "THREE_T2_B1"
  | "TWO_LR"
  | "TWO_TB";
type FooterCellView = {
  id: string;
  kind: "BRAND" | "TEXT" | "QR" | "BLOCK";
  url: string;
  label: string;
  cellStyle: string;
  top?: FooterBlockPartView;
  bottom?: FooterBlockPartView;
};
const defaultFooterOrder: FooterCellId[] = ["BRAND", "QR1", "TEXT", "QR2"];
const footerPresetSlotStyles: Record<FooterLayoutPreset, string[]> = {
  FOUR_GRID: ["", "", "", ""],
  THREE_L1_R2: [
    "grid-column:1;grid-row:1 / span 2;",
    "grid-column:2;grid-row:1;",
    "grid-column:2;grid-row:2;",
  ],
  THREE_L2_R1: [
    "grid-column:1;grid-row:1;",
    "grid-column:1;grid-row:2;",
    "grid-column:2;grid-row:1 / span 2;",
  ],
  THREE_T1_B2: [
    "grid-column:1 / span 2;grid-row:1;",
    "grid-column:1;grid-row:2;",
    "grid-column:2;grid-row:2;",
  ],
  THREE_T2_B1: [
    "grid-column:1;grid-row:1;",
    "grid-column:2;grid-row:1;",
    "grid-column:1 / span 2;grid-row:2;",
  ],
  TWO_LR: ["grid-column:1;grid-row:1;", "grid-column:2;grid-row:1;"],
  TWO_TB: ["grid-column:1;grid-row:1;", "grid-column:1;grid-row:2;"],
};

export interface HomeFooterView {
  cellOrder: FooterCellId[];
  layoutPreset: FooterLayoutPreset;
  colRatio: number;
  rowRatio: number;
  columns: number;
  colRatios: number[];
  blocks?: HomeFooterBlockInput[];
  gridStyle: string;
  cells: FooterCellView[];
  previewUrls: string[];
  followEnabled: boolean;
  followTitle: string;
  followSubtitle: string;
  followQrcodes: HomeQrImage[];
  brandEnabled: boolean;
  brandImageUrl: string;
  brandWidthPx: number;
}

export interface HomeModuleEntry {
  id: HomeModuleId;
  enabled: boolean;
}

export interface PublicHomeLayoutPayload {
  layout: {
    version: number;
    modules: HomeModuleEntry[];
    hero?: Partial<HomeHeroView>;
    shortcuts?: {
      columns?: number;
      items?: Array<Partial<HomeShortcutView> & { imageUrl?: string }>;
    };
    activities?: Partial<HomeActivitiesHeader>;
    shop?: Partial<HomeShopView>;
    gallery?: Partial<HomeGalleryView>;
    footer?: Partial<HomeFooterView>;
  };
  featuredActivities?: Activity[];
  featuredEquipment?: Home["equipment"];
}

export const defaultHomeModules: HomeModuleEntry[] = [
  { id: "HERO", enabled: true },
  { id: "SHORTCUTS", enabled: true },
  { id: "ACTIVITIES", enabled: true },
  { id: "SHOP", enabled: true },
  { id: "GALLERY", enabled: true },
  { id: "FOOTER", enabled: true },
];

export const emptyHomeAction: HomeActionLink = {
  type: "NONE",
  page: "",
  activityId: "",
  articleId: "",
  wechatArticleUrl: "",
  popupTitle: "",
  popupText: "",
  popupImages: [],
};

export const defaultHeroView: HomeHeroView = {
  imageUrl: "/assets/hero-hiking.jpg",
  brandName: "野小子",
  brandCaption: "野一点，自由一点",
  kicker: "WILDBOY / OUTDOOR CLUB",
  title: "去山野，找回自己。",
  subtitle: "把日常留在身后 · 一起走出去",
  action: emptyHomeAction,
};

export const defaultActivitiesHeader: HomeActivitiesHeader = {
  eyebrow: "FIND YOUR NEXT ADVENTURE",
  title: "正在发生的山野",
  showAllLink: true,
  maxCount: 6,
  autoFill: true,
};

export const defaultShopView: HomeShopView = {
  showBanner: true,
  bannerImageUrl: "/assets/equipment-banner.jpg",
  bannerTag: "山野好物 · 轻装出发",
  bannerTitle: "把山野，装进行囊",
  bannerCta: "去逛逛",
  showProducts: true,
  maxCount: 4,
};

export const defaultGalleryView: HomeGalleryView = {
  eyebrow: "MOMENTS OUTSIDE",
  title: "山野之间",
  mode: "AUTO_ARTICLES",
  slides: [],
};

function sanitizeFooterImage(url: unknown): string {
  const s = typeof url === "string" ? url.trim() : "";
  if (!s) return "";
  if (s === "/assets/platform-brand-original-transparent.png") return s;
  return safeShortcutImage(s);
}

function sanitizeBlockPart(
  rawType: unknown,
  rawText: unknown,
  rawUrl: unknown,
  rawWidth: unknown,
  rawPreviewable: unknown,
): FooterBlockPartView {
  const type: FooterSlotType =
    rawType === "TEXT" || rawType === "IMAGE" ? rawType : "NONE";
  const text = typeof rawText === "string" ? rawText.trim().slice(0, 120) : "";
  const url = type === "IMAGE" ? sanitizeFooterImage(rawUrl) : "";
  const wNum = Number(rawWidth);
  const widthPx = Number.isFinite(wNum)
    ? Math.max(48, Math.min(360, Math.round(wNum)))
    : 120;
  const previewable = Boolean(rawPreviewable);
  if (type === "TEXT" && !text) {
    return { type: "NONE", text: "", url: "", widthPx, previewable: false };
  }
  if (type === "IMAGE" && !url) {
    return { type: "NONE", text: "", url: "", widthPx, previewable: false };
  }
  return { type, text, url, widthPx, previewable };
}

function normalizeFooterColumns(value: unknown): number {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 ? n : 2;
}

function defaultColRatiosFor(columns: number): number[] {
  if (columns === 1) return [100];
  if (columns === 3) return [33, 34, 33];
  return [50, 50];
}

function normalizeFooterColRatios(raw: unknown, columns: number): number[] {
  if (Array.isArray(raw) && raw.length === columns) {
    return raw.map((x) => {
      const n = Number(x);
      return Number.isFinite(n) ? Math.max(15, Math.min(85, Math.round(n))) : 50;
    });
  }
  return defaultColRatiosFor(columns);
}

function footerCells(
  footer: Omit<HomeFooterView, "cells" | "gridStyle" | "previewUrls">,
): FooterCellView[] {
  if (Array.isArray(footer.blocks)) {
    const cols = normalizeFooterColumns(footer.columns);
    const out: FooterCellView[] = [];
    for (let i = 0; i < footer.blocks.length; i++) {
      const b = footer.blocks[i];
      if (!b || b.enabled === false) continue;
      const top = sanitizeBlockPart(
        b.topType,
        b.topText,
        b.topImageUrl,
        b.topImageWidthPx,
        b.topPreviewable,
      );
      const bottom = sanitizeBlockPart(
        b.bottomType,
        b.bottomText,
        b.bottomImageUrl,
        b.bottomImageWidthPx,
        b.bottomPreviewable,
      );
      if (top.type === "NONE" && bottom.type === "NONE") continue;
      const colSpan = Math.max(1, Math.min(cols, Math.round(Number(b.colSpan) || 1)));
      const rowSpan = Math.max(1, Math.min(2, Math.round(Number(b.rowSpan) || 1)));
      const styleParts: string[] = [];
      if (colSpan > 1) styleParts.push(`grid-column:span ${colSpan}`);
      if (rowSpan > 1) styleParts.push(`grid-row:span ${rowSpan}`);
      out.push({
        id: typeof b.id === "string" && b.id ? b.id : `block-${i + 1}`,
        kind: "BLOCK",
        url: top.type === "IMAGE" ? top.url : bottom.type === "IMAGE" ? bottom.url : "",
        label: top.type === "TEXT" ? top.text : bottom.type === "TEXT" ? bottom.text : "",
        cellStyle: styleParts.join(";"),
        top,
        bottom,
      });
    }
    return out;
  }

  const qrs = footer.followEnabled ? footer.followQrcodes : [];
  const mapped: Partial<Record<FooterCellId, Omit<FooterCellView, "cellStyle">>> = {};
  if (footer.brandEnabled) mapped.BRAND = { id: "BRAND", kind: "BRAND", url: footer.brandImageUrl, label: "" };
  if (qrs.length && (footer.followTitle || footer.followSubtitle))
    mapped.TEXT = { id: "TEXT", kind: "TEXT", url: "", label: "" };
  const qrCell = (qr: HomeQrImage, index: number): Omit<FooterCellView, "cellStyle"> => ({
    id: "QR" + (index + 1), kind: "QR", url: qr.url, label: qr.label,
  });
  if (qrs[0]) mapped.QR1 = qrCell(qrs[0], 0);
  if (qrs[1]) mapped.QR2 = qrCell(qrs[1], 1);
  const slotStyles = footerPresetSlotStyles[footer.layoutPreset] || footerPresetSlotStyles.FOUR_GRID;
  const activeIds = footer.cellOrder.slice(0, slotStyles.length);
  const primary: Omit<FooterCellView, "cellStyle">[] = [];
  for (const id of activeIds) {
    const cell = mapped[id];
    if (cell) primary.push(cell);
  }
  const applyPresetStyles = primary.length === slotStyles.length;
  const cells: FooterCellView[] = primary.map((cell, idx) => ({
    ...cell,
    cellStyle: applyPresetStyles ? slotStyles[idx] || "" : "",
  }));
  return cells.concat(
    qrs.slice(2).map((qr, index) => ({ ...qrCell(qr, index + 2), cellStyle: "" })),
  );
}

function footerPreviewUrls(cells: FooterCellView[]): string[] {
  const urls: string[] = [];
  for (const cell of cells) {
    if (cell.kind === "QR" && cell.url) {
      urls.push(cell.url);
    } else if (cell.kind === "BLOCK") {
      if (cell.top?.type === "IMAGE" && cell.top.previewable && cell.top.url) {
        urls.push(cell.top.url);
      }
      if (cell.bottom?.type === "IMAGE" && cell.bottom.previewable && cell.bottom.url) {
        urls.push(cell.bottom.url);
      }
    }
  }
  return urls;
}

function footerGridStyle(
  footer: Omit<HomeFooterView, "cells" | "gridStyle" | "previewUrls">,
  cells: FooterCellView[],
): string {
  if (cells.length <= 1) return "";
  if (Array.isArray(footer.blocks)) {
    const cols = normalizeFooterColumns(footer.columns);
    const ratios = normalizeFooterColRatios(footer.colRatios, cols);
    const track = ratios.map((r) => `minmax(0,${r}fr)`).join(" ");
    return `grid-template-columns:${track};grid-auto-flow:dense`;
  }
  const parts: string[] = [];
  if (footer.layoutPreset === "TWO_TB") {
    parts.push("grid-template-columns:minmax(0,1fr)");
  } else {
    parts.push(
      `grid-template-columns:minmax(0,${footer.colRatio}fr) minmax(0,${100 - footer.colRatio}fr)`,
    );
  }
  if (footer.layoutPreset !== "TWO_LR" && footer.rowRatio !== 50) {
    parts.push(
      `grid-template-rows:minmax(0,${footer.rowRatio}fr) minmax(0,${100 - footer.rowRatio}fr)`,
    );
    parts.push("min-height:360rpx");
  }
  return parts.join(";");
}

function normalizeFooterOrder(order: unknown): FooterCellId[] {
  return Array.isArray(order) && order.length === 4 && defaultFooterOrder.every((id) => order.includes(id))
    ? order as FooterCellId[] : [...defaultFooterOrder];
}

function normalizeFooterPreset(preset: unknown): FooterLayoutPreset {
  return typeof preset === "string" && preset in footerPresetSlotStyles
    ? (preset as FooterLayoutPreset)
    : "FOUR_GRID";
}

function normalizeFooterRatio(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(25, Math.min(75, Math.round(num))) : 50;
}

const defaultFooterConfig: Omit<HomeFooterView, "cells" | "gridStyle" | "previewUrls"> = {
  cellOrder: [...defaultFooterOrder],
  layoutPreset: "FOUR_GRID",
  colRatio: 50,
  rowRatio: 50,
  columns: 2,
  colRatios: [50, 50],
  followEnabled: false,
  followTitle: "关注野小子",
  followSubtitle: "长按识别二维码 · 获取最新山野路线与动态",
  followQrcodes: [],
  brandEnabled: true,
  brandImageUrl: "/assets/platform-brand-original-transparent.png",
  brandWidthPx: 216,
};
const defaultFooterCellsList = footerCells(defaultFooterConfig);
export const defaultFooterView: HomeFooterView = {
  ...defaultFooterConfig,
  cells: defaultFooterCellsList,
  gridStyle: footerGridStyle(defaultFooterConfig, defaultFooterCellsList),
  previewUrls: footerPreviewUrls(defaultFooterCellsList),
};

function sanitizeQrList(raw: unknown): HomeQrImage[] {
  if (!Array.isArray(raw)) return [];
  const out: HomeQrImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const url = safeShortcutImage(String((item as HomeQrImage).url || ""));
    if (!url) continue;
    const label = String((item as HomeQrImage).label || "")
      .trim()
      .slice(0, 40);
    out.push({ url, label });
  }
  return out;
}

function sanitizeAction(raw: unknown): HomeActionLink {
  if (!raw || typeof raw !== "object") return emptyHomeAction;
  const a = raw as Partial<HomeActionLink>;
  const type =
    a.type &&
    ["NONE", "PAGE", "ACTIVITY", "ARTICLE", "WECHAT_ARTICLE", "POPUP"].includes(
      a.type,
    )
      ? a.type
      : "NONE";
  return {
    type,
    page: typeof a.page === "string" ? a.page : "",
    activityId: typeof a.activityId === "string" ? a.activityId : "",
    articleId: typeof a.articleId === "string" ? a.articleId : "",
    wechatArticleUrl: safeWechatArticleUrl(a.wechatArticleUrl || ""),
    popupTitle: typeof a.popupTitle === "string" ? a.popupTitle : "",
    popupText: typeof a.popupText === "string" ? a.popupText : "",
    popupImages: sanitizeQrList(a.popupImages),
  };
}

export function isPublicHomeLayout(
  value: unknown,
): value is PublicHomeLayoutPayload {
  return (
    !!value &&
    typeof value === "object" &&
    !!(value as PublicHomeLayoutPayload).layout &&
    Array.isArray((value as PublicHomeLayoutPayload).layout.modules)
  );
}

export function normalizePublicHomeLayout(payload: PublicHomeLayoutPayload) {
  const raw = payload.layout;
  const allowedIds: HomeModuleId[] = [
    "HERO",
    "SHORTCUTS",
    "ACTIVITIES",
    "SHOP",
    "GALLERY",
    "FOOTER",
  ];
  const seen = new Set<HomeModuleId>();
  const modules: HomeModuleEntry[] = [];
  for (const m of raw.modules || []) {
    if (
      m &&
      allowedIds.includes(m.id as HomeModuleId) &&
      !seen.has(m.id as HomeModuleId)
    ) {
      seen.add(m.id as HomeModuleId);
      modules.push({ id: m.id as HomeModuleId, enabled: m.enabled !== false });
    }
  }
  for (const fallbackId of allowedIds) {
    if (!seen.has(fallbackId)) modules.push({ id: fallbackId, enabled: true });
  }

  const heroImg =
    (raw.hero?.imageUrl && safeShortcutImage(raw.hero.imageUrl)) ||
    defaultHeroView.imageUrl;
  const hero: HomeHeroView = {
    imageUrl: heroImg,
    brandName:
      typeof raw.hero?.brandName === "string"
        ? raw.hero.brandName
        : defaultHeroView.brandName,
    brandCaption:
      typeof raw.hero?.brandCaption === "string"
        ? raw.hero.brandCaption
        : defaultHeroView.brandCaption,
    kicker:
      typeof raw.hero?.kicker === "string"
        ? raw.hero.kicker
        : defaultHeroView.kicker,
    title:
      typeof raw.hero?.title === "string"
        ? raw.hero.title
        : defaultHeroView.title,
    subtitle:
      typeof raw.hero?.subtitle === "string"
        ? raw.hero.subtitle
        : defaultHeroView.subtitle,
    action: sanitizeAction(raw.hero?.action),
  };

  const columns =
    raw.shortcuts?.columns && [2, 3, 4].includes(raw.shortcuts.columns)
      ? raw.shortcuts.columns
      : 4;
  const shortcutItems: HomeShortcutView[] = Array.isArray(raw.shortcuts?.items)
    ? raw.shortcuts!.items.map((item, idx) => {
        const icon =
          item.icon && Object.prototype.hasOwnProperty.call(shortcutIcons, item.icon)
            ? item.icon
            : "WEEKLY";
        const customImg = item.imageUrl ? safeShortcutImage(item.imageUrl) : "";
        const popupImgs = sanitizeQrList(item.popupImages);
        const legacyImg = item.popupImageUrl
          ? safeShortcutImage(item.popupImageUrl)
          : "";
        if (item.popupImages == null && legacyImg) {
          popupImgs.push({ url: legacyImg, label: "" });
        }
        const type =
          item.type &&
          ["PAGE", "ACTIVITY", "ARTICLE", "WECHAT_ARTICLE", "POPUP"].includes(
            item.type,
          )
            ? item.type
            : "PAGE";
        return {
          slot: idx + 1,
          id: typeof item.id === "string" && item.id ? item.id : `slot-${idx + 1}`,
          name: typeof item.name === "string" ? item.name : "",
          icon,
          image: customImg || shortcutIcons[icon] || shortcutIcons.WEEKLY,
          type,
          page: typeof item.page === "string" ? item.page : "",
          activityId: typeof item.activityId === "string" ? item.activityId : "",
          articleId: typeof item.articleId === "string" ? item.articleId : "",
          wechatArticleUrl: safeWechatArticleUrl(item.wechatArticleUrl || ""),
          popupTitle: typeof item.popupTitle === "string" ? item.popupTitle : "",
          popupText: typeof item.popupText === "string" ? item.popupText : "",
          popupImageUrl: popupImgs[0]?.url || "",
          popupImages: popupImgs,
        };
      })
    : defaultShortcutViews.map((x) => ({
        ...x,
        id: `slot-${x.slot}`,
        activityId: "",
        wechatArticleUrl: "",
        popupImages: x.popupImageUrl
          ? [{ url: x.popupImageUrl, label: "" }]
          : [],
      }));

  const activitiesHeader: HomeActivitiesHeader = {
    eyebrow:
      typeof raw.activities?.eyebrow === "string"
        ? raw.activities.eyebrow
        : defaultActivitiesHeader.eyebrow,
    title:
      typeof raw.activities?.title === "string" && raw.activities.title.trim()
        ? raw.activities.title
        : defaultActivitiesHeader.title,
    showAllLink: raw.activities?.showAllLink !== false,
    maxCount:
      typeof raw.activities?.maxCount === "number" &&
      raw.activities.maxCount >= 1 &&
      raw.activities.maxCount <= 12
        ? raw.activities.maxCount
        : 6,
    autoFill: raw.activities?.autoFill !== false,
  };

  const bannerImg =
    (raw.shop?.bannerImageUrl && safeShortcutImage(raw.shop.bannerImageUrl)) ||
    defaultShopView.bannerImageUrl;
  const shopView: HomeShopView = {
    showBanner: raw.shop?.showBanner !== false,
    bannerImageUrl: bannerImg,
    bannerTag:
      typeof raw.shop?.bannerTag === "string"
        ? raw.shop.bannerTag
        : defaultShopView.bannerTag,
    bannerTitle:
      typeof raw.shop?.bannerTitle === "string"
        ? raw.shop.bannerTitle
        : defaultShopView.bannerTitle,
    bannerCta:
      typeof raw.shop?.bannerCta === "string"
        ? raw.shop.bannerCta
        : defaultShopView.bannerCta,
    showProducts: raw.shop?.showProducts !== false,
    maxCount:
      typeof raw.shop?.maxCount === "number" &&
      raw.shop.maxCount >= 1 &&
      raw.shop.maxCount <= 8
        ? raw.shop.maxCount
        : 4,
  };

  const slides: HomeGallerySlideView[] = Array.isArray(raw.gallery?.slides)
    ? raw.gallery!.slides
        .map((s, idx) => {
          const mediaType: HomeGalleryMediaType =
            s?.mediaType === "VIDEO" || s?.mediaType === "ARTICLE"
              ? s.mediaType
              : "IMAGE";
          const img = s?.imageUrl ? safeShortcutImage(s.imageUrl) : "";
          const videoUrl =
            mediaType === "VIDEO" && s?.videoUrl
              ? safeGalleryVideo(s.videoUrl)
              : "";
          if (mediaType === "VIDEO") {
            if (!videoUrl) return null;
          } else if (!img) {
            return null;
          }
          return {
            id: typeof s.id === "string" && s.id ? s.id : `slide-${idx + 1}`,
            mediaType,
            imageUrl: img,
            videoUrl,
            title: typeof s.title === "string" ? s.title : "",
            subtitle: typeof s.subtitle === "string" ? s.subtitle : "",
            action: sanitizeAction(s.action),
          };
        })
        .filter((x): x is HomeGallerySlideView => x !== null)
    : [];
  const galleryView: HomeGalleryView = {
    eyebrow:
      typeof raw.gallery?.eyebrow === "string"
        ? raw.gallery.eyebrow
        : defaultGalleryView.eyebrow,
    title:
      typeof raw.gallery?.title === "string" && raw.gallery.title.trim()
        ? raw.gallery.title
        : defaultGalleryView.title,
    mode: raw.gallery?.mode === "CUSTOM" ? "CUSTOM" : "AUTO_ARTICLES",
    slides,
  };

  const rawBrandUrl = raw.footer?.brandImageUrl || "";
  const brandImageUrl =
    rawBrandUrl === defaultFooterView.brandImageUrl
      ? defaultFooterView.brandImageUrl
      : safeShortcutImage(rawBrandUrl) || defaultFooterView.brandImageUrl;
  const rawWidth = Number(raw.footer?.brandWidthPx || 216);
  const brandWidthPx = Number.isFinite(rawWidth)
    ? Math.max(80, Math.min(360, Math.round(rawWidth)))
    : 216;
  const footerColumns = normalizeFooterColumns(raw.footer?.columns);
  const footerConfig: Omit<HomeFooterView, "cells" | "gridStyle" | "previewUrls"> = {
    cellOrder: normalizeFooterOrder(raw.footer?.cellOrder),
    layoutPreset: normalizeFooterPreset(raw.footer?.layoutPreset),
    colRatio: normalizeFooterRatio(raw.footer?.colRatio),
    rowRatio: normalizeFooterRatio(raw.footer?.rowRatio),
    columns: footerColumns,
    colRatios: normalizeFooterColRatios(raw.footer?.colRatios, footerColumns),
    blocks: Array.isArray(raw.footer?.blocks) ? raw.footer!.blocks : undefined,
    followEnabled: Boolean(raw.footer?.followEnabled),
    followTitle:
      typeof raw.footer?.followTitle === "string"
        ? raw.footer.followTitle.trim()
        : defaultFooterView.followTitle,
    followSubtitle:
      typeof raw.footer?.followSubtitle === "string"
        ? raw.footer.followSubtitle.trim()
        : defaultFooterView.followSubtitle,
    followQrcodes: sanitizeQrList(raw.footer?.followQrcodes),
    brandEnabled: raw.footer?.brandEnabled !== false,
    brandImageUrl,
    brandWidthPx,
  };
  const resolvedFooterCells = footerCells(footerConfig);

  return {
    modules,
    hero,
    shortcutColumns: columns,
    shortcuts: shortcutItems,
    activitiesHeader,
    shop: shopView,
    gallery: galleryView,
    footer: {
      ...footerConfig,
      cells: resolvedFooterCells,
      gridStyle: footerGridStyle(footerConfig, resolvedFooterCells),
      previewUrls: footerPreviewUrls(resolvedFooterCells),
    },
  };
}
