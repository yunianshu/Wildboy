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
  openWechatOfficialArticle,
} from "../../utils/home-shortcuts";
import {
  defaultActivitiesHeader,
  defaultFooterView,
  defaultGalleryView,
  defaultHeroView,
  defaultHomeModules,
  defaultShopView,
  HomeActionLink,
  HomeQrImage,
  HomeShortcutView,
  isPublicHomeLayout,
  normalizePublicHomeLayout,
} from "../../utils/home-layout";
import { syncTabBar } from "../../utils/tab-bar";
import { resetTabSwipe, tabSwipeHandlers } from "../../utils/tab-swipe";
import { enterPage } from "../../utils/page-motion";

const layoutEpoch = new RequestEpoch();
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
    modules: defaultHomeModules,
    hero: defaultHeroView,
    shortcutColumns: 4,
    activitiesHeader: defaultActivitiesHeader,
    shopConfig: defaultShopView,
    galleryConfig: defaultGalleryView,
    footer: defaultFooterView,
    equipment: [] as ReturnType<typeof homeEquipmentSlots>,
    equipmentLoading: false,
    equipmentError: "",
    banners: fallbackBanners,
    categories: defaultShortcutViews as Array<
      ((typeof defaultShortcutViews)[number] & Partial<HomeShortcutView>) | HomeShortcutView
    >,
    shortcutLoading: true,
    shortcutError: "",
    shortcutBusy: false,
    popup: null as null | { title: string; text: string; image: string },
    popupImages: [] as HomeQrImage[],
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
  _layoutManaged: false,
  _popupSizeRequest: 0,
  _popupDisposed: false,
  onHide() {
    this._popupSizeRequest++;
    resetTabSwipe(this);
    layoutEpoch.invalidate();
    shortcutEpoch.invalidate();
    tapEpoch.invalidate();
    this.setData({ popup: null, popupImages: [], shortcutBusy: false });
  },
  onUnload() {
    this._popupDisposed = true;
    this._popupSizeRequest++;
    resetTabSwipe(this);
    layoutEpoch.invalidate();
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
    await Promise.all([this.loadHomeSections(), this.loadArticles()]);
  },
  async loadHomeSections() {
    const n = layoutEpoch.next();
    await this.loadLayout(n);
    if (!layoutEpoch.valid(n)) return;
    if (this._layoutManaged) {
      if (this.data.galleryConfig.mode === "AUTO_ARTICLES") {
        await this.loadEquipment(true);
      }
      return;
    }
    await Promise.all([this.loadShortcuts(), this.loadEquipment(), this.loadActivities()]);
  },
  async loadLayout(n: number) {
    try {
      const payload = await request<unknown>("/home/layout");
      if (!layoutEpoch.valid(n) || !isPublicHomeLayout(payload)) return;
      const normalized = normalizePublicHomeLayout(payload);
      const featuredActivities = Array.isArray(payload.featuredActivities)
        ? homeActivitySlots(
            payload.featuredActivities.map((x) => ({
              ...x,
              coverUrl: mediaUrl(x.coverUrl),
            })),
            normalized.activitiesHeader.maxCount,
          )
        : [];
      const featuredEquipment = Array.isArray(payload.featuredEquipment)
        ? homeEquipmentSlots(
            payload.featuredEquipment,
            normalized.shop.maxCount,
          ).map((item) => ({
            ...item,
            imageUrl: mediaUrl(item.imageUrl),
          }))
        : [];
      this._layoutManaged = true;
      epoch.invalidate();
      equipmentEpoch.invalidate();
      shortcutEpoch.invalidate();
      tapEpoch.invalidate();
      this.setData({
        modules: normalized.modules,
        hero: normalized.hero,
        shortcutColumns: normalized.shortcutColumns,
        categories: normalized.shortcuts,
        shortcutLoading: false,
        shortcutBusy: false,
        shortcutError: "",
        activitiesHeader: normalized.activitiesHeader,
        items: featuredActivities,
        loading: false,
        error: "",
        shopConfig: normalized.shop,
        equipment: featuredEquipment,
        equipmentLoading: false,
        equipmentError: "",
        galleryConfig: normalized.gallery,
        footer: normalized.footer,
        popup: null,
        popupImages: [],
      });
    } catch {
      // Keep the last valid layout, or use the legacy sections on a first load.
    }
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
  async loadEquipment(bannersOnly = false) {
    const n = equipmentEpoch.next();
    if (!bannersOnly) this.setData({ equipmentLoading: true, equipmentError: "" });
    try {
      const home = await request<Home>("/home");
      if (!equipmentEpoch.valid(n)) return;
      this.setData({
        ...(bannersOnly
          ? {}
          : {
              equipment: homeEquipmentSlots(home.equipment).map((item) => ({
                ...item,
                imageUrl: mediaUrl(item.imageUrl),
              })),
            }),
        banners: home.banners.length
          ? home.banners.map((item) => ({
              ...item,
              imageUrl: mediaUrl(item.imageUrl),
            }))
          : fallbackBanners,
      });
    } catch (e) {
      if (!bannersOnly && equipmentEpoch.valid(n)) this.setData({ equipmentError: message(e) });
    } finally {
      if (!bannersOnly && equipmentEpoch.valid(n)) this.setData({ equipmentLoading: false });
    }
  },
  retryEquipment() {
    return this._layoutManaged ? this.loadHomeSections() : this.loadEquipment();
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
    const slideIdx = e.currentTarget.dataset.slideIndex;
    if (slideIdx !== undefined && this.data.galleryConfig.mode === "CUSTOM") {
      const slide = this.data.galleryConfig.slides[Number(slideIdx)];
      if (slide) void this.dispatchAction(slide.action);
      return;
    }
    if (e.currentTarget.dataset.article) this.openArticle(e);
    else this.openActivity(e);
  },
  tapHero() {
    if (this.data.hero.action && this.data.hero.action.type !== "NONE") {
      void this.dispatchAction(this.data.hero.action);
    }
  },
  retry() {
    return this._layoutManaged ? this.loadHomeSections() : this.loadActivities();
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
      popupImages: [],
      shortcutBusy: false,
    });
    try {
      const cfg = await request<ShortcutConfig>("/home/shortcuts");
      if (!shortcutEpoch.valid(n)) return;
      this.setData({ categories: shortcutViews(cfg) });
    } catch (e) {
      if (shortcutEpoch.valid(n)) this.setData({ shortcutError: message(e) });
    } finally {
      if (shortcutEpoch.valid(n)) this.setData({ shortcutLoading: false });
    }
  },
  retryShortcuts() {
    return this._layoutManaged ? this.loadHomeSections() : this.loadShortcuts();
  },
  showPopupDialog(title: string, text: string, images: HomeQrImage[]) {
    const firstUrl = images[0]?.url || "";
    this.setData(
      {
        popup: {
          title: title.trim(),
          text: text.trim(),
          image: firstUrl,
        },
        popupImages: images,
        popupImageError: false,
        popupGeneration: this.data.popupGeneration + 1,
        popupBodyHeight: 0,
      },
      () => this.resizePopup(),
    );
  },
  async dispatchAction(action: HomeActionLink) {
    if (this.data.shortcutBusy || this.data.popup) return;
    if (action.type === "NONE") return;
    if (action.type === "WECHAT_ARTICLE") {
      openWechatOfficialArticle(action.wechatArticleUrl);
      return;
    }
    if (action.type === "POPUP") {
      this.showPopupDialog(
        action.popupTitle || "",
        action.popupText || "",
        action.popupImages || [],
      );
      return;
    }
    if (action.type === "ACTIVITY") {
      const id = safeId(action.activityId);
      if (id) wx.navigateTo({ url: `/pages/detail/index?id=${id}` });
      else wx.showToast({ title: "活动暂未开放", icon: "none" });
      return;
    }
    if (action.type === "PAGE") {
      const url = shortcutPages[action.page];
      if (!url) return;
      if (
        ["WEEKLY", "DOMESTIC", "HOLIDAY", "LEISURE", "ACTIVITIES"].includes(
          action.page,
        )
      ) {
        wx.setStorageSync(
          "wildboy-category",
          action.page === "ACTIVITIES" ? "ALL" : action.page,
        );
      }
      this.setData({ shortcutBusy: true });
      wx.switchTab({
        url,
        complete: () => this.setData({ shortcutBusy: false }),
      });
      return;
    }
    if (action.type === "ARTICLE") {
      const n = tapEpoch.next();
      this.setData({ shortcutBusy: true });
      try {
        if (!action.articleId) throw new Error("文章已下架或尚未配置");
        const official = action.articleId === "OFFICIAL";
        await request(
          official ? "/articles/official" : `/articles/${action.articleId}`,
        );
        if (!tapEpoch.valid(n)) return;
        wx.navigateTo({
          url: official
            ? "/pages/article/index?official=1"
            : `/pages/article/index?id=${action.articleId}`,
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
    }
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
    if (entry.type === "WECHAT_ARTICLE") {
      openWechatOfficialArticle(entry.wechatArticleUrl || "");
      return;
    }
    if (entry.type === "POPUP") {
      const imgs: HomeQrImage[] =
        Array.isArray(entry.popupImages) && entry.popupImages.length
          ? entry.popupImages
          : entry.popupImageUrl
            ? [{ url: entry.popupImageUrl, label: "" }]
            : [];
      this.showPopupDialog(entry.popupTitle, entry.popupText, imgs);
      return;
    }
    await this.dispatchAction({
      type: entry.type,
      page: entry.page || "",
      activityId: entry.activityId || "",
      articleId: entry.articleId || "",
      wechatArticleUrl: entry.wechatArticleUrl || "",
      popupTitle: entry.popupTitle || "",
      popupText: entry.popupText || "",
      popupImages: entry.popupImages || [],
    });
  },
  previewPopupQr(e: WechatMiniprogram.TouchEvent) {
    const current = String(e.currentTarget.dataset.url || "");
    if (!current || typeof wx.previewImage !== "function") return;
    const urls = this.data.popupImages.map((x) => x.url);
    if (urls.length) wx.previewImage({ current, urls });
  },
  previewFollowQr(e: WechatMiniprogram.TouchEvent) {
    const current = String(e.currentTarget.dataset.url || "");
    if (!current || typeof wx.previewImage !== "function") return;
    const urls = this.data.footer.followQrcodes.map((x) => x.url);
    if (urls.length) wx.previewImage({ current, urls });
  },
  closePopup() {
    this._popupSizeRequest++;
    this.setData({
      popup: null,
      popupImages: [],
      popupImageError: false,
      popupBodyHeight: 0,
    });
  },
  keepPopup() {},
  resizePopup(e?: WechatMiniprogram.CustomEvent) {
    const generation = this.data.popupGeneration;
    if (
      this._popupDisposed ||
      !this.data.popup ||
      (e && Number(e.currentTarget.dataset.generation) !== generation)
    )
      return;
    if (typeof wx.createSelectorQuery !== "function") return;
    const reqId = ++this._popupSizeRequest;
    const query = wx.createSelectorQuery().in(this);
    query.select(".shortcut-content").boundingClientRect();
    query.select(".shortcut-heading").boundingClientRect();
    query.exec((rects) => {
      if (
        !this.data.popup ||
        this.data.popupGeneration !== generation ||
        this._popupSizeRequest !== reqId
      )
        return;
      const content =
        rects[0] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
      const heading =
        rects[1] as WechatMiniprogram.BoundingClientRectCallbackResult | null;
      if (!content || !Number.isFinite(content.height) || content.height <= 0)
        return;
      const maxHeight = Math.max(
        1,
        Math.floor(wx.getWindowInfo().windowHeight * 0.8) -
          44 -
          (heading?.height || 44),
      );
      this.setData({
        popupBodyHeight: Math.min(Math.ceil(content.height), maxHeight),
      });
    });
  },
  onResize() {
    this.resizePopup();
  },
  popupImageFailed(e: WechatMiniprogram.CustomEvent) {
    if (
      !this._popupDisposed &&
      this.data.popup &&
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
