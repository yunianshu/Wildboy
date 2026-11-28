import { mediaUrl } from "./api";
export type Shortcut = {
  slot: number;
  name: string;
  icon: string;
  type: "PAGE" | "ARTICLE" | "POPUP";
  page: string;
  articleId: string;
  popupTitle: string;
  popupText: string;
  popupImageUrl: string;
};
export type ShortcutConfig = { version: number; items: Shortcut[] };
export const shortcutIcons: Record<string, string> = {
  WEEKLY: "/assets/category-weekly.jpg",
  DOMESTIC: "/assets/category-domestic.jpg",
  QRCODE: "/assets/category-holiday.jpg",
  INTRO: "/assets/category-leisure.jpg",
};
export const shortcutPages: Record<string, string> = {
  WEEKLY: "/pages/activities/index",
  DOMESTIC: "/pages/activities/index",
  HOLIDAY: "/pages/activities/index",
  LEISURE: "/pages/activities/index",
  ACTIVITIES: "/pages/activities/index",
  SHOP: "/pages/shop/index",
  PROFILE: "/pages/mine/index",
};
export const defaultShortcuts: Shortcut[] = [
  { slot: 1, name: "本周活动", icon: "WEEKLY", type: "PAGE", page: "WEEKLY" },
  {
    slot: 2,
    name: "国内游行",
    icon: "DOMESTIC",
    type: "PAGE",
    page: "DOMESTIC",
  },
  {
    slot: 3,
    name: "二维码",
    icon: "QRCODE",
    type: "POPUP",
    popupTitle: "二维码",
  },
  {
    slot: 4,
    name: "野小子",
    icon: "INTRO",
    type: "ARTICLE",
    articleId: "OFFICIAL",
  },
].map(
  (x) =>
    ({
      page: "",
      articleId: "",
      popupTitle: "",
      popupText: "",
      popupImageUrl: "",
      ...x,
    }) as Shortcut,
);
export function safeShortcutImage(value: string): string {
  // Keep this consistent with server image validation. No schemes, protocol-relative URLs or arbitrary local routes.
  if (
    /^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:png|jpg|jpeg|webp)$/.test(
      value,
    )
  )
    return mediaUrl(value);
  if (
    /^https:\/\/[^\s<>"'\\]+$/.test(value) &&
    !value.includes("@") &&
    value.length <= 2048
  )
    return value;
  return "";
}
export function safeGalleryVideo(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    /^\/assets\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.(?:mp4|mov|m4v|webm)$/.test(
      trimmed,
    )
  )
    return mediaUrl(trimmed);
  if (
    /^https:\/\/[^\s<>"'\\]+$/.test(trimmed) &&
    !trimmed.includes("@") &&
    trimmed.length <= 2048
  )
    return trimmed;
  return "";
}
export function safeWechatArticleUrl(value: string): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (
    trimmed.length > 2048 ||
    /[\s<>"'\\@]/.test(trimmed) ||
    !(
      trimmed.startsWith("https://mp.weixin.qq.com/s/") ||
      trimmed.startsWith("https://mp.weixin.qq.com/s?")
    )
  )
    return "";
  return trimmed;
}
export function safeAboutArticleId(value: unknown): string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : "";
}
export function aboutArticlePath(rawUrl: string, articleId?: string): string {
  const url = safeWechatArticleUrl(rawUrl);
  const id = safeAboutArticleId(articleId);
  return "/pages/article/index?about=1"
    + (url ? "&source=" + encodeURIComponent(url) : "")
    + (id ? "&content=" + id : "");
}
export function openWechatOfficialArticle(rawUrl: string): boolean {
  const url = safeWechatArticleUrl(rawUrl);
  if (!url) {
    wx.showToast({ title: "公众号文章链接无效", icon: "none" });
    return false;
  }
  const fallbackCopy = () => {
    if (typeof wx.showModal === "function") {
      wx.showModal({
        title: "打开公众号文章",
        content: "当前微信版本暂不支持内嵌打开，是否复制文章链接到微信聊天中查看？",
        confirmText: "复制链接",
        success: (res) => {
          if (res.confirm && typeof wx.setClipboardData === "function") {
            wx.setClipboardData({ data: url });
          }
        },
      });
    } else if (typeof wx.showToast === "function") {
      wx.showToast({ title: "请升级微信版本后查看公众号文章", icon: "none" });
    }
  };
  if (typeof wx.openOfficialAccountArticle === "function") {
    wx.openOfficialAccountArticle({
      url,
      fail: () => fallbackCopy(),
    });
    return true;
  }
  fallbackCopy();
  return false;
}
export function shortcutViews(config: ShortcutConfig) {
  if (
    !config ||
    !Number.isSafeInteger(config.version) ||
    config.version < 0 ||
    !Array.isArray(config.items) ||
    config.items.length !== 4
  )
    throw new Error("首页入口配置无效");
  const items = [...config.items].sort((a, b) => a.slot - b.slot);
  return items.map((x, i) => {
    if (
      !x ||
      x.slot !== i + 1 ||
      typeof x.name !== "string" ||
      !x.name.trim() ||
      x.name.length > 12 ||
      !Object.prototype.hasOwnProperty.call(shortcutIcons, x.icon) ||
      !["PAGE", "ARTICLE", "POPUP"].includes(x.type)
    )
      throw new Error("首页入口配置无效");
    if (
      x.type === "PAGE" &&
      !Object.prototype.hasOwnProperty.call(shortcutPages, x.page)
    )
      throw new Error("首页入口配置无效");
    if (
      x.type === "ARTICLE" &&
      x.articleId !== "" &&
      x.articleId !== "OFFICIAL" &&
      !/^[a-zA-Z0-9_-]{1,64}$/.test(x.articleId)
    )
      throw new Error("首页入口配置无效");
    if (
      ["popupTitle", "popupText", "popupImageUrl", "articleId", "page"].some(
        (key) => typeof x[key as keyof Shortcut] !== "string",
      )
    )
      throw new Error("首页入口配置无效");
    return {
      ...x,
      image: shortcutIcons[x.icon],
      popupImageUrl: safeShortcutImage(x.popupImageUrl),
    };
  });
}

// Pre-rendered defaults ship with the bundle so the first paint never waits on
// the shortcuts request; server refreshes replace them once they arrive.
export const defaultShortcutViews: ReturnType<typeof shortcutViews> =
  shortcutViews({ version: 0, items: defaultShortcuts });
