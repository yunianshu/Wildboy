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
