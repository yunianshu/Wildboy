import { Activity, Home } from "./models";
import {
  defaultShortcutViews,
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

export interface HomeGallerySlideView {
  id: string;
  imageUrl: string;
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

export interface HomeFooterView {
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

export const defaultFooterView: HomeFooterView = {
  followEnabled: false,
  followTitle: "关注野小子",
  followSubtitle: "长按识别二维码 · 获取最新山野路线与动态",
  followQrcodes: [],
  brandEnabled: true,
  brandImageUrl: "/assets/platform-brand-original-transparent.png",
  brandWidthPx: 216,
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
          const img = s?.imageUrl ? safeShortcutImage(s.imageUrl) : "";
          if (!img) return null;
          return {
            id: typeof s.id === "string" && s.id ? s.id : `slide-${idx + 1}`,
            imageUrl: img,
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
  const footerView: HomeFooterView = {
    followEnabled: Boolean(raw.footer?.followEnabled),
    followTitle:
      typeof raw.footer?.followTitle === "string"
        ? raw.footer.followTitle
        : defaultFooterView.followTitle,
    followSubtitle:
      typeof raw.footer?.followSubtitle === "string"
        ? raw.footer.followSubtitle
        : defaultFooterView.followSubtitle,
    followQrcodes: sanitizeQrList(raw.footer?.followQrcodes),
    brandEnabled: raw.footer?.brandEnabled !== false,
    brandImageUrl,
    brandWidthPx,
  };

  return {
    modules,
    hero,
    shortcutColumns: columns,
    shortcuts: shortcutItems,
    activitiesHeader,
    shop: shopView,
    gallery: galleryView,
    footer: footerView,
  };
}
