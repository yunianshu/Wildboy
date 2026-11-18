import { config } from "../../config";
import { request, mediaUrl } from "../../utils/api";
import { Home, Activity, PageResult } from "../../utils/models";
import { message, RequestEpoch, safeId } from "../../utils/domain";
import {
  fallbackBanners,
  HOME_ACTIVITY_COUNT,
  homeActivitySlots,
  homeEquipmentSlots,
} from "../../utils/home";
import { ArticleSummary } from "../../utils/articles";
import {
  ShortcutConfig,
  shortcutViews,
  shortcutPages,
  defaultShortcutViews,
} from "../../utils/home-shortcuts";
import { syncTabBar } from "../../utils/tab-bar";
import { resetTabSwipe, tabSwipeHandlers } from "../../utils/tab-swipe";
import { enterPage } from "../../utils/page-motion";

const shortcutEpoch = new RequestEpoch();
const tapEpoch = new RequestEpoch();
const epoch = new RequestEpoch();
const equipmentEpoch = new RequestEpoch();
const articleEpoch = new RequestEpoch();

Page({
  ...tabSwipeHandlers,
  data: {
    pageMotionClass: "",
    devMode: false,
    topInset: 48,
    equipment: [] as ReturnType<typeof homeEquipmentSlots>,
    equipmentLoading: false,
    equipmentError: "",
    banners: fallbackBanners,
    categories: defaultShortcutViews,
    shortcutLoading: true,
    shortcutError: "",
    shortcutBusy: false,
    popup: null as null | { title: string; text: string; image: string },
    popupImageError: false,
    popupGeneration: 0,
    popupBodyHeight: 0,
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
    enterPage(this);
    syncTabBar(this);
    if (this._shown) {
      void this.load();
    }
    this._shown = true;
  },
  _shown: false,
  _popupSizeRequest: 0,
  _popupDisposed: false,
  onHide() {
    this._popupSizeRequest++;
    resetTabSwipe(this);
    shortcutEpoch.invalidate();
    tapEpoch.invalidate();
    this.setData({ popup: null, shortcutBusy: false });
  },
  onUnload() {
    this._popupDisposed = true;
    this._popupSizeRequest++;
    resetTabSwipe(this);
    shortcutEpoch.invalidate();
    tapEpoch.invalidate();
    articleEpoch.invalidate();
    equipmentEpoch.invalidate();
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    await Promise.all([
      this.loadArticles(),
      this.loadShortcuts(),
      this.loadEquipment(),
      this.loadActivities(),
    ]);
  },
  async loadActivities() {
    const n = epoch.next();
    this.setData({
      loading: true,
      error: "",
      items: [],
    });
    try {
      const page = await request<PageResult<Activity>>(
        `/activities?page=0&size=${HOME_ACTIVITY_COUNT}`,
      );
      if (!epoch.valid(n)) return;
      this.setData({
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
  async loadEquipment() {
    const n = equipmentEpoch.next();
    this.setData({ equipmentLoading: true, equipmentError: "" });
    try {
      const home = await request<Home>("/home");
      if (!equipmentEpoch.valid(n)) return;
      this.setData({
        equipment: homeEquipmentSlots(home.equipment).map((item) => ({
          ...item,
          imageUrl: mediaUrl(item.imageUrl),
        })),
        banners: home.banners.length
          ? home.banners.map((item) => ({
              ...item,
              imageUrl: mediaUrl(item.imageUrl),
            }))
          : fallbackBanners,
      });
    } catch (e) {
      if (equipmentEpoch.valid(n)) this.setData({ equipmentError: message(e) });
    } finally {
      if (equipmentEpoch.valid(n)) this.setData({ equipmentLoading: false });
    }
  },
  retryEquipment() {
    return this.loadEquipment();
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
  openGalleryItem(e: WechatMiniprogram.TouchEvent) {
    if (e.currentTarget.dataset.article) this.openArticle(e);
    else this.openActivity(e);
  },
  retry() {
    void this.loadActivities();
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
          title: entry.popupTitle.trim(),
          text: entry.popupText.trim(),
          image: entry.popupImageUrl,
        },
        popupImageError: false,
        popupGeneration: this.data.popupGeneration + 1,
        popupBodyHeight: 0,
      }, () => this.resizePopup());
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
    this._popupSizeRequest++;
    this.setData({ popup: null, popupImageError: false, popupBodyHeight: 0 });
  },
  keepPopup() {},
  resizePopup(e?: WechatMiniprogram.CustomEvent) {
    const generation = this.data.popupGeneration;
    if (this._popupDisposed || !this.data.popup || (e && Number(e.currentTarget.dataset.generation) !== generation)) return;
    if (typeof wx.createSelectorQuery !== "function") return;
    const request = ++this._popupSizeRequest;
    const query = wx.createSelectorQuery().in(this);
    query.select(".shortcut-content").boundingClientRect();
    query.select(".shortcut-heading").boundingClientRect();
    query.exec((rects) => {
      if (!this.data.popup || this.data.popupGeneration !== generation || this._popupSizeRequest !== request) return;
      const content = rects[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
      const heading = rects[1] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
      if (!content || !Number.isFinite(content.height) || content.height <= 0) return;
      const maxHeight = Math.max(1, Math.floor(wx.getWindowInfo().windowHeight * 0.8) - 44 - (heading?.height || 44));
      this.setData({ popupBodyHeight: Math.min(Math.ceil(content.height), maxHeight) });
    });
  },
  onResize() {
    this.resizePopup();
  },
  popupImageFailed(e: WechatMiniprogram.CustomEvent) {
    if (
      !this._popupDisposed && this.data.popup &&
      Number(e.currentTarget.dataset.generation) === this.data.popupGeneration
    )
      this.setData({ popupImageError: true }, () => this.resizePopup());
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
