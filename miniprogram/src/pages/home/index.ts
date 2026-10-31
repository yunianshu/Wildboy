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
const epoch = new RequestEpoch();
const articleEpoch = new RequestEpoch();
Page({
  data: {
    devMode: false,
    topInset: 48,
    home: null as Home | null,
    categories: homeEntries,
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
    if (this._shown) void this.loadArticles();
    this._shown = true;
  },
  _shown: false,
  onUnload() {
    articleEpoch.invalidate();
    epoch.invalidate();
  },
  onPullDownRefresh() {
    void this.load().finally(() => wx.stopPullDownRefresh());
  },
  async load() {
    void this.loadArticles();
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
  openCategory(e: WechatMiniprogram.TouchEvent) {
    const category = e.currentTarget.dataset.code;
    if (category === "INTRO") {
      wx.navigateTo({ url: "/pages/article/index?official=1" });
      return;
    }
    if (!homeEntries.some((entry) => entry.code === category)) return;
    wx.setStorageSync("wildboy-category", category);
    wx.switchTab({ url: "/pages/activities/index" });
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
