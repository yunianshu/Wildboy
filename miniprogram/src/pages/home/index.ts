import { config } from "../../config";
import { request, mediaUrl } from "../../utils/api";
import { Home, Activity, PageResult } from "../../utils/models";
import { message, RequestEpoch, safeId } from "../../utils/domain";
import {
  HOME_ACTIVITY_COUNT,
  homeActivitySlots,
  homeEntries,
} from "../../utils/home";
import { ArticleSummary } from "../../utils/articles";
import {
  ShortcutConfig,
  shortcutViews,
  shortcutPages,
} from "../../utils/home-shortcuts";
const shortcutEpoch = new RequestEpoch();
const tapEpoch = new RequestEpoch();
const epoch = new RequestEpoch();
const articleEpoch = new RequestEpoch();
Page({
  data: {
    devMode: false,
    topInset: 48,
    home: null as Home | null,
    categories: shortcutViews({ version: 0, items: homeEntries }),
    shortcutLoading: true,
    shortcutError: "",
    shortcutBusy: false,
    popup: null as null | { title: string; text: string; image: string },
    popupImageError: false,
    popupGeneration: 0,
    items: [] as ReturnType<typeof homeActivitySlots>,
    articles: [] as ArticleSummary[],
    articleLoading: false,
    articleError: "",
    loading: false,
    error: "",
  },
  onLoad() {
    this.setData({
      devMode:
        config.devLogin &&
        wx.getAccountInfoSync().miniProgram.envVersion === "develop",
      topInset: wx.getWindowInfo().statusBarHeight + 12,
    });
    void this.load();
  },
  onShow() {
    if (this._shown) {
      void this.loadArticles();
      void this.loadShortcuts();
    }
    this._shown = true;
  },
  _shown: false,
  onHide() {
    shortcutEpoch.invalidate();
    tapEpoch.invalidate();
    this.setData({ popup: null, shortcutBusy: false });
  },
  onUnload() {
    shortcutEpoch.invalidate();
    tapEpoch.invalidate();
    articleEpoch.invalidate();
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    void this.loadArticles();
    void this.loadShortcuts();
    const n = epoch.next();
    this.setData({
      loading: true,
      error: "",
      home: null,
      items: [],
    });
    try {
      const [home, page] = await Promise.all([
        request<Home>("/home"),
        request<PageResult<Activity>>(
          `/activities?page=0&size=${HOME_ACTIVITY_COUNT}`,
        ),
      ]);
      if (!epoch.valid(n)) return;
      this.setData({
        home: {
          ...home,
          banners: home.banners.map((x) => ({
            ...x,
            imageUrl: mediaUrl(x.imageUrl),
          })),
          equipment: home.equipment.map((x) => ({
            ...x,
            imageUrl: mediaUrl(x.imageUrl),
          })),
        },
        items: homeActivitySlots(
          page.items.map((x) => ({ ...x, coverUrl: mediaUrl(x.coverUrl) })),
        ),
      });
    } catch (e) {
      if (epoch.valid(n)) this.setData({ error: message(e) });
    } finally {
      if (epoch.valid(n)) this.setData({ loading: false });
    }
  },
  async loadArticles() {
    const n = articleEpoch.next();
    this.setData({ articles: [], articleLoading: true, articleError: "" });
    try {
      const page = await request<PageResult<ArticleSummary>>(
        "/articles?page=0&size=10",
      );
      if (!articleEpoch.valid(n)) return;
      this.setData({
        articles: page.items
          .filter((x) => !x.isOfficial)
          .map((x) => ({ ...x, coverUrl: mediaUrl(x.coverUrl || "") })),
      });
    } catch (e) {
      if (articleEpoch.valid(n)) this.setData({ articleError: message(e) });
    } finally {
      if (articleEpoch.valid(n)) this.setData({ articleLoading: false });
    }
  },
  retryArticles() {
    void this.loadArticles();
  },
  openArticle(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/article/index?id=${id}` });
  },
  retry() {
    void this.load();
  },
  openActivity(e: WechatMiniprogram.TouchEvent) {
    const id = safeId(e.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
  },
  async loadShortcuts() {
    const n = shortcutEpoch.next();
    tapEpoch.invalidate();
    this.setData({
      shortcutLoading: true,
      shortcutError: "",
      popup: null,
      shortcutBusy: false,
    });
    try {
      const config = await request<ShortcutConfig>("/home/shortcuts");
      if (!shortcutEpoch.valid(n)) return;
      this.setData({ categories: shortcutViews(config) });
    } catch (e) {
      if (shortcutEpoch.valid(n)) this.setData({ shortcutError: message(e) });
    } finally {
      if (shortcutEpoch.valid(n)) this.setData({ shortcutLoading: false });
    }
  },
  retryShortcuts() {
    void this.loadShortcuts();
  },
  async openCategory(e: WechatMiniprogram.TouchEvent) {
    if (
      this.data.shortcutLoading ||
      this.data.shortcutError ||
      this.data.shortcutBusy ||
      this.data.popup
    )
      return;
    const entry = this.data.categories.find(
      (x) => x.slot === Number(e.currentTarget.dataset.slot),
    );
    if (!entry) return;
    if (entry.type === "POPUP") {
      this.setData({
        popup: {
          title: entry.popupTitle || entry.name,
          text: entry.popupText,
          image: entry.popupImageUrl,
        },
        popupImageError: false,
        popupGeneration: this.data.popupGeneration + 1,
      });
      return;
    }
    if (entry.type === "PAGE") {
      const url = shortcutPages[entry.page];
      if (!url) return;
      if (["WEEKLY", "DOMESTIC", "ACTIVITIES"].includes(entry.page))
        wx.setStorageSync(
          "wildboy-category",
          entry.page === "ACTIVITIES" ? "ALL" : entry.page,
        );
      this.setData({ shortcutBusy: true });
      wx.switchTab({
        url,
        complete: () => this.setData({ shortcutBusy: false }),
      });
      return;
    }
    const n = tapEpoch.next();
    this.setData({ shortcutBusy: true });
    try {
      if (!entry.articleId) throw new Error("文章已下架或尚未配置");
      const official = entry.articleId === "OFFICIAL";
      await request(
        official ? "/articles/official" : `/articles/${entry.articleId}`,
      );
      if (!tapEpoch.valid(n)) return;
      wx.navigateTo({
        url: official
          ? "/pages/article/index?official=1"
          : `/pages/article/index?id=${entry.articleId}`,
        complete: () => {
          if (tapEpoch.valid(n)) this.setData({ shortcutBusy: false });
        },
      });
    } catch (e) {
      if (tapEpoch.valid(n)) {
        this.setData({ shortcutBusy: false });
        wx.showToast({ title: message(e), icon: "none" });
      }
    }
  },
  closePopup() {
    this.setData({ popup: null, popupImageError: false });
  },
  keepPopup() {},
  popupImageFailed(e: WechatMiniprogram.CustomEvent) {
    if (
      this.data.popup &&
      Number(e.currentTarget.dataset.generation) === this.data.popupGeneration
    )
      this.setData({ popupImageError: true });
  },
  allActivities() {
    wx.setStorageSync("wildboy-category", "ALL");
    wx.switchTab({ url: "/pages/activities/index" });
  },
  equipmentInfo() {
    wx.switchTab({ url: "/pages/shop/index" });
  },
  openProduct(event: WechatMiniprogram.TouchEvent) {
    const id = safeId(event.currentTarget.dataset.id);
    if (id) wx.navigateTo({ url: `/pages/product/index?id=${id}` });
  },
});
